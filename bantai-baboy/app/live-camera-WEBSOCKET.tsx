import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { X } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import * as ScreenOrientation from 'expo-screen-orientation';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

interface Detection {
  box: [number, number, number, number];
  behavior: string;
  confidence: number;
  pig_id?: number;
}

interface WSResponse {
  detections: Detection[];
  frame_width: number;
  frame_height: number;
  fps?: number;
  total_tracked_pigs?: number;
  frame_count?: number;
  processing_time_ms?: number;
  error?: string;
}

const SERVER_URL = "192.168.0.100:5000";
const MAX_PIGS_PER_FRAME = 20; // raised — don't miss pigs in crowded scenes

// Resize by width only — height auto-adjusts to preserve aspect ratio.
// Forcing both width+height was distorting the image and misplacing boxes.
const SEND_WIDTH = 640;

const BEHAVIOR_COLORS: Record<string, string> = {
  'Eating': '#4CAF50',
  'Drinking': '#2196F3',
  'Walking': '#FF9800',
  'Sleeping': '#9C27B0',
  'Lying': '#795548',
  'Investigating': '#FFC107',
  'Moutend': '#E91E63',
};

export default function LiveCameraWebSocket() {
  const { width: SW, height: SH } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [frameSize, setFrameSize] = useState({ width: SEND_WIDTH, height: 360 }); // height updated by server response
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [totalTrackedPigs, setTotalTrackedPigs] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const cameraRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingFrames = useRef(0);
  const isCapturing = useRef(false);
  const isCameraReady = useRef(false); // ✅ Don't capture until camera is fully ready

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => { ScreenOrientation.unlockAsync().catch(() => {}); };
  }, []);

  const captureAndSendFrame = useCallback(async () => {
    if (!cameraRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (isCapturing.current || pendingFrames.current > 0) return;

    isCapturing.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.1,
        base64: false,
        skipProcessing: true,
        // exif: false,
      });

      if (!photo?.uri) return;

      // Resize by width only — aspect ratio preserved automatically.
      // Previously forced 640x480 which squished landscape photos → wrong box positions.
      const resized = await manipulateAsync(
        photo.uri,
        [{ resize: { width: SEND_WIDTH } }],
        { compress: 0.5, format: SaveFormat.JPEG, base64: true }
      );

      if (!resized.base64) return;

      wsRef.current.send(JSON.stringify({
        frame: resized.base64,
        max_pigs: MAX_PIGS_PER_FRAME,
      }));
      pendingFrames.current += 1;
      console.log(`📸 Sent frame (width: ${SEND_WIDTH})`);

    } catch (e) {
      console.warn('⚠️ Capture skipped this frame (hardware busy)');
    } finally {
      isCapturing.current = false;
    }
  }, []);

  const startStreaming = useCallback(() => {
    if (streamIntervalRef.current) return;
    pendingFrames.current = 0;
    isCapturing.current = false;
    setIsStreaming(true);
    streamIntervalRef.current = setInterval(captureAndSendFrame, 1000);
  }, [captureAndSendFrame]);

  const stopStreaming = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    pendingFrames.current = 0;
    isCapturing.current = false;
    isCameraReady.current = false;
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    if (!permission?.granted) return;

    const connect = () => {
      const ws = new WebSocket(`ws://${SERVER_URL}/ws/live-stream`);
      ws.onopen = () => { setIsConnected(true); setErrorMessage(''); };

      ws.onmessage = (event) => {
        try {
          const data: WSResponse = JSON.parse(event.data);
          if (data.error) {
            setErrorMessage(data.error);
            pendingFrames.current = Math.max(0, pendingFrames.current - 1);
            return;
          }
          setDetections(data.detections || []);
          setFrameSize({ width: data.frame_width || SEND_WIDTH, height: data.frame_height || 360 });
          if (data.fps) setFps(data.fps);
          if (data.total_tracked_pigs !== undefined) setTotalTrackedPigs(data.total_tracked_pigs);
          if (data.frame_count) setFrameCount(data.frame_count);
          if (data.processing_time_ms) setLatency(data.processing_time_ms);
          pendingFrames.current = Math.max(0, pendingFrames.current - 1);
          console.log(`✅ ${data.detections?.length ?? 0} pigs | frame:${data.frame_width}x${data.frame_height}`);
        } catch (e) { console.error('Parse error', e); }
      };

      ws.onerror = () => { setIsConnected(false); setErrorMessage('Connection error'); };
      ws.onclose = () => {
        setIsConnected(false); setIsStreaming(false);
        if (streamIntervalRef.current) { clearInterval(streamIntervalRef.current); streamIntervalRef.current = null; }
        setTimeout(connect, 2000);
      };
      wsRef.current = ws;
    };

    connect();
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      wsRef.current?.close();
    };
  }, [permission?.granted]);

  if (!permission) return <View style={s.container}><Text style={s.msg}>Requesting permission...</Text></View>;
  if (!permission.granted) return (
    <View style={s.container}>
      <Text style={s.msg}>Camera permission needed</Text>
      <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
        <Text style={s.permBtnText}>Grant Permission</Text>
      </TouchableOpacity>
    </View>
  );

  // Server returns boxes in sent-frame coords → scale to screen
  const scaleX = SW / frameSize.width;
  const scaleY = SH / frameSize.height;

  return (
    <View style={s.container}>
      <CameraView
        style={s.camera}
        ref={cameraRef}
        facing="back"
        onCameraReady={() => {
          isCameraReady.current = true;
          console.log('📷 Camera ready');
        }}
      />

      {detections.length > 0 && (
        <View style={[StyleSheet.absoluteFill, {zIndex: 10}]} pointerEvents="none">
          <Svg width={SW} height={SH}>
            {detections.map((det, i) => {
              const [x1, y1, x2, y2] = det.box;
              const sx = x1 * scaleX;
              const sy = y1 * scaleY;
              const sw = (x2 - x1) * scaleX;
              const sh = (y2 - y1) * scaleY;
              const color = BEHAVIOR_COLORS[det.behavior] || '#FF5722';
              return (
                <React.Fragment key={i}>
                  <Rect x={sx} y={sy} width={sw} height={sh}
                    stroke={color} strokeWidth={4} fill="transparent" />
                  <Rect x={sx} y={Math.max(0, sy - 32)} width={Math.min(sw, 200)} height={32}
                    fill={color} opacity={0.9} />
                  <SvgText x={sx + 6} y={Math.max(22, sy - 8)}
                    fill="white" fontSize="16" fontWeight="bold">
                    #{det.pig_id} {det.behavior}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </View>
      )}

      <View style={s.topBar}>
        <TouchableOpacity style={s.closeBtn} onPress={() => { stopStreaming(); router.back(); }}>
          <X size={24} color="white" weight="bold" />
        </TouchableOpacity>
        <View style={s.stats}>
          <Text style={[s.stat, { color: isConnected ? '#4CAF50' : '#FF5722' }]}>
            {isConnected ? '🟢 LIVE' : '🔴 OFFLINE'}
          </Text>
          <Text style={s.stat}>📹 {detections.length} | 🐷 {totalTrackedPigs}</Text>
          <Text style={[s.stat, { color: latency > 1500 ? '#FF5722' : '#4CAF50' }]}>⚡ {latency.toFixed(0)}ms</Text>
          {fps > 0 && <Text style={s.stat}>📊 {fps.toFixed(1)} FPS</Text>}
          <Text style={s.stat}>🎞️ {frameCount}</Text>
        </View>
      </View>

      {!!errorMessage && (
        <View style={s.errorBox}><Text style={s.errorText}>⚠️ {errorMessage}</Text></View>
      )}

      <View style={s.bottomBar}>
        {isConnected ? (
          <TouchableOpacity
            style={[s.btn, { backgroundColor: isStreaming ? '#FF5722' : '#4CAF50' }]}
            onPress={isStreaming ? stopStreaming : startStreaming}
          >
            <Text style={s.btnText}>{isStreaming ? '⏸️ PAUSE' : '▶️ START'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.connecting}>
            <ActivityIndicator size="small" color="white" />
            <Text style={s.connectingText}>Connecting...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  camera: { ...StyleSheet.absoluteFillObject },
  msg: { color: 'white', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  permBtn: { backgroundColor: Colors.light.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, alignSelf: 'center' },
  permBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  topBar: {
    position: 'absolute', top: 20, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, zIndex: 100,
  },
  closeBtn: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 30 },
  stats: {
    backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, flexDirection: 'row', gap: 10,
  },
  stat: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  errorBox: {
    position: 'absolute', top: 80, alignSelf: 'center',
    backgroundColor: 'rgba(255,0,0,0.9)', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 12, zIndex: 100,
  },
  errorText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  bottomBar: { position: 'absolute', bottom: 30, alignSelf: 'center', zIndex: 100 },
  btn: {
    paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84,
  },
  btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  connecting: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30,
  },
  connectingText: { color: 'white', marginLeft: 12, fontSize: 16, fontWeight: 'bold' },
});