import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { X } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import * as ScreenOrientation from 'expo-screen-orientation';

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
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
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

  // Lock to Landscape on mount, revert on unmount
  useEffect(() => {
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
    lockOrientation();

    return () => {
      ScreenOrientation.unlockAsync(); // Unlocks when you navigate away
    };
  }, []);

  // Reset tracking on mount
  useEffect(() => {
    const resetTracking = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/reset-tracking`, { method: 'POST' });
        if (response.ok) console.log('✅ Tracking IDs reset successfully');
      } catch (error) {
        console.error('❌ Failed to reset tracking:', error);
      }
    };
    resetTracking();
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      const startTime = Date.now();
      
      if (!cameraRef.current) return;

      // Lowered quality to 0.1 for faster network transfer (YOLO/MobileNet still work fine at this compression)
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.1, 
        base64: false,
        skipProcessing: true,
        exif: false,
      });

      if (!photo || !photo.uri) return;

      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: 'frame.jpg',
        type: 'image/jpeg',
      } as any);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${SERVER_URL}/live-detect`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        setLastError(`Server error: ${response.status}`);
        setErrorCount(prev => prev + 1);
        return;
      }

      const result: LiveDetectionResponse = await response.json();
      
      setDetections(result.detections || []);
      setFrameSize({ width: result.frame_width, height: result.frame_height });
      if (result.fps) setFps(result.fps);
      if (result.total_tracked_pigs !== undefined) setTotalTrackedPigs(result.total_tracked_pigs);
      
      setLatency(Date.now() - startTime);
      setErrorCount(0);
      setLastError('');
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setLastError('Timeout');
      } else {
        setLastError(error.message || 'Unknown error');
      }
      setErrorCount(prev => prev + 1);
      
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

    processingIntervalRef.current = setInterval(() => {
      captureAndAnalyze();
    }, 500);

    return () => {
      if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
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
            'Eating': '#4CAF50', 'Drinking': '#2196F3', 'Walking': '#FF9800',
            'Sleeping': '#9C27B0', 'Lying': '#795548', 'Investigating': '#FFC107', 'Moutend': '#E91E63',
          };
          const color = behaviorColors[detection.behavior] || '#FF5722';

          return (
            <React.Fragment key={`detection-${index}`}>
              <Rect x={scaledX} y={scaledY} width={scaledWidth} height={scaledHeight} stroke={color} strokeWidth={4} fill="transparent" />
              <Rect x={scaledX} y={Math.max(0, scaledY - 30)} width={Math.min(scaledWidth, 200)} height={30} fill={color} opacity={0.9} />
              <SvgText x={scaledX + 8} y={Math.max(20, scaledY - 8)} fill="white" fontSize="16" fontWeight="bold">
                {detection.pig_id ? `#${detection.pig_id} ${detection.behavior}` : detection.behavior}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    );
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef} facing="back" />
      {renderDetections()}

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <X size={24} color="white" weight="bold" />
        </TouchableOpacity>
        
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>📹 {detections.length} | 🐷 {totalTrackedPigs}</Text>
          <Text style={[styles.statsText, { color: latency > 1000 ? '#FF5722' : '#4CAF50' }]}>⚡ {latency}ms</Text>
          {fps > 0 && <Text style={styles.statsText}>📊 {fps.toFixed(1)} FPS</Text>}
        </View>
      </View>

      {lastError ? (
        <View style={styles.errorContainer}><Text style={styles.errorText}>⚠️ {lastError}</Text></View>
      ) : null}

      <View style={styles.bottomBar}>
        {isProcessing && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color="white" />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  message: { textAlign: 'center', color: 'white', fontSize: 16, marginBottom: 20 },
  permissionButton: { backgroundColor: Colors.light.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permissionButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  camera: { ...StyleSheet.absoluteFillObject },
  topBar: { position: 'absolute', top: 20, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, zIndex: 100 },
  closeButton: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 30 },
  statsContainer: { backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', gap: 12 },
  statsText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  errorContainer: { position: 'absolute', top: 80, alignSelf: 'center', backgroundColor: 'rgba(255,0,0,0.9)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, zIndex: 100 },
  errorText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  bottomBar: { position: 'absolute', bottom: 20, right: 20, alignItems: 'center', zIndex: 100 },
  processingIndicator: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 30 },
});