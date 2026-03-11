import { AppBar } from "@/components/appbar";
import { FloatingActionButton } from "@/components/floating-action-button";
import { Colors } from "@/theme/colors";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image as RNImage,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UploadedFile {
  id: string;
  filename: string;
  uri: string;
  type: "image" | "video";
  uploadTime: string;
  analysisData?: any;
}

const SERVER_URL_KEY = '@server_url';
const DEFAULT_SERVER_URL = 'http://192.168.0.101:5000';
const STORAGE_KEY = '@bantai_baboy_files';
const ONBOARDING_KEY = '@onboarding_done';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Pig Theme ────────────────────────────────────────────────────────────────
const PIG = {
  pink:      '#de9baa',
  pinkLight: '#f5e4e8',
  pinkDark:  '#d26d8b',
  rose:      '#E8637A',
  roseDark:  '#5E4343',
  cream:     '#FFF5F7',
  snout:     '#F4C2C2',
};

const SLIDES = [
  {
    emoji: '🐷',
    title: 'Welcome to\nBant-AI Baboy',
    body: 'Your smart companion for monitoring pig behavior and health — powered by AI, built for the farm.',
  },
  {
    emoji: '📸',
    title: 'Capture &\nAnalyze',
    body: 'Upload a photo or video of your hogs, or use the live camera. Our AI detects behavior like eating, sleeping, walking, and more.',
  },
  {
    emoji: '⚠️',
    title: 'Health Alerts',
    body: 'Bant-AI Baboy automatically flags lethargic or limping pigs so you can act fast and keep your herd healthy.',
  },
  {
    emoji: '📊',
    title: 'Reports &\nAnalytics',
    body: 'Export PDF reports and CSV data, view behavior breakdowns, and track trends over time.',
  },
];

