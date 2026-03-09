import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { AppBar } from '@/components/appbar';
import { DropdownItem } from '@/components/dropdown-item';
import { Colors } from '@/theme/colors';

const screenWidth = Dimensions.get('window').width;

// ─── Chart config ─────────────────────────────────────────────────────────────
const chartConfig = {
    backgroundColor: Colors.light.background,
    backgroundGradientFrom: Colors.light.background,
    backgroundGradientTo: Colors.light.background,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(116, 53, 53, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(116, 53, 53, ${opacity})`,
    style: { borderRadius: 8 },
    propsForBackgroundLines: { strokeDasharray: '', stroke: '#F2D9D9' },
    propsForLabels: { fontFamily: 'NunitoSans-Regular', fontSize: 11 },
};

// ─── Behavior color palette ───────────────────────────────────────────────────
const BEHAVIOR_COLORS: Record<string, string> = {
    'Eating':        '#4CAF50',
    'Drinking':      '#2196F3',
    'Walking':       '#FF9800',
    'Sleeping':      '#9C27B0',
    'Lying':         '#795548',
    'Investigating': '#FFC107',
    'Moutend':       '#E91E63',
};
const FALLBACK_COLORS = ['#743535', '#E57373', '#FF8A65', '#FFB74D', '#81C784', '#64B5F6', '#BA68C8'];

// ─── Mini Pie Chart (pure RN, no extra lib) ───────────────────────────────────
function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return null;

    const SIZE = 160;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const r = SIZE / 2 - 8;

    // Build SVG arc paths
    let startAngle = -Math.PI / 2;
    const slices = data.map(d => {
        const angle = (d.value / total) * 2 * Math.PI;
        const endAngle = startAngle + angle;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const path = `M${cx},${cy} L${x1},${y1} A${r},${r},0,${largeArc},1,${x2},${y2} Z`;
        const slice = { ...d, path, startAngle, endAngle };
        startAngle = endAngle;
        return slice;
    });

    // We'll use a View-based approach since react-native-svg may not be available
    // Instead, show a horizontal stacked bar as the "pie" equivalent
    return (
        <View style={pie.container}>
            {/* Stacked bar */}
            <View style={pie.bar}>
                {data.map((d, i) => (
                    <View
                        key={i}
                        style={{
                            flex: d.value,
                            backgroundColor: d.color,
                            height: 28,
                            borderRadius: i === 0 ? 6 : i === data.length - 1 ? 6 : 0,
                            borderTopLeftRadius: i === 0 ? 6 : 0,
                            borderBottomLeftRadius: i === 0 ? 6 : 0,
                            borderTopRightRadius: i === data.length - 1 ? 6 : 0,
                            borderBottomRightRadius: i === data.length - 1 ? 6 : 0,
                        }}
                    />
                ))}
            </View>
            {/* Percentages */}
            <View style={pie.bar}>
                {data.map((d, i) => {
                    const pct = Math.round((d.value / total) * 100);
                    if (pct < 8) return null; // skip tiny labels
                    return (
                        <View key={i} style={{ flex: d.value, alignItems: 'center' }}>
                            <Text style={pie.pct}>{pct}%</Text>
                        </View>
                    );
                })}
            </View>
            {/* Legend */}
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
    legendText: { fontSize: 12, fontFamily: 'NunitoSans-Regular', color: Colors.light.text },
});

// ─── Health Badge ─────────────────────────────────────────────────────────────
function HealthBadge({ label, count, type }: { label: string; count: number; type: 'ok' | 'warn' | 'danger' }) {
    const colors = {
        ok:     { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32' },
        warn:   { bg: '#FFF3E0', border: '#FF9800', text: '#E65100' },
        danger: { bg: '#FFEBEE', border: '#F44336', text: '#C62828' },
    };
    const c = colors[type];
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
        borderRadius: 20, borderWidth: 1.5,
        marginRight: 8, marginBottom: 8,
    },
    text: { fontSize: 13, fontFamily: 'NunitoSans-SemiBold' },
    countBubble: {
        width: 22, height: 22, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
    },
    countText: { color: 'white', fontSize: 11, fontFamily: 'NunitoSans-Bold' },
});

// ─── Metric Row ───────────────────────────────────────────────────────────────
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
        paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
    },
    label: { fontSize: 14, fontFamily: 'NunitoSans-SemiBold', color: Colors.light.text },
    sub: { fontSize: 11, fontFamily: 'NunitoSans-Regular', color: Colors.light.subtext, marginTop: 2 },
    value: { fontSize: 14, fontFamily: 'Nunito-Black', color: Colors.light.secondary },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function Analytics() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const details: Record<string, number> = params.details ? JSON.parse(params.details as string) : {};
    const timeSeriesRaw: any[] = params.time_series ? JSON.parse(params.time_series as string) : [];
    const pigSummaries: any[] = params.pig_summaries ? JSON.parse(params.pig_summaries as string) : [];
    const primaryBehavior = (params.primary_behavior as string) ?? '';
    const lethargyFlags = params.lethargy_flags ? Number(params.lethargy_flags) : 0;
    const limpingFlags = params.limping_flags ? Number(params.limping_flags) : 0;
    const detectedCount = params.detected_pigs_count ? Number(params.detected_pigs_count) : 0;

    // ── Behavior breakdown data ──────────────────────────────────────────────
    const behaviorEntries = Object.entries(details).filter(([, v]) => v > 0);
    const pieData = behaviorEntries.map(([label, value], i) => ({
        label,
        value,
        color: BEHAVIOR_COLORS[label] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }));

    // ── Bar chart ────────────────────────────────────────────────────────────
    const barData = {
        labels: behaviorEntries.map(([k]) => k.length > 5 ? k.slice(0, 5) + '.' : k),
        datasets: [{ data: behaviorEntries.map(([, v]) => v) }],
    };

    // ── Line chart ───────────────────────────────────────────────────────────
    const timeLabels = timeSeriesRaw.map((d: any) => d.time);
    const timeValues = timeSeriesRaw.map((d: any) => d.pig_count ?? 0);
    const lineData = {
        labels: timeLabels,
        datasets: [{ data: timeValues.length > 0 ? timeValues : [0], strokeWidth: 2 }],
    };

    const lethargyIndices = timeSeriesRaw.map((d, i) => d.lethargy ? i : -1).filter(i => i !== -1);
    const limpingIndices = timeSeriesRaw.map((d, i) => d.limping ? i : -1).filter(i => i !== -1);

    // ── Health badge type ────────────────────────────────────────────────────
    const lethargyType = lethargyFlags === 0 ? 'ok' : lethargyFlags <= 2 ? 'warn' : 'danger';
    const limpingType  = limpingFlags === 0  ? 'ok' : limpingFlags <= 2  ? 'warn' : 'danger';

    // ── Per-session runtime metric (from time series density) ────────────────
    const totalFramesCovered = timeSeriesRaw.length * 2; // 2s intervals
    const alertRate = detectedCount > 0
        ? (((lethargyFlags + limpingFlags) / detectedCount) * 100).toFixed(1)
        : '0.0';

    return (
        <View style={styles.container}>
            <AppBar
                title="Bant-AI Baboy"
                leftIcon={<ArrowLeft size={28} color={Colors.light.secondary} weight="bold" />}
                onLeftIconPress={() => router.back()}
            />

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>

                {/* ── Health Status Badges ─────────────────────────────────── */}
                <Text style={styles.sectionTitle}>Health Status</Text>
                <View style={styles.badgeRow}>
                    <HealthBadge
                        label="Normal"
                        count={Math.max(0, detectedCount - lethargyFlags - limpingFlags)}
                        type="ok"
                    />
                    <HealthBadge label="😴 Lethargic" count={lethargyFlags} type={lethargyType} />
                    <HealthBadge label="🦵 Limping"   count={limpingFlags}  type={limpingType}  />
                </View>

                {/* ── Behavior Breakdown (stacked bar) ─────────────────────── */}
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Behavior Breakdown</Text>
                {pieData.length > 0 ? (
                    <PieChart data={pieData} />
                ) : (
                    <Text style={styles.noData}>No behavior data available.</Text>
                )}

                {/* ── Bar Chart ─────────────────────────────────────────────── */}
                {behaviorEntries.length > 0 && (
                    <View style={styles.chartContainer}>
                        <BarChart
                            data={barData}
                            width={screenWidth - 32}
                            height={200}
                            chartConfig={chartConfig}
                            yAxisLabel=""
                            yAxisSuffix=""
                            fromZero
                            showValuesOnTopOfBars
                            withInnerLines
                            style={styles.chart}
                        />
                        <Text style={styles.xAxisLabel}>Behavior counts</Text>
                    </View>
                )}

                {/* ── Line Chart — Hogs Over Time ───────────────────────────── */}
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
                                withDots
                                withInnerLines
                                style={styles.chart}
                                renderDotContent={({ x, y, index }) => {
                                    const entry = timeSeriesRaw[index];
                                    if (!entry?.lethargy && !entry?.limping) return null;
                                    return (
                                        <View
                                            key={index}
                                            style={{ position: 'absolute', left: x - 14, top: y - 38, alignItems: 'center' }}
                                        >
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

                        {/* Lethargy timestamps */}
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

                        {/* Limping timestamps */}
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

                {/* ── Summary of Detection ─────────────────────────────────── */}
                <DropdownItem title="Summary of Detection" defaultExpanded>
                    <MetricRow label="Primary Behavior" value={primaryBehavior || '—'} />
                    <MetricRow label="Total Hogs Detected" value={String(detectedCount)} />
                    <MetricRow label="Lethargy Alerts" value={`${lethargyFlags} ${lethargyFlags > 0 ? '⚠️' : '✅'}`} />
                    <MetricRow label="Limping Alerts"   value={`${limpingFlags}  ${limpingFlags  > 0 ? '⚠️' : '✅'}`} />
                    <MetricRow
                        label="Health Alert Rate"
                        value={`${alertRate}%`}
                        sub="(lethargic + limping) / total hogs"
                    />
                    <MetricRow
                        label="Video Duration Covered"
                        value={totalFramesCovered > 0 ? `~${totalFramesCovered}s` : '—'}
                        sub="based on 2s analysis intervals"
                    />
                    {behaviorEntries.map(([behavior, count]) => (
                        <MetricRow
                            key={behavior}
                            label={behavior}
                            value={String(count)}
                        />
                    ))}
                </DropdownItem>

                {/* ── Model Metrics ─────────────────────────────────────────── */}
                <DropdownItem title="Model Metrics">
                    <Text style={styles.metricsGroupLabel}>🔍 YOLO Detection (YOLOv8)</Text>
                    <MetricRow label="mAP@0.5"   value="—" sub="Mean Average Precision at IoU 0.5" />
                    <MetricRow label="Precision"  value="—" sub="True positives / (TP + FP)" />
                    <MetricRow label="Recall"     value="—" sub="True positives / (TP + FN)" />

                    <Text style={[styles.metricsGroupLabel, { marginTop: 14 }]}>🧠 MobileNet Classifier</Text>
                    <MetricRow label="Overall Accuracy" value="—" sub="Correct classifications / total" />
                    <MetricRow label="Top-1 Confidence" value="—" sub="Avg. confidence on top prediction" />
                    <MetricRow
                        label="Behaviors Classified"
                        value={String(behaviorEntries.length)}
                        sub="Distinct behaviors detected this session"
                    />

                    <Text style={[styles.metricsGroupLabel, { marginTop: 14 }]}>⚡ Runtime (This Session)</Text>
                    <MetricRow
                        label="Intervals Analyzed"
                        value={String(timeSeriesRaw.length)}
                        sub="Number of 2s analysis windows"
                    />
                    <MetricRow
                        label="Health Alert Rate"
                        value={`${alertRate}%`}
                        sub="Alerts raised relative to hog count"
                    />
                    <MetricRow
                        label="Unique Hogs Tracked"
                        value={String(detectedCount)}
                        sub="Via ByteTrack ID assignment"
                    />
                </DropdownItem>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.light.background },
    content: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    sectionTitle: {
        fontSize: 18, fontFamily: 'Nunito-Bold',
        color: Colors.light.secondary,
        paddingHorizontal: 16, marginBottom: 12, marginTop: 8,
    },
    badgeRow: {
        flexDirection: 'row', flexWrap: 'wrap',
        paddingHorizontal: 16, marginBottom: 4,
    },
    chartContainer: { alignItems: 'center', marginBottom: 8, paddingHorizontal: 16 },
    chart: { borderRadius: 8 },
    xAxisLabel: {
        color: Colors.light.secondary, fontSize: 13,
        fontFamily: 'NunitoSans-SemiBold', marginTop: 4, alignSelf: 'center',
    },
    legendHint: {
        fontSize: 12, fontFamily: 'NunitoSans-Regular', color: Colors.light.subtext,
    },
    flagContainer: { marginHorizontal: 16, marginTop: 6, marginBottom: 8 },
    flagTitle: { fontFamily: 'NunitoSans-SemiBold', fontSize: 13, marginBottom: 6 },
    flagBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    flagBadge: {
        borderRadius: 12, paddingHorizontal: 10,
        paddingVertical: 4, borderWidth: 1,
    },
    flagBadgeText: { fontSize: 12, fontFamily: 'NunitoSans-SemiBold' },
    noData: {
        fontSize: 14, fontFamily: 'NunitoSans-Regular',
        color: Colors.light.subtext, paddingHorizontal: 16, marginBottom: 12,
    },
    metricsGroupLabel: {
        fontSize: 13, fontFamily: 'NunitoSans-Bold',
        color: Colors.light.secondary, marginBottom: 6, marginTop: 4,
    },
});