import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Image as RNImage,
    ActivityIndicator, Alert, TouchableOpacity, Modal,
    Dimensions,
} from 'react-native';
import { AppBar } from '@/components/appbar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Info, Lightbulb, Sparkle, ChartBar, List } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW } = Dimensions.get('window');

const PIG = {
    pink:       '#F2A7B8',
    pinkLight:  '#FAE0E7',
    pinkDark:   '#C2446A',
    rose:       '#E8637A',
    roseDark:   '#743535',
    cream:      '#FFF5F7',
    snout:      '#F4C2C2',
};

interface PigSummary {
    pig_id: number;
    predominant_behavior: string;
    behavior_counts: Record<string, number>;
    is_lethargic: boolean;
    is_limping: boolean;
}
interface BehaviorBreakdown { count: number; pig_ids: number[]; }
interface TimeSeriesEntry {
    time: string; pig_count: number;
    behavior_breakdown?: Record<string, BehaviorBreakdown>;
    lethargy: boolean; lethargic_ids: number[];
    limping: boolean; limping_ids: number[];
}
interface AnalysisResult {
    status: string; media_type: 'image' | 'video';
    primary_behavior: string;
    detected_pigs_count?: number; total_unique_pigs?: number;
    pig_summaries?: PigSummary[];
    details: Record<string, number>;
    lethargy_flags?: number; limping_flags?: number;
    time_series?: TimeSeriesEntry[];
    first_frame?: string; job_id?: string;
}

const SERVER_URL_KEY = '@server_url';
const DEFAULT_API_BASE_URL = 'http://192.168.0.101:5000';

const BEHAVIOR_ICONS: Record<string, string> = {
    'Drinking':      '💧',
    'Eating':        '🍽️',
    'Investigating': '🔍',
    'Lying':         '😌',
    'Moutend':       '🔺',
    'Sleeping':      '😴',
    'Walking':       '🚶',
};

const BEHAVIOR_CAUSES: Record<string, string[]> = {
    'Eating':        ['Regular feeding schedule', 'High energy demand or growth phase', 'Competition for feed among herd'],
    'Drinking':      ['Dehydration or heat stress', 'Post-exercise or post-feeding recovery', 'High salt or dry feed intake'],
    'Walking':       ['Exploring the pen environment', 'Searching for food or water sources', 'Social interaction with other pigs'],
    'Sleeping':      ['Normal rest cycle after feeding', 'Post-exercise fatigue', 'Low stimulation or quiet environment'],
    'Lying':         ['Resting or thermoregulation', 'Fatigue after prolonged activity', 'Comfortable bedding conditions'],
    'Investigating': ['Novel object or unfamiliar scent', 'Natural foraging instinct', 'Social curiosity toward pen mates'],
    'Moutend':       ['Dominance behavior within hierarchy', 'Reproductive signaling', 'Stress response to overcrowding'],
};

const BEHAVIOR_SUGGESTIONS: Record<string, string[]> = {
    'Eating':        ['Ensure feed is evenly distributed across troughs', 'Check for dominant pigs blocking access', 'Monitor individual feed intake if possible'],
    'Drinking':      ['Check water supply and nipple drinker flow rate', 'Ensure all drinkers are functional and accessible', 'Monitor pen temperature for heat stress signs'],
    'Walking':       ['Ensure adequate pen space per pig', 'Check for environmental stressors', 'Monitor for limping or irregular gait patterns'],
    'Sleeping':      ['Maintain a quiet environment during rest periods', 'Ensure bedding is clean, dry, and comfortable', 'Monitor total sleep duration per day'],
    'Lying':         ['Check pen temperature — excessive lying may indicate heat', 'Ensure ventilation is adequate', 'Monitor if lying duration is abnormally long'],
    'Investigating': ['Check for foreign objects that may harm the pigs', 'Provide enrichment materials to satisfy curiosity', 'Normal behavior — no immediate action required'],
    'Moutend':       ['Check stocking density — may be overcrowded', 'Monitor for injury resulting from mounting', 'Consult a veterinarian if behavior is persistent'],
};

const getBehaviorLabel = (b: string) => `${BEHAVIOR_ICONS[b] ?? '🐷'} ${b}`;