function OnboardingModal({
  visible,
  onDone,
  isReplay = false,
}: {
  visible: boolean;
  onDone: () => void;
  isReplay?: boolean;
}) {
  const [page, setPage] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) setPage(0);
  }, [visible]);

  const goNext = () => {
    if (page < SLIDES.length - 1) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setPage(p => p + 1), 150);
    } else {
      onDone();
    }
  };

  const slide = SLIDES[page];
  const isLast = page === SLIDES.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={ob.overlay}>
        <View style={ob.card}>
          <View style={ob.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[ob.dot, i === page && ob.dotActive]} />
            ))}
          </View>
          <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
            <Text style={ob.emoji}>{slide.emoji}</Text>
            <Text style={ob.title}>{slide.title}</Text>
            <Text style={ob.body}>{slide.body}</Text>
          </Animated.View>
          <TouchableOpacity style={ob.button} onPress={goNext} activeOpacity={0.85}>
            <Text style={ob.buttonText}>
              {isLast ? (isReplay ? 'Close 🐷' : "Let's Go! 🚀") : 'Next'}
            </Text>
          </TouchableOpacity>
          {!isLast && (
            <TouchableOpacity onPress={onDone} style={ob.skip}>
              <Text style={ob.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const ob = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 28,
  },
  card: {
    backgroundColor: PIG.cream, borderRadius: 24,
    padding: 28, width: '100%', alignItems: 'center',
    borderWidth: 1.5, borderColor: PIG.snout,
  },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PIG.snout },
  dotActive: { backgroundColor: PIG.rose, width: 22 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: {
    fontSize: 26, fontFamily: 'Nunito-Black', color: PIG.roseDark,
    textAlign: 'center', marginBottom: 12, lineHeight: 32,
  },
  body: {
    fontSize: 15, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark,
    textAlign: 'center', lineHeight: 22, marginBottom: 32,
  },
  button: {
    backgroundColor: PIG.rose, paddingVertical: 14, paddingHorizontal: 40,
    borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  buttonText: { color: 'white', fontSize: 16, fontFamily: 'NunitoSans-Bold' },
  skip: { paddingVertical: 8 },
  skipText: { color: PIG.pinkDark, fontSize: 14, fontFamily: 'NunitoSans-Regular' },
});

function DashboardCard({
  files, serverUrl, serverStatus,
}: {
  files: UploadedFile[];
  serverUrl: string;
  serverStatus: 'checking' | 'online' | 'offline';
}) {
  const lastFile = files[0];
  const totalAlerts = files.reduce((acc, f) => {
    const d = f.analysisData;
    if (!d) return acc;
    return acc + (d.lethargy_flags || 0) + (d.limping_flags || 0);
  }, 0);
  const lastBehavior = lastFile?.analysisData?.primary_behavior;
  const lastPigs =
    lastFile?.analysisData?.detected_pigs_count ??
    lastFile?.analysisData?.total_unique_pigs;

  const statusColor =
    serverStatus === 'online'  ? '#4CAF50' :
    serverStatus === 'offline' ? '#F44336' : '#FFC107';
  const statusLabel =
    serverStatus === 'online'  ? 'Online' :
    serverStatus === 'offline' ? 'Offline' : 'Checking…';

  return (
    <View style={dc.card}>
      <View style={dc.statusRow}>
        <View style={[dc.statusDot, { backgroundColor: statusColor }]} />
        <Text style={dc.statusText}>Server {statusLabel}</Text>
        <Text style={dc.ipText} numberOfLines={1}>{serverUrl}</Text>
      </View>
      <View style={dc.divider} />
      <View style={dc.statsRow}>
        <View style={dc.stat}>
          <Text style={dc.statValue}>{files.length}</Text>
          <Text style={dc.statLabel}>Analyses</Text>
        </View>
        <View style={dc.statDivider} />
        <View style={dc.stat}>
          <Text style={[dc.statValue, { color: totalAlerts > 0 ? '#D32F2F' : '#388E3C' }]}>
            {totalAlerts}
          </Text>
          <Text style={dc.statLabel}>Health Alerts</Text>
        </View>
        <View style={dc.statDivider} />
        <View style={dc.stat}>
          <Text style={dc.statValue} numberOfLines={1}>{lastBehavior ?? '—'}</Text>
          <Text style={dc.statLabel}>Last Behavior</Text>
        </View>
      </View>
      {lastFile && (
        <>
          <View style={dc.divider} />
          <View style={dc.lastRow}>
            <Text style={dc.lastLabel}>Last analyzed: </Text>
            <Text style={dc.lastValue} numberOfLines={1}>
              {lastFile.filename}
              {lastPigs !== undefined ? `  ·  ${lastPigs} hog${lastPigs !== 1 ? 's' : ''}` : ''}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const dc = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 4,
    backgroundColor: PIG.cream,
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20,
    elevation: 3, shadowColor: PIG.rose,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8,
    borderWidth: 1.5, borderColor: PIG.snout,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: PIG.roseDark },
  ipText: { fontSize: 12, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, flex: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: PIG.snout, marginVertical: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontFamily: 'Nunito-Black', color: PIG.roseDark, textAlign: 'center' },
  statLabel: { fontSize: 11, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: PIG.snout },
  lastRow: { flexDirection: 'row', alignItems: 'center' },
  lastLabel: { fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: PIG.pinkDark },
  lastValue: { fontSize: 12, fontFamily: 'NunitoSans-Regular', color: PIG.roseDark, flex: 1 },
});

function EmptyState({ onUpload }: { onUpload: () => void }) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -10, duration: 700, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0,   duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={es.container}>
      <Animated.Text style={[es.pig, { transform: [{ translateY: bounceAnim }] }]}>🐷</Animated.Text>
      <Text style={es.title}>No hogs analyzed yet!</Text>
      <Text style={es.subtitle}>
        Tap the <Text style={es.bold}>+</Text> button below to upload a photo or video,{'\n'}or use the live camera to get started.
      </Text>
      <TouchableOpacity style={es.button} onPress={onUpload} activeOpacity={0.85}>
        <Text style={es.buttonText}>📸 Analyze Your First Hog</Text>
      </TouchableOpacity>
    </View>
  );
}

const es = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 40, paddingBottom: 60, paddingHorizontal: 32 },
  pig: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontFamily: 'Nunito-Black', color: PIG.roseDark, marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  bold: { fontFamily: 'Nunito-Black', color: PIG.rose, fontSize: 18 },
  button: { backgroundColor: PIG.rose, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12 },
  buttonText: { color: 'white', fontSize: 15, fontFamily: 'NunitoSans-SemiBold' },
});

