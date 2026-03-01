import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, Alert } from 'react-native';
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
  total_tracked_pigs?: number;
}

const SERVER_URL = "http://192.168.0.100:5000";

export default function LiveCamera() {
  const [permission, requestPermission] = useCameraPermissions();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fps, setFps] = useState(0);
  const [frameSize, setFrameSize] = useState({ width: 640, height: 480 });
  const [latency, setLatency] = useState(0);
  const [totalTrackedPigs, setTotalTrackedPigs] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [lastError, setLastError] = useState<string>('');
  const cameraRef = useRef<any>(null);
  const processingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset tracking on mount
  useEffect(() => {
    const resetTracking = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/reset-tracking`, {
          method: 'POST',
        });
        if (response.ok) {
          console.log('✅ Tracking IDs reset successfully');
        }
      } catch (error) {
        console.error('❌ Failed to reset tracking:', error);
      }
    };

    resetTracking();
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (isProcessing) {
      console.log('⏭️ Skipping frame - still processing');
      return;
    }
    
    try {
      setIsProcessing(true);
      const startTime = Date.now();
      
      if (!cameraRef.current) {
        console.warn('⚠️ Camera ref not available');
        return;
      }

      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: false,
        skipProcessing: true,
        exif: false,
      });

      if (!photo || !photo.uri) {
        console.error('❌ Failed to capture photo');
        return;
      }

      console.log(`📸 Photo captured: ${photo.width}x${photo.height}`);

      // Send to server
      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: 'frame.jpg',
        type: 'image/jpeg',
      } as any);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${SERVER_URL}/live-detect`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Server error ${response.status}:`, errorText);
        setLastError(`Server error: ${response.status}`);
        setErrorCount(prev => prev + 1);
        return;
      }

      const result: LiveDetectionResponse = await response.json();
      
      console.log(`✅ Detections: ${result.detections.length} pigs | Frame: ${result.frame_width}x${result.frame_height}`);
      
      if (result.detections.length > 0) {
        console.log('🐷 Pig IDs:', result.detections.map(d => `#${d.pig_id}:${d.behavior}`).join(', '));
        console.log('📦 First box:', result.detections[0].box);
      }

      setDetections(result.detections || []);
      setFrameSize({ width: result.frame_width, height: result.frame_height });
      if (result.fps) setFps(result.fps);
      if (result.total_tracked_pigs !== undefined) setTotalTrackedPigs(result.total_tracked_pigs);
      
      const endTime = Date.now();
      setLatency(endTime - startTime);
      setErrorCount(0); // Reset error count on success
      setLastError('');
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('⏱️ Request timeout');
        setLastError('Timeout');
      } else {
        console.error('❌ Live detection error:', error);
        setLastError(error.message || 'Unknown error');
      }
      setErrorCount(prev => prev + 1);
      
      // Stop after 5 consecutive errors
      if (errorCount >= 5) {
        Alert.alert(
          'Connection Lost',
          'Too many errors. Please check your server connection.',
          [
            { text: 'Retry', onPress: () => setErrorCount(0) },
            { text: 'Go Back', onPress: () => router.back() }
          ]
        );
      }
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, errorCount]);

  useEffect(() => {
    if (!permission?.granted) return;

    // Start processing at 2 FPS (500ms interval) - good balance
    processingIntervalRef.current = setInterval(() => {
      captureAndAnalyze();
    }, 500);

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

    // Use actual frame dimensions from server
    const scaleX = SCREEN_WIDTH / frameSize.width;
    const scaleY = SCREEN_HEIGHT / frameSize.height;

    console.log(`🎨 Rendering ${detections.length} boxes with scale: ${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`);

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

          // Ensure boxes are on screen
          if (scaledX < 0 || scaledY < 0 || scaledX > SCREEN_WIDTH || scaledY > SCREEN_HEIGHT) {
            console.warn(`⚠️ Box ${index} is off-screen:`, { scaledX, scaledY });
          }

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
            <React.Fragment key={`detection-${index}`}>
              {/* Bounding box */}
              <Rect
                x={scaledX}
                y={scaledY}
                width={scaledWidth}
                height={scaledHeight}
                stroke={color}
                strokeWidth={6}
                fill="transparent"
              />
              
              {/* Label background */}
              <Rect
                x={scaledX}
                y={Math.max(0, scaledY - 40)}
                width={Math.min(scaledWidth, 280)}
                height={40}
                fill={color}
                opacity={0.95}
              />
              
              {/* Label text */}
              <SvgText
                x={scaledX + 10}
                y={Math.max(26, scaledY - 14)}
                fill="white"
                fontSize="20"
                fontWeight="bold"
              >
                {detection.pig_id ? `#${detection.pig_id} - ${detection.behavior}` : detection.behavior}
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

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <X size={28} color="white" weight="bold" />
        </TouchableOpacity>
        
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            📹 {detections.length} visible
          </Text>
          {totalTrackedPigs > 0 && (
            <Text style={styles.statsText}>
              🐷 {totalTrackedPigs} total
            </Text>
          )}
          <Text style={[styles.statsText, { color: latency > 1000 ? '#FF5722' : '#4CAF50' }]}>
            ⚡ {latency}ms
          </Text>
          {fps > 0 && (
            <Text style={styles.statsText}>
              📊 {fps.toFixed(1)} FPS
            </Text>
          )}
        </View>
      </View>

      {/* Error indicator */}
      {lastError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {lastError}</Text>
        </View>
      )}

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {isProcessing && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.processingText}>Analyzing...</Text>
          </View>
        )}
        
        {detections.length > 0 && (
          <View style={styles.behaviorLegend}>
            {Array.from(new Set(detections.map(d => d.behavior))).map((behavior, index) => {
              const count = detections.filter(d => d.behavior === behavior).length;
              const behaviorColors: Record<string, string> = {
                'Eating': '#4CAF50',
                'Drinking': '#2196F3',
                'Walking': '#FF9800',
                'Sleeping': '#9C27B0',
                'Lying': '#795548',
                'Investigating': '#FFC107',
                'Moutend': '#E91E63',
              };
              
              return (
                <View key={index} style={styles.legendItem}>
                  <View style={[styles.legendColor, { 
                    backgroundColor: behaviorColors[behavior] || '#FF5722'
                  }]} />
                  <Text style={styles.legendText}>
                    {behavior} ({count})
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Debug button */}
      <TouchableOpacity
        style={styles.debugButton}
        onPress={() => {
          const info = `Detections: ${detections.length}
Frame: ${frameSize.width}x${frameSize.height}
Screen: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}
Scale: ${(SCREEN_WIDTH/frameSize.width).toFixed(2)}x${(SCREEN_HEIGHT/frameSize.height).toFixed(2)}
Latency: ${latency}ms
Errors: ${errorCount}

${detections.length > 0 ? `First detection:
ID: #${detections[0].pig_id}
Behavior: ${detections[0].behavior}
Box: [${detections[0].box.join(', ')}]
Confidence: ${(detections[0].confidence * 100).toFixed(1)}%` : 'No detections'}`;
          Alert.alert('Debug Info', info);
        }}
      >
        <Text style={styles.debugButtonText}>🔍</Text>
      </TouchableOpacity>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 12,
    borderRadius: 30,
  },
  statsContainer: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  statsText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginVertical: 2,
  },
  errorContainer: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,0,0,0.9)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 100,
  },
  errorText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    marginBottom: 12,
  },
  processingText: {
    color: 'white',
    marginLeft: 10,
    fontSize: 16,
  },
  behaviorLegend: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    maxWidth: '90%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  legendColor: {
    width: 20,
    height: 20,
    borderRadius: 6,
    marginRight: 12,
  },
  legendText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  debugButton: {
    position: 'absolute',
    bottom: 160,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    zIndex: 100,
  },
  debugButtonText: {
    fontSize: 24,
  },
});