function HealthBadge({ label, type }: { label: string; type: 'ok' | 'warn' | 'danger' }) {
    const c = {
        ok:     { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32' },
        warn:   { bg: '#FFF3E0', border: '#FF9800', text: '#E65100' },
        danger: { bg: '#FFEBEE', border: '#F44336', text: '#C62828' },
    }[type];
    return (
        <View style={[hb.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Text style={[hb.text, { color: c.text }]}>{label}</Text>
        </View>
    );
}
const hb = StyleSheet.create({
    badge: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5, marginRight: 6, marginBottom: 6 },
    text: { fontSize: 12, fontFamily: 'NunitoSans-SemiBold' },
});

function PigCard({ pig }: { pig: PigSummary }) {
    const isAlert = pig.is_lethargic || pig.is_limping;
    return (
        <View style={[pc.card, isAlert && pc.cardAlert]}>
            <View style={pc.header}>
                <View style={pc.idBadge}>
                    <Text style={pc.idText}>🐷 #{pig.pig_id}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                    {pig.is_lethargic && <HealthBadge label="😴 Lethargic" type="danger" />}
                    {pig.is_limping   && <HealthBadge label="🦵 Limping"   type="warn"   />}
                    {!isAlert         && <HealthBadge label="✅ Normal"     type="ok"     />}
                </View>
            </View>
            <Text style={pc.primary}>{getBehaviorLabel(pig.predominant_behavior)}</Text>
            <View style={pc.behaviorRow}>
                {Object.entries(pig.behavior_counts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([b, c]) => (
                        <View key={b} style={pc.bChip}>
                            <Text style={pc.bChipText}>{BEHAVIOR_ICONS[b] ?? '🐷'} {b} ({c})</Text>
                        </View>
                    ))}
            </View>
        </View>
    );
}
const pc = StyleSheet.create({
    card: {
        backgroundColor: PIG.cream, borderRadius: 14, padding: 12,
        marginBottom: 10, borderWidth: 1.5, borderColor: PIG.snout,
    },
    cardAlert: { borderColor: '#F44336', backgroundColor: '#FFF5F5' },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    idBadge: {
        backgroundColor: PIG.pink, borderRadius: 10,
        paddingHorizontal: 10, paddingVertical: 3, marginRight: 8,
    },
    idText: { fontSize: 13, fontFamily: 'NunitoSans-Bold', color: PIG.roseDark },
    primary: { fontSize: 14, fontFamily: 'NunitoSans-SemiBold', color: PIG.roseDark, marginBottom: 6 },
    behaviorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    bChip: {
        backgroundColor: PIG.pinkLight, borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 3,
        borderWidth: 1, borderColor: PIG.pink,
    },
    bChipText: { fontSize: 11, fontFamily: 'NunitoSans-SemiBold', color: PIG.pinkDark },
});

function BehaviorModal({ visible, onClose, details }: {
    visible: boolean; onClose: () => void; details: Record<string, number>;
}) {
    const sorted = Object.entries(details).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
    const total  = sorted.reduce((s, [, v]) => s + v, 0);
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={bm.overlay}>
                <View style={bm.sheet}>
                    <View style={bm.handle} />
                    <Text style={bm.title}>Overall Behavior Detected</Text>
                    {sorted.map(([behavior, count], i) => {
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                            <View key={behavior} style={bm.row}>
                                <View style={bm.rankBadge}>
                                    <Text style={bm.rankText}>{i + 1}</Text>
                                </View>
                                <Text style={bm.behaviorName}>{getBehaviorLabel(behavior)}</Text>
                                <View style={bm.barTrack}>
                                    <View style={[bm.barFill, { width: `${pct}%` }]} />
                                </View>
                                <Text style={bm.countText}>{count}</Text>
                                <Text style={bm.pctText}>{pct}%</Text>
                            </View>
                        );
                    })}
                    <TouchableOpacity style={bm.closeBtn} onPress={onClose} activeOpacity={0.8}>
                        <Text style={bm.closeBtnText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
const bm = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: PIG.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: PIG.pink, alignSelf: 'center', marginBottom: 16 },
    title: { fontSize: 18, fontFamily: 'NunitoSans-Bold', color: PIG.roseDark, marginBottom: 16 },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
    rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: PIG.pink, alignItems: 'center', justifyContent: 'center' },
    rankText: { fontSize: 11, fontFamily: 'NunitoSans-Bold', color: PIG.roseDark },
    behaviorName: { fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: PIG.roseDark, width: 120 },
    barTrack: { flex: 1, height: 8, backgroundColor: PIG.pinkLight, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: 8, backgroundColor: PIG.rose, borderRadius: 4 },
    countText: { fontSize: 12, fontFamily: 'NunitoSans-Bold', color: PIG.roseDark, width: 28, textAlign: 'right' },
    pctText: { fontSize: 11, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, width: 34, textAlign: 'right' },
    closeBtn: { marginTop: 16, backgroundColor: PIG.rose, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    closeBtnText: { color: 'white', fontSize: 15, fontFamily: 'NunitoSans-Bold' },
});