export default function Index() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    (async () => {
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (!done) setShowOnboarding(true);
    })();
    loadSavedFiles();
  }, []);

  useFocusEffect(useCallback(() => { loadServerUrl(); }, []));
  useEffect(() => { saveFiles(); }, [files]);
  useEffect(() => { pingServer(); }, [serverUrl]);

  const pingServer = async () => {
    setServerStatus('checking');
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${serverUrl}/reset-tracking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      setServerStatus(res.ok ? 'online' : 'offline');
    } catch { setServerStatus('offline'); }
  };

  const finishOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  const loadServerUrl = async () => {
    try {
      const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
      if (saved) setServerUrl(saved);
    } catch {}
  };

  const loadSavedFiles = async () => {
    try {
      const savedFiles = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedFiles) setFiles(JSON.parse(savedFiles));
    } catch {}
  };

  const saveFiles = async () => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(files)); } catch {}
  };

  const navigateToResults = (file: UploadedFile, analysisResult?: any) => {
    router.push({
      pathname: "/results",
      params: {
        filename: file.filename, uri: file.uri, type: file.type,
        analysisData: analysisResult
          ? JSON.stringify(analysisResult)
          : (file.analysisData ? JSON.stringify(file.analysisData) : undefined),
      },
    });
  };

  const handleCameraCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission needed', 'Camera permission is required.');
    Alert.alert('Camera', 'What would you like to capture?', [
      {
        text: 'Photo', onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 1 });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const analysisResult = await uploadToServer(asset, 'image');
            if (analysisResult) {
              const newFile: UploadedFile = { id: Date.now().toString(), filename: asset.uri.split('/').pop() || 'photo.jpg', uri: asset.uri, type: 'image', uploadTime: new Date().toLocaleString(), analysisData: analysisResult };
              setFiles(prev => [newFile, ...prev]);
              navigateToResults(newFile, analysisResult);
            }
          }
        },
      },
      {
        text: 'Video', onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, quality: 1 });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const analysisResult = await uploadVideoForProcessing(asset);
            if (analysisResult) {
              const newFile: UploadedFile = { id: Date.now().toString(), filename: asset.uri.split('/').pop() || 'video.mp4', uri: asset.uri, type: 'video', uploadTime: new Date().toLocaleString(), analysisData: analysisResult };
              setFiles(prev => [newFile, ...prev]);
              navigateToResults(newFile, analysisResult);
            }
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadToServer = async (asset: ImagePicker.ImagePickerAsset, mediaType: "image" | "video") => {
    setIsUploading(true);
    const endpoint = mediaType === "image" ? "/analyze-image" : "/analyze-video";
    const formData = new FormData();
    formData.append("file", { uri: asset.uri, name: asset.fileName || (mediaType === "image" ? "image.jpg" : "video.mp4"), type: asset.mimeType || (mediaType === "image" ? "image/jpeg" : "video/mp4") } as any);
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), mediaType === "video" ? 180000 : 30000);
      const response = await fetch(`${serverUrl}${endpoint}`, { method: "POST", body: formData, headers: { "Content-Type": "multipart/form-data" }, signal: controller.signal });
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) { Alert.alert("Server Error", "Unexpected response."); return null; }
      const result = await response.json();
      if (response.ok) { Alert.alert("Analysis Complete", `Detected: ${result.primary_behavior}`); return result; }
      else { Alert.alert("Server Error", result.error || "Unknown error"); return null; }
    } catch (error: any) {
      Alert.alert(error.name === "AbortError" ? "Timeout" : "Connection Error", error.name === "AbortError" ? "Analysis took too long." : "Could not connect to server.");
      return null;
    } finally { setIsUploading(false); }
  };

  const uploadVideoForProcessing = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", { uri: asset.uri, name: asset.fileName || "video.mp4", type: asset.mimeType || "video/mp4" } as any);
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 180000);
      const response = await fetch(`${serverUrl}/analyze-video-with-overlay`, { method: "POST", body: formData, headers: { "Content-Type": "multipart/form-data" }, signal: controller.signal });
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) { Alert.alert("Server Error", "Unexpected response."); return null; }
      const result = await response.json();
      if (response.ok) { Alert.alert("Processing Complete", `Primary Behavior: ${result.primary_behavior}`); return result; }
      else { Alert.alert("Server Error", result.error || "Unknown error"); return null; }
    } catch (error: any) {
      Alert.alert(error.name === "AbortError" ? "Timeout" : "Connection Error", error.name === "AbortError" ? "Processing took too long." : "Could not connect to server.");
      return null;
    } finally { setIsUploading(false); }
  };

  const handleImageUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission needed");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const analysisResult = await uploadToServer(asset, "image");
      if (analysisResult) {
        const newFile: UploadedFile = { id: Date.now().toString(), filename: asset.uri.split("/").pop() || "image.jpg", uri: asset.uri, type: "image", uploadTime: new Date().toLocaleString(), analysisData: analysisResult };
        setFiles(prev => [newFile, ...prev]);
        navigateToResults(newFile, analysisResult);
      }
    }
  };

  const handleVideoUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission needed");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const analysisResult = await uploadVideoForProcessing(asset);
      if (analysisResult) {
        const newFile: UploadedFile = { id: Date.now().toString(), filename: asset.uri.split("/").pop() || "video.mp4", uri: asset.uri, type: "video", uploadTime: new Date().toLocaleString(), analysisData: analysisResult };
        setFiles(prev => [newFile, ...prev]);
        navigateToResults(newFile, analysisResult);
      }
    }
  };

  const clearAllHistory = () => {
    Alert.alert('Clear History', 'Delete all saved analyses?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { setFiles([]); await AsyncStorage.removeItem(STORAGE_KEY); Alert.alert('Success', 'All history cleared'); } },
    ]);
  };

  return (
    <View style={styles.container}>

      <OnboardingModal visible={showOnboarding} onDone={finishOnboarding} isReplay={false} />

      <OnboardingModal visible={showInfo} onDone={() => setShowInfo(false)} isReplay={true} />

      <AppBar
        subtitle={`Connected to: ${serverUrl}`}
        rightIcon={<Text style={{ fontSize: 24 }}>⚙️</Text>}
        onRightIconPress={() => router.push('/settings')}
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <DashboardCard files={files} serverUrl={serverUrl} serverStatus={serverStatus} />

        <View style={styles.row}>
          <Text style={styles.selectionTitle}>Recently Analyzed Hogs</Text>
          {files.length > 0 && (
            <TouchableOpacity onPress={clearAllHistory} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.liveCameraButton}
          onPress={() => router.push('/live-camera-WEBSOCKET' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.liveCameraText}>📹 Open Live Camera</Text>
        </TouchableOpacity>

        {isUploading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={PIG.rose} />
            <Text style={styles.loadingText}>Analyzing Behavior...</Text>
          </View>
        )}

        {files.length === 0 && !isUploading ? (
          <EmptyState onUpload={handleImageUpload} />
        ) : (
          files.map((file) => {
            const behavior  = file.analysisData?.primary_behavior;
            const pigCount  = file.analysisData?.detected_pigs_count ?? file.analysisData?.total_unique_pigs;
            const hasAlerts = (file.analysisData?.lethargy_flags ?? 0) + (file.analysisData?.limping_flags ?? 0) > 0;
            return (
              <TouchableOpacity
                key={file.id}
                style={styles.historyCard}
                onPress={() => navigateToResults(file)}
                activeOpacity={0.85}
              >
                {file.uri && file.type === 'image' ? (
                  <RNImage source={{ uri: file.uri }} style={styles.historyThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.historyThumb, styles.historyThumbVideo]}>
                    <Text style={{ fontSize: 28 }}>🎥</Text>
                  </View>
                )}
                <View style={styles.historyInfo}>
                  <Text style={styles.historyFilename} numberOfLines={1}>{file.filename}</Text>
                  <Text style={styles.historyTime}>{file.uploadTime}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {behavior && (
                      <View style={styles.historyTag}>
                        <Text style={styles.historyTagText}>{behavior}</Text>
                      </View>
                    )}
                    {pigCount !== undefined && (
                      <View style={styles.historyTag}>
                        <Text style={styles.historyTagText}>🐷 {pigCount}</Text>
                      </View>
                    )}
                    {hasAlerts && (
                      <View style={[styles.historyTag, styles.historyTagAlert]}>
                        <Text style={[styles.historyTagText, { color: '#C62828' }]}>⚠️ Alert</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.historyChevron}>›</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.infoButton}
        onPress={() => setShowInfo(true)}
        activeOpacity={0.6}
      >
        <Text style={styles.infoButtonText}>ℹ️</Text>
      </TouchableOpacity>

      {!isUploading && (
        <FloatingActionButton
          onImagePress={handleImageUpload}
          onVideoPress={handleVideoUpload}
          onCameraPress={handleCameraCapture}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PIG.cream },
  content: {},
  scrollContent: { paddingBottom: 100 },
  selectionTitle: { fontSize: 16, fontFamily: 'NunitoSans-SemiBold', padding: 20, color: PIG.roseDark },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingRight: 20 },
  clearButton: { padding: 20 },
  clearButtonText: { color: PIG.pinkDark, fontSize: 14, fontFamily: 'NunitoSans-SemiBold' },
  liveCameraButton: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: PIG.roseDark,
    paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: 12, alignItems: 'center',
    shadowColor: PIG.rose, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  liveCameraText: { color: 'white', fontSize: 18, fontFamily: 'NunitoSans-Bold' },
  loadingContainer: { alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, color: PIG.pinkDark, fontFamily: 'NunitoSans-Regular' },

  infoButton: {
    position: 'absolute', bottom: 32, right: 24,
    backgroundColor: 'transparent',
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 99,
  },
  infoButtonText: { fontSize: 26 },

  historyCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: PIG.cream,
    borderRadius: 14, overflow: 'hidden',
    elevation: 2, borderWidth: 1.5, borderColor: PIG.snout,
    shadowColor: PIG.rose, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4,
  },
  historyThumb: { width: 80, height: 80 },
  historyThumbVideo: { backgroundColor: PIG.roseDark, justifyContent: 'center', alignItems: 'center' },
  historyInfo: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  historyFilename: { fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: PIG.roseDark, marginBottom: 2 },
  historyTime: { fontSize: 11, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark },
  historyTag: {
    backgroundColor: PIG.pinkLight, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: PIG.pink,
  },
  historyTagAlert: { backgroundColor: '#FFEBEE', borderColor: '#F44336' },
  historyTagText: { fontSize: 11, fontFamily: 'NunitoSans-SemiBold', color: PIG.roseDark },
  historyChevron: { fontSize: 24, color: PIG.pink, paddingRight: 14, paddingLeft: 4 },
});