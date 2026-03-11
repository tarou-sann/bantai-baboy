import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { AppBar } from '@/components/appbar';
import { DropdownItem } from '@/components/dropdown-item';
import { Colors } from '@/theme/colors';

const screenWidth = Dimensions.get('window').width;

const PIG = {
    pink:      '#F2A7B8',
    pinkLight: '#FAE0E7',
    pinkDark:  '#C2446A',
    rose:      '#E8637A',
    roseDark:  '#743535',
    cream:     '#FFF5F7',
    snout:     '#F4C2C2',
};

const chartConfig = {
    backgroundColor: PIG.cream,
    backgroundGradientFrom: PIG.cream,
    backgroundGradientTo: PIG.cream,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(116, 53, 53, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(116, 53, 53, ${opacity})`,
    style: { borderRadius: 8 },
    propsForBackgroundLines: { strokeDasharray: '', stroke: PIG.snout },
    propsForLabels: { fontFamily: 'NunitoSans-Regular', fontSize: 11 },
};

const BEHAVIOR_COLORS: Record<string, string> = {
    'Eating':        '#4CAF50',
    'Drinking':      '#2196F3',
    'Walking':       '#FF9800',
    'Sleeping':      '#9C27B0',
    'Lying':         '#795548',
    'Investigating': '#FFC107',
    'Moutend':       '#E91E63',
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

const getBehaviorLabel = (behavior: string) =>
    `${BEHAVIOR_ICONS[behavior] ?? '🐷'} ${behavior}`;

const FALLBACK_COLORS = [PIG.roseDark, PIG.rose, '#FF8A65', '#FFB74D', '#81C784', '#64B5F6', '#BA68C8'];

function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return null;
    return (
        <View style={pie.container}>
            <View style={pie.bar}>
                {data.map((d, i) => (
                    <View
                        key={i}
                        style={{
                            flex: d.value,
                            backgroundColor: d.color,
                            height: 28,
                            borderTopLeftRadius:    i === 0 ? 6 : 0,
                            borderBottomLeftRadius: i === 0 ? 6 : 0,
                            borderTopRightRadius:    i === data.length - 1 ? 6 : 0,
                            borderBottomRightRadius: i === data.length - 1 ? 6 : 0,
                        }}
                    />
                ))}
            </View>
            <View style={pie.bar}>
                {data.map((d, i) => {
                    const pct = Math.round((d.value / total) * 100);
                    if (pct < 8) return null;
                    return (
                        <View key={i} style={{ flex: d.value, alignItems: 'center' }}>
                            <Text style={pie.pct}>{pct}%</Text>
                        </View>
                    );
                })}
            </View>
            <View style={pie.legend}>
                {data.map((d, i) => (
                    <View key={i} style={pie.legendItem}>
                        <View style={[pie.dot, { backgroundColor: d.color }]} />
                        <Text style={pie.legendText}>{d.label}: {d.value}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

const pie = StyleSheet.create({
    container: { width: '100%', paddingHorizontal: 16, marginBottom: 8 },
    bar: { flexDirection: 'row', width: '100%', marginBottom: 4 },
    pct: { fontSize: 11, fontFamily: 'NunitoSans-SemiBold', color: 'white', marginTop: 4 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, fontFamily: 'NunitoSans-Regular', color: PIG.roseDark },
});

function HealthBadge({ label, count, type }: { label: string; count: number; type: 'ok' | 'warn' | 'danger' }) {
    const c = {
        ok:     { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32' },
        warn:   { bg: '#FFF3E0', border: '#FF9800', text: '#E65100' },
        danger: { bg: '#FFEBEE', border: '#F44336', text: '#C62828' },
    }[type];
    return (
        <View style={[hb.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Text style={[hb.text, { color: c.text }]}>{label}</Text>
            <View style={[hb.countBubble, { backgroundColor: c.border }]}>
                <Text style={hb.countText}>{count}</Text>
            </View>
        </View>
    );
}

const hb = StyleSheet.create({
    badge: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 8, paddingHorizontal: 14,
        borderRadius: 20, borderWidth: 1.5, marginRight: 8, marginBottom: 8,
    },
    text: { fontSize: 13, fontFamily: 'NunitoSans-SemiBold' },
    countBubble: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    countText: { color: 'white', fontSize: 11, fontFamily: 'NunitoSans-Bold' },
});

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <View style={mr.row}>
            <View style={{ flex: 1 }}>
                <Text style={mr.label}>{label}</Text>
                {sub && <Text style={mr.sub}>{sub}</Text>}
            </View>
            <Text style={mr.value}>{value}</Text>
        </View>
    );
}

const mr = StyleSheet.create({
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: PIG.snout,
    },
    label: { fontSize: 14, fontFamily: 'NunitoSans-SemiBold', color: PIG.roseDark },
    sub: { fontSize: 11, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, marginTop: 2 },
    value: { fontSize: 14, fontFamily: 'Nunito-Black', color: PIG.rose },
});

export default function Analytics() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const details: Record<string, number> = params.details ? JSON.parse(params.details as string) : {};
    const timeSeriesRaw: any[] = params.time_series ? JSON.parse(params.time_series as string) : [];
    const pigSummaries: any[] = params.pig_summaries ? JSON.parse(params.pig_summaries as string) : [];
    const primaryBehavior = (params.primary_behavior as string) ?? '';
    const lethargyFlags = params.lethargy_flags ? Number(params.lethargy_flags) : 0;
    const limpingFlags  = params.limping_flags  ? Number(params.limping_flags)  : 0;
    const detectedCount = params.detected_pigs_count ? Number(params.detected_pigs_count) : 0;

    const behaviorEntries = Object.entries(details).filter(([, v]) => v > 0);

    const pieData = behaviorEntries.map(([label, value], i) => ({
        label: getBehaviorLabel(label),
        value,
        color: BEHAVIOR_COLORS[label] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }));

    const barData = {
        labels: behaviorEntries.map(([k]) => `${BEHAVIOR_ICONS[k] ?? '🐷'}`),
        datasets: [{ data: behaviorEntries.map(([, v]) => v) }],
    };

    const timeLabels  = timeSeriesRaw.map((d: any) => d.time);
    const timeValues  = timeSeriesRaw.map((d: any) => d.pig_count ?? 0);
    const lineData = {
        labels: timeLabels,
        datasets: [{ data: timeValues.length > 0 ? timeValues : [0], strokeWidth: 2 }],
    };

    const lethargyIndices = timeSeriesRaw.map((d, i) => d.lethargy ? i : -1).filter(i => i !== -1);
    const limpingIndices  = timeSeriesRaw.map((d, i) => d.limping  ? i : -1).filter(i => i !== -1);

    const lethargyType = lethargyFlags === 0 ? 'ok' : lethargyFlags <= 2 ? 'warn' : 'danger';
    const limpingType  = limpingFlags  === 0 ? 'ok' : limpingFlags  <= 2 ? 'warn' : 'danger';

    const totalFramesCovered = timeSeriesRaw.length * 2;
    const alertRate = detectedCount > 0
        ? (((lethargyFlags + limpingFlags) / detectedCount) * 100).toFixed(1)
        : '0.0';

    return (
        <View style={styles.container}>
            <AppBar
                title="Bant-AI Baboy"
                leftIcon={<ArrowLeft size={28} color={PIG.roseDark} weight="bold" />}
                onLeftIconPress={() => router.back()}
            />

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>

                <Text style={styles.sectionTitle}>Health Status</Text>
                <View style={styles.badgeRow}>
                    <HealthBadge label="✅ Normal"      count={Math.max(0, detectedCount - lethargyFlags - limpingFlags)} type="ok" />
                    <HealthBadge label="😴 Lethargic"   count={lethargyFlags} type={lethargyType} />
                    <HealthBadge label="🦵 Limping"     count={limpingFlags}  type={limpingType}  />
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Behavior Breakdown</Text>
                {pieData.length > 0
                    ? <PieChart data={pieData} />
                    : <Text style={styles.noData}>No behavior data available.</Text>
                }

                {behaviorEntries.length > 0 && (
                    <View style={styles.chartContainer}>
                        <BarChart
                            data={barData}
                            width={screenWidth - 32}
                            height={200}
                            chartConfig={chartConfig}
                            yAxisLabel="" yAxisSuffix=""
                            fromZero showValuesOnTopOfBars withInnerLines
                            style={styles.chart}
                        />
                        <Text style={styles.xAxisLabel}>Behavior counts</Text>
                    </View>
                )}

                {timeSeriesRaw.length > 0 && (
                    <>
                        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Hogs Detected Over Time</Text>
                        <View style={styles.chartContainer}>
                            <LineChart
                                data={lineData}
                                width={screenWidth - 32}
                                height={220}
                                chartConfig={chartConfig}
                                bezier={false}
                                withDots withInnerLines
                                style={styles.chart}
                                renderDotContent={({ x, y, index }) => {
                                    const entry = timeSeriesRaw[index];
                                    if (!entry?.lethargy && !entry?.limping) return null;
                                    return (
                                        <View key={index} style={{ position: 'absolute', left: x - 14, top: y - 38, alignItems: 'center' }}>
                                            {entry.lethargy && <Text style={{ fontSize: 13 }}>😴</Text>}
                                            {entry.limping  && <Text style={{ fontSize: 13 }}>🦵</Text>}
                                        </View>
                                    );
                                }}
                            />
                            <Text style={styles.xAxisLabel}>Time (seconds)</Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 16, marginBottom: 12 }}>
                            <Text style={styles.legendHint}>😴 Lethargy detected</Text>
                            <Text style={styles.legendHint}>🦵 Limping detected</Text>
                        </View>

                        {lethargyIndices.length > 0 && (
                            <View style={styles.flagContainer}>
                                <Text style={[styles.flagTitle, { color: '#D32F2F' }]}>😴 Lethargy flagged at:</Text>
                                <View style={styles.flagBadges}>
                                    {lethargyIndices.map(i => (
                                        <View key={i} style={[styles.flagBadge, { backgroundColor: '#FFEBEE', borderColor: '#D32F2F' }]}>
                                            <Text style={[styles.flagBadgeText, { color: '#D32F2F' }]}>
                                                {timeLabels[i]} — {timeSeriesRaw[i].lethargic_ids?.length ?? 0} hog{timeSeriesRaw[i].lethargic_ids?.length !== 1 ? 's' : ''}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {limpingIndices.length > 0 && (
                            <View style={[styles.flagContainer, { marginTop: 8 }]}>
                                <Text style={[styles.flagTitle, { color: '#E65100' }]}>🦵 Limping flagged at:</Text>
                                <View style={styles.flagBadges}>
                                    {limpingIndices.map(i => (
                                        <View key={i} style={[styles.flagBadge, { backgroundColor: '#FFF3E0', borderColor: '#E65100' }]}>
                                            <Text style={[styles.flagBadgeText, { color: '#E65100' }]}>
                                                {timeLabels[i]} — {timeSeriesRaw[i].limping_ids?.length ?? 0} hog{timeSeriesRaw[i].limping_ids?.length !== 1 ? 's' : ''}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </>
                )}

                <DropdownItem title="Summary of Detection" defaultExpanded>
                    <MetricRow label="Primary Behavior"      value={primaryBehavior || '—'} />
                    <MetricRow label="Total Hogs Detected"   value={String(detectedCount)} />
                    <MetricRow label="Lethargy Alerts"       value={`${lethargyFlags} ${lethargyFlags > 0 ? '⚠️' : '✅'}`} />
                    <MetricRow label="Limping Alerts"        value={`${limpingFlags}  ${limpingFlags  > 0 ? '⚠️' : '✅'}`} />
                    <MetricRow label="Health Alert Rate"     value={`${alertRate}%`} sub="(lethargic + limping) / total hogs" />
                    <MetricRow
                        label="Video Duration Covered"
                        value={totalFramesCovered > 0 ? `~${totalFramesCovered}s` : '—'}
                        sub="based on 2s analysis intervals"
                    />
                    {behaviorEntries.map(([behavior, count]) => (
                        <MetricRow key={behavior} label={getBehaviorLabel(behavior)} value={String(count)} />
                    ))}
                </DropdownItem>

                <DropdownItem title="Model Metrics">
                    <Text style={styles.metricsGroupLabel}>🔍 YOLO Detection (YOLOv8)</Text>
                    <MetricRow label="mAP@50-95"  value="91%" sub="Overall object detection performance" />
                    <MetricRow label="Precision"  value="84%" sub="Accuracy of positive predictions" />
                    <MetricRow label="Recall"     value="81%" sub="Ability to find all actual targets" />

                    <Text style={[styles.metricsGroupLabel, { marginTop: 14 }]}>🧠 MobileNet Classifier</Text>
                    <MetricRow label="Classification Accuracy"  value="88%" sub="Percentage of correctly predicted labels" />
                    <MetricRow label="Training/Validation Loss" value="0.18" sub="Model error rate (lower is better)" />
                    <MetricRow label="Behaviors Classified"     value={String(behaviorEntries.length)} sub="Distinct behaviors detected this session" />

                    <Text style={[styles.metricsGroupLabel, { marginTop: 14 }]}>⚡ Runtime (This Session)</Text>
                    <MetricRow label="Intervals Analyzed"   value={String(timeSeriesRaw.length)} sub="Number of 2s analysis windows" />
                    <MetricRow label="Health Alert Rate"    value={`${alertRate}%`}              sub="Alerts raised relative to hog count" />
                    <MetricRow label="Unique Hogs Tracked"  value={String(detectedCount)}        sub="Via ByteTrack ID assignment" />
                </DropdownItem>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: PIG.cream },
    content: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    sectionTitle: {
        fontSize: 18, fontFamily: 'NunitoSans-Bold',
        color: PIG.roseDark, paddingHorizontal: 16, marginBottom: 12, marginTop: 8,
    },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 4 },
    chartContainer: { alignItems: 'center', marginBottom: 8, paddingHorizontal: 16 },
    chart: { borderRadius: 8 },
    xAxisLabel: { color: PIG.pinkDark, fontSize: 13, fontFamily: 'NunitoSans-SemiBold', marginTop: 4, alignSelf: 'center' },
    legendHint: { fontSize: 12, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark },
    flagContainer: { marginHorizontal: 16, marginTop: 6, marginBottom: 8 },
    flagTitle: { fontFamily: 'NunitoSans-SemiBold', fontSize: 13, marginBottom: 6 },
    flagBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    flagBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
    flagBadgeText: { fontSize: 12, fontFamily: 'NunitoSans-SemiBold' },
    noData: { fontSize: 14, fontFamily: 'NunitoSans-Regular', color: PIG.pinkDark, paddingHorizontal: 16, marginBottom: 12 },
    metricsGroupLabel: { fontSize: 13, fontFamily: 'NunitoSans-Bold', color: PIG.rose, marginBottom: 6, marginTop: 4 },
});