import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image as RNImage, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { AppBar } from '@/components/appbar';
import { DropdownItem } from '@/components/dropdown-item';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';

// --- TYPES ---
interface AnalysisResult {
    status: string;
    media_type: 'image' | 'video';
    primary_behavior: string;
    detected_pigs_count?: number; // Present in image results
    details: Record<string, number>;
    lethargy_flags?: number;
    limping_flags?: number;
    time_series?: any[]; // Present in video results
}

// UPDATE THIS to your computer's local IP address (e.g., 'http://192.168.1.5:5000')
const API_BASE_URL = 'http://192.168.0.102:5000'; 

export default function Results() {
    // Strictly type the expected params from the previous screen
    const params = useLocalSearchParams<{ filename?: string; uri?: string; type?: 'image' | 'video' }>();
    const router = useRouter();
    const { filename, uri, type } = params;

    // Type the state hooks
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [resultData, setResultData] = useState<AnalysisResult | null>(null);

    useEffect(() => {
        if (uri && type) {
            analyzeMedia();
        } else {
            setIsLoading(false);
            Alert.alert("Error", "Missing media file.");
        }
    }, [uri, type]);

    const analyzeMedia = async () => {
        try {
            setIsLoading(true);

            const formData = new FormData();
            
            formData.append('file', {
                uri: uri as string,
                name: filename || (type === 'image' ? 'photo.jpg' : 'video.mp4'),
                type: type === 'image' ? 'image/jpeg' : 'video/mp4',
            } as any); 

            const endpoint = type === 'image' ? '/analyze-image' : '/analyze-video';

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            clearTimeout(timeoutId)

            const data = await response.json();

            if (response.ok) {
                setResultData(data as AnalysisResult);
            } else {
                Alert.alert("Analysis Error", data.error || "Something went wrong");
            }
        } catch (error) {
            console.error("Upload error:", error);
            Alert.alert("Network Error", "Could not connect to the server. Check your IP and ensure the Flask app is running.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <AppBar 
                title="Bant-AI Baboy"
                leftIcon={<ArrowLeft size={28} color={Colors.light.secondary} weight="bold" />}
                onLeftIconPress={() => router.back()}
            />

            <ScrollView style={styles.content}>
                {/* Media Preview */}
                <View style={styles.previewWrapper}>
                    {type === 'image' && uri ? (
                        <View style={styles.previewWrapper}>
                            <RNImage 
                                source={{ uri: uri }}
                                style={styles.mediaPreview}
                                resizeMode="cover"
                            />
                            {resultData?.detected_pigs_count !== undefined && (
                                <View style={styles.hogsBadge}>
                                    <Text style={styles.hogsBadgeText}>
                                        Detected Hogs: {resultData.detected_pigs_count}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={styles.previewWrapper}>
                            <View style={styles.placeholderMedia}>
                                <Text style={styles.placeholderText}>Video Preview</Text>
                            </View>
                            {resultData?.detected_pigs_count !== undefined && (
                                <View style={styles.hogsBadge}>
                                    <Text style={styles.hogsBadgeText}>
                                        Detected Hogs: {resultData.detected_pigs_count}
                                    </Text>
                                </View>
                            )}
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
                        {/* <Text style={styles.detectedTitle}> 
                            Detected Behavior: {resultData.primary_behavior}
                        </Text> */}

                        <DropdownItem title='Results' defaultExpanded={true}>
                            <Text style={styles.placeholderContent}>
                                Primary Behavior: {resultData.primary_behavior}
                            </Text>

                            {resultData.lethargy_flags !== undefined && (
                                <>
                                    <Text style={[
                                        styles.placeholderContent, 
                                        { 
                                            color: resultData.lethargy_flags > 0 ? '#D32F2F' : '#388E3C', 
                                            fontWeight: 'bold',
                                            marginTop: 8
                                        }
                                    ]}>
                                        Lethargy Alerts: {resultData.lethargy_flags} {resultData.lethargy_flags > 0 ? '⚠️' : '✅'}
                                    </Text>

                                    {/* Show exactly when lethargy was triggered */}
                                    {resultData.time_series && resultData.time_series.filter(d => d.lethargy).length > 0 && (
                                        <View style={{ marginTop: 6 }}>
                                            <Text style={[styles.placeholderContent, { color: '#D32F2F' }]}>
                                                Flagged at:
                                            </Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                                {resultData.time_series
                                                    .filter(d => d.lethargy)
                                                    .map((d, i) => (
                                                        <View key={i} style={{
                                                            backgroundColor: '#FFEBEE',
                                                            borderRadius: 12,
                                                            paddingHorizontal: 10,
                                                            paddingVertical: 4,
                                                            borderWidth: 1,
                                                            borderColor: '#D32F2F',
                                                        }}>
                                                            <Text style={{
                                                                color: '#D32F2F',
                                                                fontSize: 12,
                                                                fontFamily: 'NunitoSans-SemiBold',
                                                            }}>
                                                                {d.time} — {d.lethargic_ids.length} hog{d.lethargic_ids.length > 1 ? 's' : ''}
                                                            </Text>
                                                        </View>
                                                    ))
                                                }
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
                                {"\n"}Detailed Breakdown:
                                {Object.entries(resultData.details || {}).map(([behavior, count]) => (
                                    `\n- ${behavior}: ${count}`
                                ))}
                            </Text>
                            
                        </DropdownItem>

                        <DropdownItem title='Causes'>
                            <Text style={styles.placeholderContent}>
                                Based on the behavior ({resultData.primary_behavior}), possible context:
                                {"\n"}- Observe if this matches their normal feeding/resting schedule.
                                {"\n"}- Environmental factors may influence this behavior.
                            </Text>
                        </DropdownItem>

                        <DropdownItem title='Suggestions' defaultExpanded={false}>
                            <Text style={styles.placeholderContent}>
                                Suggested Actions:
                                {"\n"}- Continue monitoring via Bantai Baboy.
                                {"\n"}- Ensure water and feed stations are accessible.
                            </Text>
                        </DropdownItem>

                        <TouchableOpacity
                            onPress={() => router.push({
                                pathname: '/analytics',
                                params: {
                                    details: JSON.stringify(resultData.details),
                                    primary_behavior: resultData.primary_behavior,
                                    lethargy_flags: resultData.lethargy_flags,
                                    detected_pigs_count: resultData.detected_pigs_count,
                                    time_series: JSON.stringify(resultData.time_series ?? []),
                                    limping_flags: resultData.limping_flags,
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
                        style={styles.saveButton}
                        activeOpacity={0.8}
                        onPress={() => {
                            // TODO: add save functionality
                        }}
                    >
                        <Text style={styles.saveButtonText}>Save Results</Text>
                    </TouchableOpacity>
                </View>
            )}
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
    mediaContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    previewWrapper: {
        width: '100%',
        // borderRadius: 16,
        overflow: 'hidden',
    },
    mediaPreview: {
        width: '100%',
        height: 280,
    },
    placeholderMedia: {
        width: '100%',
        height: 280,
        backgroundColor: Colors.light.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    hogsBadge: {
        position: 'absolute',
        bottom: 16,
        alignSelf: 'center',
        backgroundColor: Colors.light.white,
        paddingVertical: 6,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    hogsBadgeText: {
        color: Colors.light.secondary,
        fontSize: 14,
        fontFamily: 'NunitoSans-SemiBold',
    },
    placeholderText: {
        color: Colors.light.subtext,
        fontSize: 16,
        fontFamily: 'NunitoSans-Regular',
    },
    detectedTitle: {
        fontSize: 18,
        fontFamily: 'NunitoSans-SemiBold',
        textAlign: 'center',
        marginBottom: 16,
        color: Colors.light.text,
    },
    placeholderContent: {
        fontSize: 14,
        color: Colors.light.subtext,
        fontFamily: 'NunitoSans-SemiBold',
        lineHeight: 20,
    },
    loadingContainer: {
        alignItems: 'center',
        marginTop: 30,
    },
    loadingText: {
        marginTop: 10,
        color: Colors.light.subtext,
        fontFamily: 'NunitoSans-Regular',
    },
    errorText: {
        textAlign: 'center',
        color: 'red',
        marginTop: 20,
        fontFamily: 'NunitoSans-Regular',
    },
    scrollContent: {
        paddingBottom: 24,
    },
    analyticsTextButton: {
        marginTop: 8,
        marginLeft: 16,
        alignSelf: 'flex-start',
    },
    analyticsTextButtonLabel: {
        color: Colors.light.secondary,
        fontSize: 16,
        fontFamily: 'NunitoSans-Bold',
    },
    bottomContainer: {
        paddingHorizontal: 100,
        paddingVertical: 16,
        backgroundColor: Colors.light.background,
    },
    saveButton: {
        backgroundColor: Colors.light.results,
        paddingVertical: 16,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButtonText: {
        color: Colors.light.white,
        fontSize: 15,
        fontFamily: 'NunitoSans-SemiBold',
    },
});