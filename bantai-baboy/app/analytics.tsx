import React from 'react';
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

const chartConfig = {
    backgroundColor: Colors.light.background,
    backgroundGradientFrom: Colors.light.background,
    backgroundGradientTo: Colors.light.background,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(116, 53, 53, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(116, 53, 53, ${opacity})`,
    style: {
        borderRadius: 8,
    },
    propsForBackgroundLines: {
        strokeDasharray: '',
        stroke: '#F2D9D9',
    },
    propsForLabels: {
        fontFamily: 'NunitoSans-Regular',
        fontSize: 11,
    },
};

export default function Analytics() {
    const router = useRouter();
    const params = useLocalSearchParams();

    // Parse analytics data passed from results
    const details = params.details ? JSON.parse(params.details as string) : null;
    const timeData = params.timeData ? JSON.parse(params.timeData as string) : null;
    const primaryBehavior = params.primary_behavior as string ?? '';
    const lethargyFlags = params.lethargy_flags ? Number(params.lethargy_flags) : 0;
    const detectedCount = params.detected_pigs_count ? Number(params.detected_pigs_count) : 0;

    // Bar chart — activity breakdown
    const activityLabels = details ? Object.keys(details) : ['Eating', 'Sleeping', 'Standing', 'Awake'];
    const activityValues = details ? Object.values(details) as number[] : [2, 9, 5, 9];

    const barData = {
        labels: activityLabels,
        datasets: [{ data: activityValues }],
    };

    // Line chart — hogs over time (use timeData if available, else placeholder)
    const timeLabels = timeData ? timeData.map((d: any) => String(d.time)) : ['10', '20', '30', '40', '50', '60'];
    const timeValues = timeData ? timeData.map((d: any) => d.count) : [2, 3, 5, 8, 3, 7];

    const lineData = {
        labels: timeLabels,
        datasets: [{ data: timeValues, strokeWidth: 2 }],
    };

    return (
        <View style={styles.container}>
            <AppBar
                title="Bant-AI Baboy"
                leftIcon={<ArrowLeft size={28} color={Colors.light.secondary} weight="bold" />}
                onLeftIconPress={() => router.back()}
            />

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionTitle}>Hogs detected are</Text>

                {/* Bar Chart */}
                <View style={styles.chartContainer}>
                    <BarChart
                        data={barData}
                        width={screenWidth - 32}
                        height={220}
                        chartConfig={chartConfig}
                        yAxisLabel=""
                        yAxisSuffix=""
                        fromZero
                        showValuesOnTopOfBars={false}
                        withInnerLines={true}
                        style={styles.chart}
                    />
                    <Text style={styles.xAxisLabel}>Hog activity</Text>
                </View>

                {/* Line Chart */}
                <View style={styles.chartContainer}>
                    <LineChart
                        data={lineData}
                        width={screenWidth - 32}
                        height={220}
                        chartConfig={{
                            ...chartConfig,
                            color: (opacity = 1) => `rgba(116, 53, 53, ${opacity})`,
                        }}
                        bezier={false}
                        withDots={true}
                        withInnerLines={true}
                        style={styles.chart}
                    />
                    <Text style={styles.xAxisLabel}>Time</Text>
                </View>

                {/* Summary Dropdown */}
                {/* Summary */}
                <View style={styles.summaryContainer}>
                    <Text style={styles.summaryTitle}>Summary of Detection</Text>
                    <Text style={styles.summaryText}>
                        Primary Behavior: <Text style={styles.summaryValue}>{primaryBehavior}</Text>
                    </Text>
                    <Text style={styles.summaryText}>
                        Total Hogs Detected: <Text style={styles.summaryValue}>{detectedCount}</Text>
                    </Text>
                    <Text style={styles.summaryText}>
                        Lethargy Alerts: <Text style={[
                            styles.summaryValue,
                            { color: lethargyFlags > 0 ? '#D32F2F' : '#388E3C' }
                        ]}>
                            {lethargyFlags} {lethargyFlags > 0 ? '⚠️' : '✅'}
                        </Text>
                    </Text>
                    {details && Object.entries(details).map(([behavior, count]) => (
                        <Text key={behavior} style={styles.summaryText}>
                            {behavior}: <Text style={styles.summaryValue}>{String(count)}</Text>
                        </Text>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.light.background,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Nunito-Bold',
        color: Colors.light.secondary,
        paddingHorizontal: 16,
        marginBottom: 12,
        marginTop: 8,
    },
    chartContainer: {
        alignItems: 'center',
        marginBottom: 8,
        paddingHorizontal: 16,
    },
    chart: {
        borderRadius: 8,
    },
    xAxisLabel: {
        color: Colors.light.secondary,
        fontSize: 13,
        fontFamily: 'NunitoSans-SemiBold',
        marginTop: 4,
        alignSelf: 'center',
    },
    summaryContainer: {
        marginHorizontal: 16,
        marginTop: 8,
        padding: 16,
        backgroundColor: Colors.light.white,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.light.white,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    summaryTitle: {
        fontSize: 16,
        fontFamily: 'NunitoSans-Bold',
        color: Colors.light.secondary,
        marginBottom: 12,
    },
    summaryText: {
        fontSize: 14,
        fontFamily: 'NunitoSans-Regular',
        color: Colors.light.subtext,
        marginBottom: 6,
    },
    summaryValue: {
        fontFamily: 'NunitoSans-SemiBold',
        color: Colors.light.text,
    },
});