function InfoModal({ visible, onClose, title, icon, items }: {
    visible: boolean; onClose: () => void;
    title: string; icon: string; items: string[];
}) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={im.overlay}>
                <View style={im.sheet}>
                    <View style={im.handle} />
                    <Text style={im.emoji}>{icon}</Text>
                    <Text style={im.title}>{title}</Text>
                    {items.map((item, i) => (
                        <View key={i} style={im.item}>
                            <View style={im.dot} />
                            <Text style={im.itemText}>{item}</Text>
                        </View>
                    ))}
                    <TouchableOpacity style={im.closeBtn} onPress={onClose} activeOpacity={0.8}>
                        <Text style={im.closeBtnText}>Got it</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
const im = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: PIG.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: PIG.pink, alignSelf: 'center', marginBottom: 16 },
    emoji: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
    title: { fontSize: 18, fontFamily: 'NunitoSans-Bold', color: PIG.roseDark, marginBottom: 16, textAlign: 'center' },
    item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PIG.rose, marginTop: 6 },
    itemText: { fontSize: 14, fontFamily: 'NunitoSans-Regular', color: PIG.roseDark, flex: 1, lineHeight: 22 },
    closeBtn: { marginTop: 16, backgroundColor: PIG.rose, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    closeBtnText: { color: 'white', fontSize: 15, fontFamily: 'NunitoSans-Bold' },
});

