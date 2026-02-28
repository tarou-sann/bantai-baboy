import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { X } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Detection {
  box: [number, number, number, number];
  behavior: string;
  confidence: number;
  pig_id?: number;
}

interface LiveDetectionResponse {
  detections: Detection[];
  frame_width: number;
  frame_height: number;
  fps?: number;
}

const SERVER_URL = "http://192.168.0.102:5000";

export default function LiveCamera() {
  const [permission, requestPermission] = useCameraPermissions();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fps, setFps] = useState(0);
  const [frameSize, setFrameSize] = useState({ width: 640, height: 480 });
  const [latency, setLatency] = useState(0);
  const cameraRef = useRef<any>(null);
  const processingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());

  const captureAndAnalyze = useCallback(async () => {
    if (isProcessing) return; // Skip if still processing
    
    try {
      setIsProcessing(true);
      const startTime = Date.now();
      
      if (!cameraRef.current) return;

      // Capture photo with lower quality for faster upload
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3, // Lower quality = faster upload (was 0.5)
        base64: false,
        skipProcessing: true,
        exif: false, // Skip EXIF data
      });

      if (!photo) return;

      // Send to server for live detection
      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: 'frame.jpg',
        type: 'image/jpeg',
      } as any);

      // Use AbortController with shorter timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch(`${SERVER_URL}/live-detect`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result: LiveDetectionResponse = await response.json();
        
        setDetections(result.detections || []);
        setFrameSize({ width: result.frame_width, height: result.frame_height });
        if (result.fps) setFps(result.fps);
        
        // Calculate latency
        const endTime = Date.now();
        setLatency(endTime - startTime);
        
        console.log(`Frame processed in ${endTime - startTime}ms - ${result.detections.length} pigs detected`);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Live detection error:', error);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  useEffect(() => {
    if (!permission?.granted) return;

    // FASTER: Process frames every 300ms (~3 FPS) instead of 1000ms
    processingIntervalRef.current = setInterval(() => {
      captureAndAnalyze();
    }, 300);

    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [permission?.granted, captureAndAnalyze]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderDetections = () => {
    if (detections.length === 0) return null;

    const scaleX = SCREEN_WIDTH / frameSize.width;
    const scaleY = SCREEN_HEIGHT / frameSize.height;

    return (
      <Svg 
        style={[StyleSheet.absoluteFill, { zIndex: 10 }]} 
        width={SCREEN_WIDTH} 
        height={SCREEN_HEIGHT}
        pointerEvents="none"
      >
        {detections.map((detection, index) => {
          const [x1, y1, x2, y2] = detection.box;
          
          const scaledX = x1 * scaleX;
          const scaledY = y1 * scaleY;
          const scaledWidth = (x2 - x1) * scaleX;
          const scaledHeight = (y2 - y1) * scaleY;

          const behaviorColors: Record<string, string> = {
            'Eating': '#4CAF50',
            'Drinking': '#2196F3',
            'Walking': '#FF9800',
            'Sleeping': '#9C27B0',
            'Lying': '#795548',
            'Investigating': '#FFC107',
            'Moutend': '#E91E63',
          };
          const color = behaviorColors[detection.behavior] || '#FF5722';

          return (
            <React.Fragment key={index}>
              <Rect
                x={scaledX}
                y={scaledY}
                width={scaledWidth}
                height={scaledHeight}
                stroke={color}
                strokeWidth={5}
                fill="transparent"
              />
              
              <Rect
                x={scaledX}
                y={Math.max(0, scaledY - 35)}
                width={Math.min(scaledWidth, 250)}
                height={35}
                fill={color}
                opacity={0.9}
              />
              
              <SvgText
                x={scaledX + 8}
                y={Math.max(23, scaledY - 12)}
                fill="white"
                fontSize="18"
                fontWeight="bold"
              >
                {detection.behavior}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    );
  };

  return (
    <View style={styles.container}>
      <CameraView 
        style={styles.camera} 
        ref={cameraRef}
        facing="back"
      />

      {renderDetections()}

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <X size={28} color="white" weight="bold" />
        </TouchableOpacity>
        
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            🐷 {detections.length} pig{detections.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.statsText}>
            ⚡ {latency}ms latency
          </Text>
          {fps > 0 && (
            <Text style={styles.statsText}>
              📊 {fps.toFixed(1)} server FPS
            </Text>
          )}
        </View>
      </View>

      <View style={styles.bottomBar}>
        {isProcessing && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.processingText}>Analyzing...</Text>
          </View>
        )}
        
        {detections.length > 0 && (
          <View style={styles.behaviorLegend}>
            {Array.from(new Set(detections.map(d => d.behavior))).map((behavior, index) => (
              <View key={index} style={styles.legendItem}>
                <View style={[styles.legendColor, { 
                  backgroundColor: {
                    'Eating': '#4CAF50',
                    'Drinking': '#2196F3',
                    'Walking': '#FF9800',
                    'Sleeping': '#9C27B0',
                    'Lying': '#795548',
                    'Investigating': '#FFC107',
                    'Moutend': '#E91E63',
                  }[behavior] || '#FF5722' 
                }]} />
                <Text style={styles.legendText}>
                  {behavior} ({detections.filter(d => d.behavior === behavior).length})
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  message: {
    textAlign: 'center',
    color: 'white',
    fontSize: 16,
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  closeButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 25,
  },
  statsContainer: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  statsText: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
    marginVertical: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 25,
    marginBottom: 12,
  },
  processingText: {
    color: 'white',
    marginLeft: 10,
    fontSize: 15,
  },
  behaviorLegend: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 15,
    maxWidth: '90%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
  },
  legendColor: {
    width: 18,
    height: 18,
    borderRadius: 5,
    marginRight: 10,
  },
  legendText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});
