import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image as RNImage, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { AppBar } from '@/components/appbar';
import { DropdownItem } from '@/components/dropdown-item';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Info } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PigSummary {
    pig_id: number;
    predominant_behavior: string;
    behavior_counts: Record<string, number>;
    is_lethargic: boolean;
    is_limping: boolean;
}

interface BehaviorBreakdown {
    count: number;
    pig_ids: number[];
}

interface TimeSeriesEntry {
    time: string;
    pig_count: number;
    behavior_breakdown?: Record<string, BehaviorBreakdown>;
    lethargy: boolean;
    lethargic_ids: number[];
    limping: boolean;
    limping_ids: number[];
}

interface AnalysisResult {
    status: string;
    media_type: 'image' | 'video';
    primary_behavior: string;
    detected_pigs_count?: number;
    total_unique_pigs?: number;
    pig_summaries?: PigSummary[];
    details: Record<string, number>;
    lethargy_flags?: number;
    limping_flags?: number;
    time_series?: TimeSeriesEntry[];
    first_frame?: string;
    job_id?: string;
}

const SERVER_URL_KEY = '@server_url';
const DEFAULT_API_BASE_URL = 'http://192.168.0.101:5000';

function HealthBadge({ label, type }: { label: string; type: 'ok' | 'warn' | 'danger' }) {
    const colors = {
        ok:     { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32' },
        warn:   { bg: '#FFF3E0', border: '#FF9800', text: '#E65100' },
        danger: { bg: '#FFEBEE', border: '#F44336', text: '#C62828' },
    };
    const c = colors[type];
    return (
        <View style={[hb.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Text style={[hb.text, { color: c.text }]}>{label}</Text>
        </View>
    );
}

const hb = StyleSheet.create({
    badge: {
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1.5,
        marginRight: 6,
        marginBottom: 6,
    },
    text: { fontSize: 12, fontFamily: 'NunitoSans-SemiBold' },
});

export default function Results() {
    const params = useLocalSearchParams<{ filename?: string; uri?: string; type?: 'image' | 'video' }>();
    const router = useRouter();
    const { filename, uri, type } = params;

    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [resultData, setResultData] = useState<AnalysisResult | null>(null);
    const [isSavingPdf, setIsSavingPdf] = useState(false);
    const [isExportingVideo, setIsExportingVideo] = useState(false);
    const [serverUrl, setServerUrl] = useState(DEFAULT_API_BASE_URL);
    const [serverUrlLoaded, setServerUrlLoaded] = useState(false);

    useEffect(() => {
        loadServerUrl();
    }, []);

    useEffect(() => {
        if (!serverUrlLoaded) return;
        if (uri && type) {
            analyzeMedia();
        } else {
            setIsLoading(false);
            Alert.alert('Error', 'Missing media file.');
        }
    }, [serverUrlLoaded]);

    const loadServerUrl = async () => {
        try {
            const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
            setServerUrl(saved || DEFAULT_API_BASE_URL);
        } catch {
            setServerUrl(DEFAULT_API_BASE_URL);
        } finally {
            setServerUrlLoaded(true);
        }
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
                method: 'POST',
                body: formData,
                headers: { 'Content-Type': 'multipart/form-data' },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (response.ok) {
                setResultData(data as AnalysisResult);
            } else {
                Alert.alert('Analysis Error', data.error || 'Something went wrong');
            }
        } catch (error) {
            console.error('Upload error:', error);
            Alert.alert('Network Error', 'Could not connect to the server. Check your IP and ensure the Flask app is running.');
        } finally {
            setIsLoading(false);
        }
    };

    const exportAnnotatedVideo = async () => {
        if (!resultData?.job_id) {
            return Alert.alert('Not available', 'No job ID found for this analysis.');
        }
        if (isExportingVideo) return;
        setIsExportingVideo(true);
        Alert.alert('Rendering video…', 'This will take a moment. You can keep using the app.');
        try {
            const response = await fetch(`${serverUrl}/export-annotated-video/${resultData.job_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pig_summaries: resultData.pig_summaries ?? [] }),
            });
            const data = await response.json();
            if (!response.ok) {
                return Alert.alert('Export failed', data.error || 'Server error.');
            }
            const fileName = `annotated-${Date.now()}.mp4`;
            const destFile = new File(Paths.document, fileName);
            await destFile.write(data.annotated_video, { encoding: 'base64' });
            await Sharing.shareAsync(destFile.uri);
        } catch (err) {
            console.error('Export error', err);
            Alert.alert('Export failed', 'Unable to export annotated video.');
        } finally {
            setIsExportingVideo(false);
        }
    };

    const saveResultsAsPdf = async () => {
        if (!resultData) return Alert.alert('No results', 'There are no results to save.');
        if (isSavingPdf) return;
        setIsSavingPdf(true);
        try {
            const rows = Object.entries(resultData.details || {}).map(
                ([k, v]) => `<tr><td style="padding:6px 8px;border:1px solid #eee">${k}</td><td style="padding:6px 8px;border:1px solid #eee;text-align:right">${v}</td></tr>`
            ).join('');

            let pigSummariesHtml = '';
            if (resultData.pig_summaries && resultData.pig_summaries.length > 0) {
                const pigRows = resultData.pig_summaries.map((pig) => {
                    const behaviorsList = Object.entries(pig.behavior_counts).map(([b, c]) => `${b}: ${c}`).join(', ');
                    const alerts = [];
                    if (pig.is_lethargic) alerts.push('Lethargic');
                    if (pig.is_limping) alerts.push('Limping');
                    return `<tr>
                        <td style="padding:6px 8px;border:1px solid #eee">Pig #${pig.pig_id}</td>
                        <td style="padding:6px 8px;border:1px solid #eee">${pig.predominant_behavior}</td>
                        <td style="padding:6px 8px;border:1px solid #eee;font-size:11px">${behaviorsList}</td>
                        <td style="padding:6px 8px;border:1px solid #eee;text-align:center">${alerts.length > 0 ? alerts.join(', ') : 'None'}</td>
                    </tr>`;
                }).join('');
                pigSummariesHtml = `
                    <h3>Individual Pig Summary</h3>
                    <table style="border-collapse:collapse;width:100%;margin-top:8px">
                        <thead><tr>
                            <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Pig ID</th>
                            <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Predominant</th>
                            <th style="text-align:left;padding:6px 8px;border:1px solid #eee">All Behaviors</th>
                            <th style="text-align:center;padding:6px 8px;border:1px solid #eee">Alerts</th>
                        </tr></thead>
                        <tbody>${pigRows}</tbody>
                    </table>`;
            }

            let timeSeriesHtml = '';
            if (resultData.time_series && resultData.time_series.length > 0) {
                const tsRows = resultData.time_series.map((d: TimeSeriesEntry) => {
                    let behaviorBreakdownText = '';
                    if (d.behavior_breakdown) {
                        behaviorBreakdownText = Object.entries(d.behavior_breakdown)
                            .map(([b, data]) => `${b}: ${data.count}`).join(', ');
                    }
                    return `<tr>
                        <td style="padding:6px 8px;border:1px solid #eee">${d.time}</td>
                        <td style="padding:6px 8px;border:1px solid #eee;text-align:right">${d.pig_count ?? 0}</td>
                        <td style="padding:6px 8px;border:1px solid #eee;font-size:11px">${behaviorBreakdownText}</td>
                        <td style="padding:6px 8px;border:1px solid #eee;text-align:center">${d.lethargy ? 'Yes' : 'No'}</td>
                        <td style="padding:6px 8px;border:1px solid #eee;text-align:center">${d.limping ? 'Yes' : 'No'}</td>
                    </tr>`;
                }).join('');
                timeSeriesHtml = `
                    <h3>Time Series</h3>
                    <table style="border-collapse:collapse;width:100%;margin-top:8px">
                        <thead><tr>
                            <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Time</th>
                            <th style="text-align:right;padding:6px 8px;border:1px solid #eee">Pig Count</th>
                            <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Behaviors</th>
                            <th style="text-align:center;padding:6px 8px;border:1px solid #eee">Lethargy</th>
                            <th style="text-align:center;padding:6px 8px;border:1px solid #eee">Limping</th>
                        </tr></thead>
                        <tbody>${tsRows}</tbody>
                    </table>`;
            }

            const html = `
                <html>
                    <head>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <style>
                            body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#222}
                            h1{color:#743535}
                            table{border-collapse:collapse;width:100%;margin-top:12px}
                            th{background:#f7f7f7}
                        </style>
                    </head>
                    <body>
                        <h1>Bantai Baboy — Analysis Report</h1>
                        <p><strong>File:</strong> ${filename ?? 'N/A'}</p>
                        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
                        <h3>Summary</h3>
                        <p>Primary Behavior: <strong>${resultData.primary_behavior}</strong></p>
                        <p>Detected Hogs: <strong>${resultData.detected_pigs_count ?? resultData.total_unique_pigs ?? 'N/A'}</strong></p>
                        <p>Lethargy Alerts: <strong>${resultData.lethargy_flags ?? 0}</strong></p>
                        <p>Limping Alerts: <strong>${resultData.limping_flags ?? 0}</strong></p>
                        <h3>Behavior Breakdown</h3>
                        <table>
                            <thead><tr>
                                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Behavior</th>
                                <th style="text-align:right;padding:6px 8px;border:1px solid #eee">Count</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                        ${pigSummariesHtml}
                        ${timeSeriesHtml}
                    </body>
                </html>`;

            const { uri: pdfUri } = await Print.printToFileAsync({ html });
            const destFile = new File(Paths.document, `bantai-report-${Date.now()}.pdf`);
            await new File(pdfUri).copy(destFile);
            await Sharing.shareAsync(destFile.uri);
        } catch (err) {
            console.error('PDF error', err);
            Alert.alert('Export failed', 'Unable to create or share PDF.');
        } finally {
            setIsSavingPdf(false);
        }
    };

    const exportToCSV = async () => {
        if (!resultData) return Alert.alert('No data', 'No analysis data to export.');
        if (isSavingPdf) return;
        setIsSavingPdf(true);
        try {
            let csvContent = 'Time,Pig Count,Behavior,Count,Lethargy,Limping\n';
            if (resultData.time_series) {
                resultData.time_series.forEach((entry) => {
                    Object.entries(entry.behavior_breakdown || {}).forEach(([behavior, data]) => {
                        csvContent += `${entry.time},${entry.pig_count},${behavior},${data.count},${entry.lethargy ? 'Yes' : 'No'},${entry.limping ? 'Yes' : 'No'}\n`;
                    });
                });
            }
            const destFile = new File(Paths.document, `bantai-data-${Date.now()}.csv`);
            await destFile.write(csvContent);
            await Sharing.shareAsync(destFile.uri);
            Alert.alert('Success', 'CSV data exported!');
        } catch (err) {
            console.error('CSV export error', err);
            Alert.alert('Export failed', 'Unable to export CSV.');
        } finally {
            setIsSavingPdf(false);
        }
    };

    const totalPigs = resultData?.detected_pigs_count ?? resultData?.total_unique_pigs ?? 0;
    const lethargyCount = resultData?.lethargy_flags ?? 0;
    const limpingCount = resultData?.limping_flags ?? 0;
    const normalCount = Math.max(0, totalPigs - lethargyCount - limpingCount);

    // Determine preview image source
    const previewUri = type === 'image'
        ? uri
        : resultData?.first_frame
            ? `data:image/jpeg;base64,${resultData.first_frame}`
            : uri;

    return (
        <View style={styles.container}>
            <AppBar
                title="Bant-AI Baboy"
                leftIcon={<ArrowLeft size={28} color={Colors.light.secondary} weight="bold" />}
                onLeftIconPress={() => router.back()}
            />

            <View style={styles.infoNote} pointerEvents="none">
                <Info size={14} color={Colors.light.secondary} weight="bold" />
                <Text style={styles.infoNoteText}>Results may vary depending on the change of scenes in the video.</Text>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>

                {/* Media preview — always a static image now */}
                <View style={styles.previewWrapper}>
                    <RNImage
                        source={{ uri: previewUri as string }}
                        style={styles.mediaPreview}
                        resizeMode="cover"
                    />
                    {!isLoading && resultData && (
                        <View style={styles.hogsBadge}>
                            <Text style={styles.hogsBadgeText}>
                                {type === 'image'
                                    ? `Detected Hogs: ${resultData.detected_pigs_count ?? 0}`
                                    : `Total Unique Hogs: ${resultData.total_unique_pigs ?? 0}`}
                            </Text>
                        </View>
                    )}
                    {type === 'video' && (
                        <View style={styles.videoOverlayTag}>
                            <Text style={styles.videoOverlayText}>🎥 First Frame Preview</Text>
                        </View>
                    )}
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.light.primary} />
                        <Text style={styles.loadingText}>Analyzing behavior...</Text>
                    </View>
                ) : resultData ? (
                    <>
                        <View style={styles.healthBadgeRow}>
                            <HealthBadge label={`✅ Normal: ${normalCount}`} type="ok" />
                            {lethargyCount > 0 && (
                                <HealthBadge
                                    label={`😴 Lethargic: ${lethargyCount}`}
                                    type={lethargyCount <= 2 ? 'warn' : 'danger'}
                                />
                            )}
                            {limpingCount > 0 && (
                                <HealthBadge
                                    label={`🦵 Limping: ${limpingCount}`}
                                    type={limpingCount <= 2 ? 'warn' : 'danger'}
                                />
                            )}
                        </View>

                        <DropdownItem title='Results' defaultExpanded={true}>
                            <Text style={styles.placeholderContent}>
                                Primary Behavior: {resultData.primary_behavior}
                            </Text>

                            {resultData.pig_summaries && resultData.pig_summaries.length > 0 && (
                                <View style={{ marginTop: 12, marginBottom: 8 }}>
                                    <Text style={[styles.placeholderContent, { fontWeight: 'bold', marginBottom: 8 }]}>
                                        Individual Pigs ({resultData.total_unique_pigs} total):
                                    </Text>
                                    {resultData.pig_summaries.map((pig) => (
                                        <View
                                            key={pig.pig_id}
                                            style={{
                                                backgroundColor: '#f5f5f5',
                                                padding: 10,
                                                borderRadius: 8,
                                                marginBottom: 8,
                                                borderLeftWidth: 3,
                                                borderLeftColor: pig.is_lethargic || pig.is_limping ? '#D32F2F' : '#388E3C',
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <Text style={[styles.placeholderContent, { fontWeight: 'bold' }]}>
                                                    Pig #{pig.pig_id}
                                                </Text>
                                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                                    {pig.is_lethargic && <HealthBadge label="😴 Lethargic" type="danger" />}
                                                    {pig.is_limping && <HealthBadge label="🦵 Limping" type="warn" />}
                                                    {!pig.is_lethargic && !pig.is_limping && <HealthBadge label="✅ Normal" type="ok" />}
                                                </View>
                                            </View>
                                            <Text style={styles.placeholderContent}>
                                                Main behavior: {pig.predominant_behavior}
                                            </Text>
                                            <Text style={[styles.placeholderContent, { fontSize: 12, marginTop: 4 }]}>
                                                All behaviors: {Object.entries(pig.behavior_counts)
                                                    .map(([b, c]) => `${b} (${c})`).join(', ')}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {resultData.lethargy_flags !== undefined && (
                                <>
                                    <Text style={[
                                        styles.placeholderContent,
                                        {
                                            color: resultData.lethargy_flags > 0 ? '#D32F2F' : '#388E3C',
                                            fontWeight: 'bold',
                                            marginTop: 8,
                                        }
                                    ]}>
                                        Lethargy Alerts: {resultData.lethargy_flags} {resultData.lethargy_flags > 0 ? '⚠️' : '✅'}
                                    </Text>
                                    {resultData.time_series && resultData.time_series.filter(d => d.lethargy).length > 0 && (
                                        <View style={{ marginTop: 6 }}>
                                            <Text style={[styles.placeholderContent, { color: '#D32F2F' }]}>Flagged at:</Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                                {resultData.time_series.filter(d => d.lethargy).map((d, i) => {
                                                    const hogCount = d.lethargic_ids?.length || 0;
                                                    return (
                                                        <View key={i} style={{
                                                            backgroundColor: '#FFEBEE', borderRadius: 12,
                                                            paddingHorizontal: 10, paddingVertical: 4,
                                                            borderWidth: 1, borderColor: '#D32F2F',
                                                        }}>
                                                            <Text style={{ color: '#D32F2F', fontSize: 12, fontFamily: 'NunitoSans-SemiBold' }}>
                                                                {d.time} — {hogCount} hog{hogCount !== 1 ? 's' : ''}
                                                            </Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}

                            {resultData.limping_flags !== undefined && resultData.limping_flags > 0 && (
                                <Text style={[styles.placeholderContent, { color: '#E65100', fontWeight: 'bold', marginTop: 8 }]}>
                                    Limping Alerts: {resultData.limping_flags} 🦵⚠️
                                </Text>
                            )}

                            <Text style={styles.placeholderContent}>
                                {'\n'}Overall Behavior Counts:
                                {Object.entries(resultData.details || {}).map(([behavior, count]) =>
                                    `\n- ${behavior}: ${count}`
                                ).join('')}
                            </Text>
                        </DropdownItem>

                        <DropdownItem title='Causes'>
                            <Text style={styles.placeholderContent}>
                                Based on the behavior ({resultData.primary_behavior}), possible context:
                                {'\n'}- Observe if this matches their normal feeding/resting schedule.
                                {'\n'}- Environmental factors may influence this behavior.
                            </Text>
                        </DropdownItem>

                        <DropdownItem title='Suggestions' defaultExpanded={false}>
                            <Text style={styles.placeholderContent}>
                                Suggested Actions:
                                {'\n'}- Continue monitoring via Bantai Baboy.
                                {'\n'}- Ensure water and feed stations are accessible.
                            </Text>
                        </DropdownItem>

                        <TouchableOpacity
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
                            style={styles.analyticsTextButton}
                        >
                            <Text style={styles.analyticsTextButtonLabel}>Analytics</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <Text style={styles.errorText}>No results available.</Text>
                )}
            </ScrollView>

            {resultData && (
                <View style={styles.bottomContainer}>
                    <TouchableOpacity
                        style={[styles.saveButton, isSavingPdf && styles.saveButtonDisabled]}
                        activeOpacity={0.8}
                        onPress={saveResultsAsPdf}
                        disabled={isSavingPdf}
                    >
                        <Text style={styles.saveButtonText}>
                            {isSavingPdf ? 'Saving PDF...' : 'Save PDF Report'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.saveButton, styles.csvButton, isSavingPdf && styles.saveButtonDisabled]}
                        activeOpacity={0.8}
                        onPress={exportToCSV}
                        disabled={isSavingPdf}
                    >
                        <Text style={styles.saveButtonText}>Export Data (CSV)</Text>
                    </TouchableOpacity>

                    {type === 'video' && resultData.job_id && (
                        <TouchableOpacity
                            style={[styles.saveButton, styles.saveVideoButton, isExportingVideo && styles.saveButtonDisabled]}
                            activeOpacity={0.8}
                            onPress={exportAnnotatedVideo}
                            disabled={isExportingVideo}
                        >
                            <Text style={styles.saveButtonText}>
                                {isExportingVideo ? 'Rendering Video...' : 'Export Annotated Video'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.light.background },
    content: { flex: 1 },
    csvButton: { backgroundColor: '#388E3C' },
    previewWrapper: { width: '100%', overflow: 'hidden' },
    mediaPreview: { width: '100%', height: 280 },
    hogsBadge: {
        position: 'absolute', bottom: 16, alignSelf: 'center',
        backgroundColor: Colors.light.white,
        paddingVertical: 6, paddingHorizontal: 20, borderRadius: 20,
    },
    hogsBadgeText: { color: Colors.light.secondary, fontSize: 14, fontFamily: 'NunitoSans-SemiBold' },
    videoOverlayTag: {
        position: 'absolute', top: 12, left: 12,
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8,
    },
    videoOverlayText: { color: 'white', fontSize: 11, fontFamily: 'NunitoSans-SemiBold' },
    placeholderContent: { fontSize: 14, color: Colors.light.subtext, fontFamily: 'NunitoSans-SemiBold', lineHeight: 20 },
    loadingContainer: { alignItems: 'center', marginTop: 30 },
    loadingText: { marginTop: 10, color: Colors.light.subtext, fontFamily: 'NunitoSans-Regular' },
    errorText: { textAlign: 'center', color: 'red', marginTop: 20, fontFamily: 'NunitoSans-Regular' },
    scrollContent: { paddingBottom: 24 },
    healthBadgeRow: {
        flexDirection: 'row', flexWrap: 'wrap',
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
    },
    analyticsTextButton: { marginTop: 8, marginLeft: 16, alignSelf: 'flex-start' },
    analyticsTextButtonLabel: { color: Colors.light.secondary, fontSize: 16, fontFamily: 'NunitoSans-Bold' },
    bottomContainer: {
        paddingHorizontal: 100, paddingVertical: 16,
        backgroundColor: Colors.light.background, gap: 12,
    },
    saveButton: {
        backgroundColor: Colors.light.results, paddingVertical: 16,
        borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    },
    saveVideoButton: { backgroundColor: Colors.light.primary },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: Colors.light.white, fontSize: 15, fontFamily: 'NunitoSans-SemiBold' },
    infoNote: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'transparent', paddingHorizontal: 14, paddingVertical: 8, gap: 6,
    },
    infoNoteText: {
        color: Colors.light.secondary, fontSize: 11,
        fontFamily: 'NunitoSans-SemiBold', flexShrink: 1, opacity: 0.6,
    },
    mediaContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    detectedTitle: { fontSize: 18, fontFamily: 'NunitoSans-SemiBold', textAlign: 'center', marginBottom: 16, color: Colors.light.text },
});