export default function Results() {
    const params = useLocalSearchParams<{ filename?: string; uri?: string; type?: 'image' | 'video' }>();
    const router = useRouter();
    const { filename, uri, type } = params;

    const [isLoading,        setIsLoading]        = useState(true);
    const [resultData,       setResultData]        = useState<AnalysisResult | null>(null);
    const [isSavingPdf,      setIsSavingPdf]       = useState(false);
    const [isExportingVideo, setIsExportingVideo]  = useState(false);
    const [serverUrl,        setServerUrl]         = useState(DEFAULT_API_BASE_URL);
    const [serverUrlLoaded,  setServerUrlLoaded]   = useState(false);
    const [showExports,      setShowExports]       = useState(false);
    const [showBehaviorModal,    setShowBehaviorModal]    = useState(false);
    const [showCausesModal,      setShowCausesModal]      = useState(false);
    const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);

    //for storage clearing/accidents 

    // useEffect(() => {
    // AsyncStorage.clear();
    // }, []);

    // useEffect(() => {
    // if (!uri || !type) {
    //     router.dismissAll();
    //     }
    // }, []);

    useEffect(() => { loadServerUrl(); }, []);
    useEffect(() => {
        if (!serverUrlLoaded) return;
        if (uri && type) analyzeMedia();
        else { setIsLoading(false); Alert.alert('Error', 'Missing media file.'); }
    }, [serverUrlLoaded]);

    

    const loadServerUrl = async () => {
        try {
            const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
            setServerUrl(saved || DEFAULT_API_BASE_URL);
        } catch { setServerUrl(DEFAULT_API_BASE_URL); }
        finally { setServerUrlLoaded(true); }
    };

    const analyzeMedia = async () => {
        try {
            setIsLoading(true);
            const formData = new FormData();
            formData.append('file', {
                uri: uri as string,
                name: filename || (type === 'image' ? 'photo.jpg' : 'video.mp4'),
                type: type === 'image' ? 'image/jpeg' : 'video/mp4',
            } as any);
            const endpoint = type === 'image' ? '/analyze-image' : '/analyze-video-with-overlay';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);
            const response = await fetch(`${serverUrl}${endpoint}`, {
                method: 'POST', body: formData,
                headers: { 'Content-Type': 'multipart/form-data' },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const data = await response.json();
            if (response.ok) setResultData(data as AnalysisResult);
            else Alert.alert('Analysis Error', data.error || 'Something went wrong');
        } catch {
            Alert.alert('Network Error', 'Could not connect to the server. Check your IP and ensure the Flask app is running.');
        } finally { setIsLoading(false); }
    };

    const exportAnnotatedVideo = async () => {
        if (!resultData?.job_id) return Alert.alert('Not available', 'No job ID found.');
        if (isExportingVideo) return;
        setIsExportingVideo(true);
        Alert.alert('Rendering video…', 'This will take a moment.');
        try {
            const response = await fetch(`${serverUrl}/export-annotated-video/${resultData.job_id}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pig_summaries: resultData.pig_summaries ?? [] }),
            });
            const data = await response.json();
            if (!response.ok) return Alert.alert('Export failed', data.error || 'Server error.');
            const destFile = new File(Paths.document, `annotated-${Date.now()}.mp4`);
            await destFile.write(data.annotated_video, { encoding: 'base64' });
            await Sharing.shareAsync(destFile.uri);
        } catch { Alert.alert('Export failed', 'Unable to export annotated video.'); }
        finally { setIsExportingVideo(false); }
    };

    const saveResultsAsPdf = async () => {
        if (!resultData || isSavingPdf) return;
        setIsSavingPdf(true);
        try {
            const rows = Object.entries(resultData.details || {})
                .sort(([, a], [, b]) => b - a)
                .map(([k, v]) => `<tr><td style="padding:6px 8px;border:1px solid #eee">${BEHAVIOR_ICONS[k] ?? ''} ${k}</td><td style="padding:6px 8px;border:1px solid #eee;text-align:right">${v}</td></tr>`)
                .join('');
            let pigRows = '';
            if (resultData.pig_summaries?.length) {
                pigRows = resultData.pig_summaries.map(pig => {
                    const bl = Object.entries(pig.behavior_counts).map(([b, c]) => `${b}: ${c}`).join(', ');
                    const al = [pig.is_lethargic && 'Lethargic', pig.is_limping && 'Limping'].filter(Boolean).join(', ') || 'None';
                    return `<tr><td style="padding:6px 8px;border:1px solid #eee">Pig #${pig.pig_id}</td><td style="padding:6px 8px;border:1px solid #eee">${pig.predominant_behavior}</td><td style="padding:6px 8px;border:1px solid #eee;font-size:11px">${bl}</td><td style="padding:6px 8px;border:1px solid #eee;text-align:center">${al}</td></tr>`;
                }).join('');
            }
            const html = `<html><head><style>body{font-family:Arial,sans-serif;padding:20px;color:#222}h1{color:#743535}table{border-collapse:collapse;width:100%;margin-top:12px}th{background:#f7f7f7}</style></head><body>
                <h1>Bantai Baboy — Analysis Report</h1>
                <p><strong>File:</strong> ${filename ?? 'N/A'}</p>
                <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
                <h3>Summary</h3>
                <p>Primary Behavior: <strong>${resultData.primary_behavior}</strong></p>
                <p>Detected Hogs: <strong>${resultData.detected_pigs_count ?? resultData.total_unique_pigs ?? 'N/A'}</strong></p>
                <p>Lethargy Alerts: <strong>${resultData.lethargy_flags ?? 0}</strong></p>
                <p>Limping Alerts: <strong>${resultData.limping_flags ?? 0}</strong></p>
                <h3>Behavior Breakdown</h3>
                <table><thead><tr><th style="text-align:left;padding:6px 8px;border:1px solid #eee">Behavior</th><th style="text-align:right;padding:6px 8px;border:1px solid #eee">Count</th></tr></thead><tbody>${rows}</tbody></table>
                ${pigRows ? `<h3>Individual Pig Summary</h3><table><thead><tr><th style="padding:6px 8px;border:1px solid #eee">Pig</th><th style="padding:6px 8px;border:1px solid #eee">Behavior</th><th style="padding:6px 8px;border:1px solid #eee">All</th><th style="padding:6px 8px;border:1px solid #eee">Alerts</th></tr></thead><tbody>${pigRows}</tbody></table>` : ''}
            </body></html>`;
            const { uri: pdfUri } = await Print.printToFileAsync({ html });
            const dest = new File(Paths.document, `bantai-report-${Date.now()}.pdf`);
            await new File(pdfUri).copy(dest);
            await Sharing.shareAsync(dest.uri);
        } catch { Alert.alert('Export failed', 'Unable to create PDF.'); }
        finally { setIsSavingPdf(false); }
    };

    const exportToCSV = async () => {
        if (!resultData || isSavingPdf) return;
        setIsSavingPdf(true);
        try {
            let csv = 'Time,Pig Count,Behavior,Count,Lethargy,Limping\n';
            resultData.time_series?.forEach(entry => {
                Object.entries(entry.behavior_breakdown || {}).forEach(([b, d]) => {
                    csv += `${entry.time},${entry.pig_count},${b},${d.count},${entry.lethargy ? 'Yes' : 'No'},${entry.limping ? 'Yes' : 'No'}\n`;
                });
            });
            const dest = new File(Paths.document, `bantai-data-${Date.now()}.csv`);
            await dest.write(csv);
            await Sharing.shareAsync(dest.uri);
        } catch { Alert.alert('Export failed', 'Unable to export CSV.'); }
        finally { setIsSavingPdf(false); }
    };

    const totalPigs     = resultData?.detected_pigs_count ?? resultData?.total_unique_pigs ?? 0;
    const lethargyCount = resultData?.lethargy_flags ?? 0;
    const limpingCount  = resultData?.limping_flags  ?? 0;
    const normalCount   = Math.max(0, totalPigs - lethargyCount - limpingCount);
    const primaryBehavior = resultData?.primary_behavior ?? '';
    const causesItems      = BEHAVIOR_CAUSES[primaryBehavior]      ?? ['Behavior context not available for this detection.'];
    const suggestionsItems = BEHAVIOR_SUGGESTIONS[primaryBehavior] ?? ['Continue monitoring your herd regularly.'];

    const previewUri = type === 'image'
        ? uri
        : resultData?.first_frame
            ? `data:image/jpeg;base64,${resultData.first_frame}`
            : uri;

    return (
        <View style={s.container}>

            <BehaviorModal
                visible={showBehaviorModal}
                onClose={() => setShowBehaviorModal(false)}
                details={resultData?.details ?? {}}
            />
            <InfoModal
                visible={showCausesModal}
                onClose={() => setShowCausesModal(false)}
                title={`Why ${primaryBehavior}?`}
                icon="🔍"
                items={causesItems}
            />
            <InfoModal
                visible={showSuggestionsModal}
                onClose={() => setShowSuggestionsModal(false)}
                title="Suggested Actions"
                icon="💡"
                items={suggestionsItems}
            />

            <AppBar
                title="Bant-AI Baboy"
                leftIcon={<ArrowLeft size={26} color={PIG.roseDark} weight="bold" />}
                onLeftIconPress={() => router.back()}
                rightIcon={
                    resultData ? (
                        <View style={s.appBarActions}>
                            <TouchableOpacity style={s.appBarBtn} onPress={() => setShowCausesModal(true)} activeOpacity={0.7}>
                                <Lightbulb size={22} color={PIG.roseDark} weight="fill" />
                                <Text style={s.appBarBtnLabel}>Causes</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.appBarBtn} onPress={() => setShowSuggestionsModal(true)} activeOpacity={0.7}>
                                <Sparkle size={22} color={PIG.roseDark} weight="fill" />
                                <Text style={s.appBarBtnLabel}>Tips</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={s.appBarBtn}
                                onPress={() => router.push({
                                    pathname: '/analytics',
                                    params: {
                                        details: JSON.stringify(resultData.details),
                                        primary_behavior: resultData.primary_behavior,
                                        lethargy_flags: resultData.lethargy_flags,
                                        detected_pigs_count: resultData.detected_pigs_count || resultData.total_unique_pigs,
                                        time_series: JSON.stringify(resultData.time_series ?? []),
                                        limping_flags: resultData.limping_flags,
                                        pig_summaries: JSON.stringify(resultData.pig_summaries ?? []),
                                    }
                                })}
                                activeOpacity={0.7}
                            >
                                <ChartBar size={22} color={PIG.roseDark} weight="fill" />
                                <Text style={s.appBarBtnLabel}>Analytics</Text>
                            </TouchableOpacity>
                        </View>
                    ) : undefined
                }
            />

            <View style={s.infoNote} pointerEvents="none">
                <Info size={13} color={PIG.pinkDark} weight="bold" />
                <Text style={s.infoNoteText}>Results may vary depending on scene changes in the video.</Text>
            </View>

            <ScrollView style={s.content} contentContainerStyle={s.scrollContent}>

                <View style={s.previewWrapper}>
                    <RNImage source={{ uri: previewUri as string }} style={s.mediaPreview} resizeMode="cover" />

                    {!isLoading && resultData && (
                        <View style={s.hogsBadge}>
                            <Text style={s.hogsBadgeText}>
                                🐷 {type === 'image'
                                    ? `${resultData.detected_pigs_count ?? 0} Detected`
                                    : `${resultData.total_unique_pigs ?? 0} Unique Hogs`}
                            </Text>
                        </View>
                    )}

                    {type === 'video' && (
                        <View style={s.videoTag}>
                            <Text style={s.videoTagText}>🎥 First Frame</Text>
                        </View>
                    )}

                    {resultData && !isLoading && (
                        <TouchableOpacity style={s.listIconBtn} onPress={() => setShowBehaviorModal(true)} activeOpacity={0.8}>
                            <List size={18} color="white" weight="bold" />
                        </TouchableOpacity>
                    )}
                </View>

                {isLoading ? (
                    <View style={s.loadingContainer}>
                        <ActivityIndicator size="large" color={PIG.rose} />
                        <Text style={s.loadingText}>Analyzing behavior...</Text>
                    </View>
                ) : resultData ? (
                    <>

                        <View style={s.summaryStrip}>
                            <View style={s.summaryItem}>
                                <Text style={s.summaryValue}>{totalPigs}</Text>
                                <Text style={s.summaryLabel}>Hogs</Text>
                            </View>
                            <View style={s.summaryDivider} />
                            <View style={s.summaryItem}>
                                <Text style={s.summaryValue} numberOfLines={1}>
                                    {BEHAVIOR_ICONS[primaryBehavior] ?? '🐷'} {primaryBehavior}
                                </Text>
                                <Text style={s.summaryLabel}>Primary</Text>
                            </View>
                            <View style={s.summaryDivider} />
                            <View style={s.summaryItem}>
                                <Text style={[s.summaryValue, { color: lethargyCount + limpingCount > 0 ? '#FFCDD2' : '#C8E6C9' }]}>
                                    {lethargyCount + limpingCount > 0 ? `⚠️ ${lethargyCount + limpingCount}` : '✅ 0'}
                                </Text>
                                <Text style={s.summaryLabel}>Alerts</Text>
                            </View>
                        </View>

                        <View style={s.badgeRow}>
                            <HealthBadge label={`✅ Normal: ${normalCount}`} type="ok" />
                            {lethargyCount > 0 && (
                                <HealthBadge label={`😴 Lethargic: ${lethargyCount}`} type={lethargyCount <= 2 ? 'warn' : 'danger'} />
                            )}
                            {limpingCount > 0 && (
                                <HealthBadge label={`🦵 Limping: ${limpingCount}`} type={limpingCount <= 2 ? 'warn' : 'danger'} />
                            )}
                        </View>

                        {resultData.pig_summaries && resultData.pig_summaries.length > 0 && (
                            <View style={s.section}>
                                <View style={s.sectionHeader}>
                                    <Text style={s.sectionTitle}>🐷 Pig Tracking</Text>
                                    <Text style={s.sectionSub}>{resultData.total_unique_pigs} unique</Text>
                                </View>
                                {resultData.pig_summaries.map(pig => (
                                    <PigCard key={pig.pig_id} pig={pig} />
                                ))}
                            </View>
                        )}

                        {(lethargyCount > 0 || limpingCount > 0) && resultData.time_series && (
                            <View style={s.section}>
                                <Text style={s.sectionTitle}>⚠️ Health Flags</Text>

                                {resultData.time_series.filter(d => d.lethargy).length > 0 && (
                                    <View style={{ marginTop: 8, marginBottom: 12 }}>
                                        <Text style={s.flagLabel}>😴 Lethargy flagged at:</Text>
                                        <View style={s.flagRow}>
                                            {resultData.time_series.filter(d => d.lethargy).map((d, i) => (
                                                <View key={i} style={[s.flagChip, { borderColor: '#D32F2F', backgroundColor: '#FFEBEE' }]}>
                                                    <Text style={[s.flagChipText, { color: '#C62828' }]}>
                                                        {d.time} · {d.lethargic_ids?.length ?? 0} hog{d.lethargic_ids?.length !== 1 ? 's' : ''}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {resultData.time_series.filter(d => d.limping).length > 0 && (
                                    <View>
                                        <Text style={s.flagLabel}>🦵 Limping flagged at:</Text>
                                        <View style={s.flagRow}>
                                            {resultData.time_series.filter(d => d.limping).map((d, i) => (
                                                <View key={i} style={[s.flagChip, { borderColor: '#E65100', backgroundColor: '#FFF3E0' }]}>
                                                    <Text style={[s.flagChipText, { color: '#E65100' }]}>
                                                        {d.time} · {d.limping_ids?.length ?? 0} hog{d.limping_ids?.length !== 1 ? 's' : ''}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </>
                ) : (
                    <Text style={s.errorText}>No results available.</Text>
                )}
            </ScrollView>

            {resultData && (
                <View style={s.bottomBar}>
                    {showExports && (
                        <View style={s.exportRow}>
                            <TouchableOpacity
                                style={[s.exportBtn, isSavingPdf && s.exportBtnDisabled]}
                                onPress={saveResultsAsPdf} disabled={isSavingPdf} activeOpacity={0.8}
                            >
                                <Text style={s.exportIcon}>📄</Text>
                                <Text style={s.exportLabel}>{isSavingPdf ? '...' : 'PDF'}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[s.exportBtn, s.exportBtnGreen, isSavingPdf && s.exportBtnDisabled]}
                                onPress={exportToCSV} disabled={isSavingPdf} activeOpacity={0.8}
                            >
                                <Text style={s.exportIcon}>📊</Text>
                                <Text style={s.exportLabel}>CSV</Text>
                            </TouchableOpacity>

                            {type === 'video' && resultData.job_id && (
                                <TouchableOpacity
                                    style={[s.exportBtn, s.exportBtnBlue, isExportingVideo && s.exportBtnDisabled]}
                                    onPress={exportAnnotatedVideo} disabled={isExportingVideo} activeOpacity={0.8}
                                >
                                    <Text style={s.exportIcon}>🎥</Text>
                                    <Text style={s.exportLabel}>{isExportingVideo ? '...' : 'MP4'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    <TouchableOpacity
                        style={s.saveToggleBtn}
                        onPress={() => setShowExports(p => !p)}
                        activeOpacity={0.85}
                    >
                        <Text style={s.saveToggleBtnText}>
                            {showExports ? '✕ Close' : '💾 Save'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: PIG.cream 
    },

    content: { 
        flex: 1 
    },

    scrollContent: {
        paddingBottom: 110 
    },

    appBarActions: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 2 
    },
    appBarBtn: { 
        alignItems: 'center', 
        paddingHorizontal: 8, 
        paddingVertical: 4 
    },
    appBarBtnLabel: { 
        fontSize: 10, 
        fontFamily: 'NunitoSans-SemiBold', 
        color: PIG.roseDark, 
        marginTop: 2 
    },

    infoNote: {
        flexDirection: 'row', 
        alignItems: 'center',
        paddingHorizontal: 14, 
        paddingVertical: 7, 
        gap: 6,
        backgroundColor: PIG.pinkLight,
    },

    infoNoteText: { 
        fontSize: 11, 
        fontFamily: 'NunitoSans-SemiBold', 
        color: PIG.pinkDark, 
        flexShrink: 1, 
        opacity: 0.85 
    },

    previewWrapper: { 
        width: '100%', 
        height: 260, 
        overflow: 'hidden' 
    },

    mediaPreview:{ 
        width: '100%', 
        height: '100%' 
    },

    hogsBadge: {
        position: 'absolute', 
        bottom: 12, 
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingVertical: 5, 
        paddingHorizontal: 16, 
        borderRadius: 20,
    },

    hogsBadgeText: {
        color: 'white', 
        fontSize: 13, 
        fontFamily: 'NunitoSans-SemiBold' 
    },

    videoTag: {
        position: 'absolute', 
        top: 12, 
        left: 12,
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingVertical: 4, 
        paddingHorizontal: 10, 
        borderRadius: 8,
    },

    videoTagText: { 
        color: 'white', 
        fontSize: 11, 
        fontFamily: 'NunitoSans-SemiBold' 
    },

    listIconBtn: {
        position: 'absolute', 
        bottom: 12, 
        right: 12,
        backgroundColor: PIG.rose,
        width: 36, 
        height: 36, 
        borderRadius: 18,
        alignItems: 'center', 
        justifyContent: 'center',
        elevation: 4,
    },

    summaryStrip: {
        flexDirection: 'row', 
        backgroundColor: PIG.roseDark,
        paddingVertical: 14, 
        paddingHorizontal: 20, 
        alignItems: 'center',
    },

    summaryItem: { 
        flex: 1, alignItems: 'center' 
    },

    summaryValue:{ 
        fontSize: 15,
        fontFamily: 'NunitoSans-Bold', 
        color: 'white', 
        textAlign: 'center' 
    },

    summaryLabel:  { 
        fontSize: 11, 
        fontFamily: 'NunitoSans-Regular', 
        color: PIG.snout, marginTop: 2 
    },

    summaryDivider: { 
        width: 1, 
        height: 36, 
        backgroundColor: 'rgba(255,255,255,0.2)' 
    },

    badgeRow: { 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        paddingHorizontal: 16, 
        paddingTop: 12, 
        paddingBottom: 4 
    },

    section: { 
        paddingHorizontal: 16, 
        marginTop: 16 
    },
    sectionHeader: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: 10 
    },

    sectionTitle: { 
        fontSize: 16, 
        fontFamily: 'NunitoSans-Bold', 
        color: PIG.roseDark 
    },

    sectionSub: { 
        fontSize: 12, 
        fontFamily: 'NunitoSans-Regular', 
        color: PIG.pinkDark 
    },

    flagLabel:    { 
        fontSize: 13, 
        fontFamily: 'NunitoSans-SemiBold', 
        color: PIG.roseDark, 
        marginBottom: 6 
    },

    flagRow: { 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        gap: 6 
    },
        
    flagChip: { 
        borderRadius: 12, 
        paddingHorizontal: 10, 
        paddingVertical: 4, 
        borderWidth: 1 
    },

    flagChipText: { 
        fontSize: 12, 
        fontFamily: 'NunitoSans-SemiBold' 
    },

    loadingContainer: { 
        alignItems: 'center', 
        marginTop: 40 
    },

    loadingText: {
        marginTop: 10, 
        color: PIG.pinkDark, 
        fontFamily: 'NunitoSans-Regular' 
    },

    errorText: { 
        textAlign: 'center', 
        color: 'red', 
        marginTop: 20, 
        fontFamily: 'NunitoSans-Regular' 
    },

    bottomBar: {
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0,
        backgroundColor: PIG.cream,
        paddingHorizontal: 20, 
        paddingBottom: 28, 
        paddingTop: 12,
        borderTopWidth: 1, 
        borderTopColor: PIG.snout,
        elevation: 10,
    },

    exportRow: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        gap: 12, 
        marginBottom: 12 
    },

    exportBtn: {
        flex: 1, 
        backgroundColor: PIG.roseDark,
        borderRadius: 12, 
        paddingVertical: 12,
        alignItems: 'center', 
        justifyContent: 'center',
    },

    exportBtnGreen: { 
        backgroundColor: '#388E3C' 
    },
    exportBtnBlue: { 
        backgroundColor: '#1565C0' 
    },
    exportBtnDisabled: { 
        opacity: 0.5 
    },
    exportIcon: { 
        fontSize: 20 
    },
    exportLabel: { 
        fontSize: 12, 
        fontFamily: 'NunitoSans-Bold', 
        color: 'white', 
        marginTop: 2 
    },

    saveToggleBtn: {
        backgroundColor: PIG.rose, 
        borderRadius: 14,
        paddingVertical: 14, 
        alignItems: 'center',
    },

    saveToggleBtnText: { 
        color: 'white', 
        fontSize: 15, 
        fontFamily: 'NunitoSans-Bold'
    },
    
});