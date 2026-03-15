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

interface PigSummary {
  pig_id: number;
  predominant_behavior: string;
  behavior_counts: Record<string, number>;
  is_lethargic: boolean;
  is_limping: boolean;
}

interface SessionClip {
  job_id: string;
  filename: string;
  timestamp: string;
  clip_index: number;
  pig_summaries: PigSummary[];
  primary_behavior: string;
  total_unique_pigs: number;
  time_series?: any[];
}

const SERVER_URL_KEY      = '@server_url';
const DEFAULT_SERVER_URL  = 'http://192.168.0.101:5000';
const STORAGE_KEY         = '@bantai_baboy_files';
const ONBOARDING_KEY      = '@onboarding_done';
const SESSION_CLIPS_KEY   = '@session_clips';
const SESSION_EMBEDDINGS_KEY = '@session_embeddings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PIG = {
  pink:      '#de9baa',
  pinkLight: '#f5e4e8',
  pinkDark:  '#d26d8b',
  rose:      '#E8637A',
  roseDark:  '#5E4343',
  cream:     '#FFF5F7',
  snout:     '#F4C2C2',
};

const BEHAVIOR_ICONS: Record<string, string> = {
  'Drinking':      '💧',
  'Eating':        '🍽️',
  'Investigating': '🔍',
  'Lying':         '😌',
  'Moutend':       '🔺',
  'Sleeping':      '😴',
  'Walking':       '🚶',
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

function SessionSummaryModal({
  visible,
  onClose,
  clips,
}: {
  visible: boolean;
  onClose: () => void;
  clips: SessionClip[];
}) {
  // Aggregate pig health across all clips
  const pigHealth: Record<number, { lethargic: boolean; limping: boolean; clipCount: number; behaviors: string[] }> = {};

  clips.forEach(clip => {
    clip.pig_summaries.forEach(pig => {
      if (!pigHealth[pig.pig_id]) {
        pigHealth[pig.pig_id] = { lethargic: false, limping: false, clipCount: 0, behaviors: [] };
      }
      if (pig.is_lethargic) pigHealth[pig.pig_id].lethargic = true;
      if (pig.is_limping)   pigHealth[pig.pig_id].limping   = true;
      pigHealth[pig.pig_id].clipCount += 1;
      if (!pigHealth[pig.pig_id].behaviors.includes(pig.predominant_behavior)) {
        pigHealth[pig.pig_id].behaviors.push(pig.predominant_behavior);
      }
    });
  });

  const pigIds = Object.keys(pigHealth).map(Number).sort((a, b) => a - b);
  const healthy  = pigIds.filter(id => !pigHealth[id].lethargic && !pigHealth[id].limping);
  const lethargic = pigIds.filter(id => pigHealth[id].lethargic);
  const limping   = pigIds.filter(id => pigHealth[id].limping);
  const both      = pigIds.filter(id => pigHealth[id].lethargic && pigHealth[id].limping);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ss.overlay}>
        <View style={ss.sheet}>
          <View style={ss.handle} />
          <Text style={ss.title}>📋 Session Summary</Text>
          <Text style={ss.subtitle}>{clips.length} clip{clips.length !== 1 ? 's' : ''} · {pigIds.length} unique pig{pigIds.length !== 1 ? 's' : ''} tracked</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={ss.scroll}>

            {healthy.length > 0 && (
              <View style={ss.section}>
                <View style={[ss.sectionHeader, { backgroundColor: '#E8F5E9' }]}>
                  <Text style={[ss.sectionTitle, { color: '#2E7D32' }]}>✅ Healthy</Text>
                  <Text style={[ss.sectionCount, { color: '#2E7D32' }]}>{healthy.length} pig{healthy.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={ss.pigGrid}>
                  {healthy.map(id => (
                    <View key={id} style={[ss.pigChip, { borderColor: '#4CAF50', backgroundColor: '#F1F8E9' }]}>
                      <Text style={ss.pigChipId}>🐷 #{id}</Text>
                      <Text style={ss.pigChipBehavior} numberOfLines={1}>
                        {pigHealth[id].behaviors.map(b => BEHAVIOR_ICONS[b] ?? '🐷').join(' ')}
                      </Text>
                      <Text style={ss.pigChipClips}>{pigHealth[id].clipCount} clip{pigHealth[id].clipCount !== 1 ? 's' : ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {lethargic.length > 0 && (
              <View style={ss.section}>
                <View style={[ss.sectionHeader, { backgroundColor: '#FFEBEE' }]}>
                  <Text style={[ss.sectionTitle, { color: '#C62828' }]}>😴 Lethargy Detected</Text>
                  <Text style={[ss.sectionCount, { color: '#C62828' }]}>{lethargic.length} pig{lethargic.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={ss.pigGrid}>
                  {lethargic.map(id => (
                    <View key={id} style={[ss.pigChip, { borderColor: '#F44336', backgroundColor: '#FFF5F5' }]}>
                      <Text style={ss.pigChipId}>🐷 #{id}</Text>
                      <Text style={[ss.pigChipBehavior, { color: '#C62828' }]}>😴 Lethargic</Text>
                      {pigHealth[id].limping && <Text style={[ss.pigChipBehavior, { color: '#E65100' }]}>🦵 + Limping</Text>}
                      <Text style={ss.pigChipClips}>{pigHealth[id].clipCount} clip{pigHealth[id].clipCount !== 1 ? 's' : ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {limping.filter(id => !pigHealth[id].lethargic).length > 0 && (
              <View style={ss.section}>
                <View style={[ss.sectionHeader, { backgroundColor: '#FFF3E0' }]}>
                  <Text style={[ss.sectionTitle, { color: '#E65100' }]}>🦵 Limping Detected</Text>
                  <Text style={[ss.sectionCount, { color: '#E65100' }]}>{limping.filter(id => !pigHealth[id].lethargic).length} pig{limping.filter(id => !pigHealth[id].lethargic).length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={ss.pigGrid}>
                  {limping.filter(id => !pigHealth[id].lethargic).map(id => (
                    <View key={id} style={[ss.pigChip, { borderColor: '#FF9800', backgroundColor: '#FFF8F0' }]}>
                      <Text style={ss.pigChipId}>🐷 #{id}</Text>
                      <Text style={[ss.pigChipBehavior, { color: '#E65100' }]}>🦵 Limping</Text>
                      <Text style={ss.pigChipClips}>{pigHealth[id].clipCount} clip{pigHealth[id].clipCount !== 1 ? 's' : ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {pigIds.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🐽</Text>
                <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, textAlign: 'center' }}>
                  No pigs detected across any clip yet.
                </Text>
              </View>
            )}

          </ScrollView>

          <TouchableOpacity style={ss.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={ss.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: PIG.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: '88%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: PIG.snout, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontFamily: 'NunitoSans-Bold', color: PIG.roseDark, marginBottom: 4 },
  subtitle: { fontSize: 12, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, marginBottom: 16 },
  scroll: { flexGrow: 0, marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontFamily: 'NunitoSans-Bold' },
  sectionCount: { fontSize: 12, fontFamily: 'NunitoSans-SemiBold' },
  pigGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pigChip: {
    borderWidth: 1.5, borderRadius: 12, padding: 10,
    alignItems: 'center', minWidth: 80,
  },
  pigChipId: { fontSize: 13, fontFamily: 'NunitoSans-Bold', color: PIG.roseDark, marginBottom: 2 },
  pigChipBehavior: { fontSize: 11, fontFamily: 'NunitoSans-SemiBold', color: PIG.pinkDark, textAlign: 'center' },
  pigChipClips: { fontSize: 10, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, marginTop: 2 },
  closeBtn: { backgroundColor: PIG.rose, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { color: 'white', fontSize: 15, fontFamily: 'NunitoSans-Bold' },
});
function SessionModal({
  visible,
  onClose,
  onClearSession,
  onClipPress,
}: {
  visible: boolean;
  onClose: () => void;
  onClearSession: () => void;
  onClipPress: (clip: SessionClip) => void;
}) {
  const [clips, setClips] = useState<SessionClip[]>([]);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (visible) loadClips();
  }, [visible]);

  const loadClips = async () => {
    try {
      const stored = await AsyncStorage.getItem(SESSION_CLIPS_KEY);
      setClips(stored ? JSON.parse(stored) : []);
    } catch { setClips([]); }
  };

  const confirmClear = () => {
    Alert.alert(
      'Clear Session',
      'This will reset all pig identities and start a new session. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive',
          onPress: onClearSession,
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SessionSummaryModal
        visible={showSummary}
        onClose={() => setShowSummary(false)}
        clips={clips}
      />
      <View style={sm.overlay}>
        <View style={sm.sheet}>
          <View style={sm.handle} />

          <View style={sm.header}>
            <Text style={sm.title}>🐷 Session Tracking</Text>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {clips.length > 0 && (
                <TouchableOpacity onPress={() => setShowSummary(true)} activeOpacity={0.7}>
                  <Text style={sm.summaryText}>📋 Summary</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={confirmClear} activeOpacity={0.7}>
                <Text style={sm.clearText}>New Session</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={sm.subtitle}>
            {clips.length === 0
              ? 'No clips analyzed yet. Upload a video to start tracking.'
              : `${clips.length} clip${clips.length !== 1 ? 's' : ''} — pig IDs are persistent across clips`}
          </Text>

          {clips.length === 0 ? (
            <View style={sm.emptyContainer}>
              <Text style={sm.emptyEmoji}>🐽</Text>
              <Text style={sm.emptyText}>Analyze a video to start tracking pigs across sessions.</Text>
            </View>
          ) : (
            <ScrollView
              style={sm.clipList}
              showsVerticalScrollIndicator={false}
            >
              {clips.map((clip, clipIdx) => (
                <TouchableOpacity
                key={clip.job_id}
                style={sm.clipCard}
                onPress={() => { onClose(); onClipPress(clip); }}
                activeOpacity={0.8}
              >
                  <View style={sm.clipHeader}>
                    <View style={sm.clipIndexBadge}>
                      <Text style={sm.clipIndexText}>Clip {clip.clip_index}</Text>
                    </View>
                    <View style={sm.clipMeta}>
                      <Text style={sm.clipFilename} numberOfLines={1}>{clip.filename}</Text>
                      <Text style={sm.clipTimestamp}>{clip.timestamp}</Text>
                    </View>
                    <View style={sm.clipBehaviorBadge}>
                      <Text style={sm.clipBehaviorText} numberOfLines={1}>
                        {BEHAVIOR_ICONS[clip.primary_behavior] ?? '🐷'} {clip.primary_behavior}
                      </Text>
                    </View>
                  </View>

                  {clip.pig_summaries.length === 0 ? (
                    <Text style={sm.noPigsText}>No pigs detected in this clip.</Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={sm.pigRow}
                    >
                      {clip.pig_summaries.map(pig => {
                        const isAlert = pig.is_lethargic || pig.is_limping;
                        return (
                          <View key={pig.pig_id} style={[sm.pigCard, isAlert && sm.pigCardAlert]}>
                            <Text style={sm.pigId}>🐷 #{pig.pig_id}</Text>
                            <Text style={sm.pigBehavior}>
                              {BEHAVIOR_ICONS[pig.predominant_behavior] ?? '🐷'} {pig.predominant_behavior}
                            </Text>
                            {pig.is_lethargic && (
                              <Text style={sm.pigAlertLabel}>😴 Lethargic</Text>
                            )}
                            {pig.is_limping && (
                              <Text style={sm.pigAlertLabel}>🦵 Limping</Text>
                            )}
                            {!isAlert && (
                              <Text style={sm.pigNormalLabel}>✅ Normal</Text>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}

                  {clipIdx < clips.length - 1 && (
                    <View style={sm.clipConnector}>
                      <View style={sm.connectorLine} />
                      <Text style={sm.connectorLabel}>↑ older</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={sm.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={sm.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },

  sheet: {
    backgroundColor: PIG.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '88%',
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: PIG.snout,
    alignSelf: 'center',
    marginBottom: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  title: {
    fontSize: 18,
    fontFamily: 'NunitoSans-Bold',
    color: PIG.roseDark,
  },

  clearText: {
    fontSize: 13,
    fontFamily: 'NunitoSans-SemiBold',
    color: '#D32F2F',
  },

  summaryText: {
    fontSize: 13,
    fontFamily: 'NunitoSans-SemiBold',
    color: PIG.roseDark,
  },

  subtitle: {
    fontSize: 12,
    fontFamily: 'NunitoSans-Regular',
    color: PIG.pinkDark,
    marginBottom: 16,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },

  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },

  emptyText: {
    fontSize: 14,
    fontFamily: 'NunitoSans-Regular',
    color: PIG.pinkDark,
    textAlign: 'center',
    lineHeight: 20,
  },

  clipList: {
    flexGrow: 0,
    marginBottom: 16,
  },

  clipCard: {
    backgroundColor: 'white',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: PIG.snout,
    padding: 12,
    marginBottom: 4,
  },

  clipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },

  clipIndexBadge: {
    backgroundColor: PIG.roseDark,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  clipIndexText: {
    fontSize: 11,
    fontFamily: 'NunitoSans-Bold',
    color: 'white',
  },

  clipMeta: {
    flex: 1,
  },

  clipFilename: {
    fontSize: 12,
    fontFamily: 'NunitoSans-SemiBold',
    color: PIG.roseDark,
  },

  clipTimestamp: {
    fontSize: 10,
    fontFamily: 'NunitoSans-Regular',
    color: PIG.pinkDark,
  },

  clipBehaviorBadge: {
    backgroundColor: PIG.pinkLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: PIG.pink,
  },

  clipBehaviorText: {
    fontSize: 11,
    fontFamily: 'NunitoSans-SemiBold',
    color: PIG.roseDark,
    maxWidth: 90,
  },

  noPigsText: {
    fontSize: 12,
    fontFamily: 'NunitoSans-Regular',
    color: PIG.pinkDark,
    paddingVertical: 8,
  },

  pigRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },

  pigCard: {
    backgroundColor: PIG.pinkLight,
    borderRadius: 12,
    padding: 10,
    width: 110,
    borderWidth: 1.5,
    borderColor: PIG.snout,
    alignItems: 'center',
  },

  pigCardAlert: {
    backgroundColor: '#FFF5F5',
    borderColor: '#F44336',
  },

  pigId: {
    fontSize: 13,
    fontFamily: 'NunitoSans-Bold',
    color: PIG.roseDark,
    marginBottom: 4,
  },

  pigBehavior: {
    fontSize: 11,
    fontFamily: 'NunitoSans-SemiBold',
    color: PIG.pinkDark,
    textAlign: 'center',
    marginBottom: 4,
  },

  pigAlertLabel: {
    fontSize: 10,
    fontFamily: 'NunitoSans-SemiBold',
    color: '#C62828',
    textAlign: 'center',
  },

  pigNormalLabel: {
    fontSize: 10,
    fontFamily: 'NunitoSans-SemiBold',
    color: '#2E7D32',
    textAlign: 'center',
  },

  clipConnector: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },

  connectorLine: {
    width: 1,
    height: 16,
    backgroundColor: PIG.snout,
  },

  connectorLabel: {
    fontSize: 10,
    fontFamily: 'NunitoSans-Regular',
    color: PIG.pinkDark,
  },

  closeBtn: {
    backgroundColor: PIG.rose,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },

  closeBtnText: {
    color: 'white',
    fontSize: 15,
    fontFamily: 'NunitoSans-Bold',
  },
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
  const [showSession, setShowSession] = useState(false);

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

  const clearSession = async () => {
    try {
      await AsyncStorage.removeItem(SESSION_CLIPS_KEY);
      await AsyncStorage.removeItem(SESSION_EMBEDDINGS_KEY);
      setShowSession(false);
      Alert.alert('Session Cleared', 'New session started. Pig IDs will reset on the next video.');
    } catch {
      Alert.alert('Error', 'Could not clear session.');
    }
  };

  const saveSessionClip = async (result: any, assetFilename: string) => {
    if (!result?.job_id) return;
    try {
      const savedUrl = await AsyncStorage.getItem(SERVER_URL_KEY);
      const activeUrl = savedUrl || DEFAULT_SERVER_URL;

      const storedEmbeddings = await AsyncStorage.getItem(SESSION_EMBEDDINGS_KEY);
      const persistentEmbeddings = storedEmbeddings ? JSON.parse(storedEmbeddings) : {};

      let pigSummaries = result.pig_summaries ?? [];

      try {
        const matchResponse = await fetch(`${activeUrl}/match-pigs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_job_id: result.job_id,
            persistent_embeddings: persistentEmbeddings,
          }),
        });
        if (matchResponse.ok) {
          const matchResult = await matchResponse.json();
          const idMapping: Record<string, number> = matchResult.id_mapping;
          await AsyncStorage.setItem(SESSION_EMBEDDINGS_KEY, JSON.stringify(matchResult.updated_embeddings));
          pigSummaries = pigSummaries.map((pig: PigSummary) => ({
            ...pig,
            pig_id: idMapping[String(pig.pig_id)] ?? pig.pig_id,
          }));
        }
      } catch (e) {
        console.warn('match-pigs failed, saving with original IDs:', e);
      }

      const storedClips = await AsyncStorage.getItem(SESSION_CLIPS_KEY);
      const clips: SessionClip[] = storedClips ? JSON.parse(storedClips) : [];

      const newClip: SessionClip = {
        job_id: result.job_id,
        filename: assetFilename,
        timestamp: new Date().toLocaleString(),
        clip_index: clips.length + 1,
        pig_summaries: pigSummaries,
        primary_behavior: result.primary_behavior,
        total_unique_pigs: result.total_unique_pigs ?? 0,
        time_series: result.time_series ?? [],
      };

      await AsyncStorage.setItem(SESSION_CLIPS_KEY, JSON.stringify([newClip, ...clips]));
      console.log('Session clip saved:', newClip.filename, 'clip #', newClip.clip_index);
    } catch (e) {
      console.error('Failed to save session clip:', e);
    }
  };

  const navigateToClip = (clip: SessionClip) => {
    router.push({
      pathname: '/results',
      params: {
        filename: clip.filename,
        uri: '',
        type: 'video',
        analysisData: JSON.stringify({
          status: 'ok',
          media_type: 'video',
          primary_behavior: clip.primary_behavior,
          total_unique_pigs: clip.total_unique_pigs,
          pig_summaries: clip.pig_summaries,
          details: clip.pig_summaries.reduce((acc, pig) => {
            Object.entries(pig.behavior_counts).forEach(([b, c]) => {
              acc[b] = (acc[b] ?? 0) + c;
            });
            return acc;
          }, {} as Record<string, number>),
          lethargy_flags: clip.pig_summaries.filter(p => p.is_lethargic).length,
          limping_flags:  clip.pig_summaries.filter(p => p.is_limping).length,
          time_series: clip.time_series ?? [],
        }),
      },
    });
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
              await saveSessionClip(analysisResult, newFile.filename);
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
        await saveSessionClip(analysisResult, newFile.filename);
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
      <SessionModal
        visible={showSession}
        onClose={() => setShowSession(false)}
        onClearSession={clearSession}
        onClipPress={navigateToClip}
      />

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

        <TouchableOpacity
          style={styles.sessionButton}
          onPress={() => setShowSession(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.sessionButtonText}>🐷 View Session Tracking</Text>
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
                onPress={() => navigateToResults(file, file.analysisData)}
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
    marginHorizontal: 20, marginBottom: 10,
    backgroundColor: PIG.roseDark,
    paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: 12, alignItems: 'center',
    shadowColor: PIG.rose, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  liveCameraText: { color: 'white', fontSize: 18, fontFamily: 'NunitoSans-Bold' },

  sessionButton: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: PIG.pink,
    paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: PIG.pinkDark,
  },
  sessionButtonText: { color: PIG.roseDark, fontSize: 15, fontFamily: 'NunitoSans-Bold' },

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