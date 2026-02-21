import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image as RNImage, ActivityIndicator, Alert } from 'react-native';
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
    lethargy_flags?: number; // Present in video results
}

// UPDATE THIS to your computer's local IP address (e.g., 'http://192.168.1.5:5000')
const API_BASE_URL = 'http://10.149.185.92:5000'; 

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
                leftIcon={<ArrowLeft size={28} color={Colors.light.secondary} weight="bold" />}
                onLeftIconPress={() => router.back()}
            />

            <ScrollView style={styles.content}>
                <View style={styles.mediaContainer}>
                    {type === 'image' && uri ? (
                        <RNImage 
                            source={{uri: uri}}
                            style={styles.mediaPreview}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={styles.placeholderMedia}>
                            <Text style={styles.placeholderText}>Video Preview</Text>
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
                        <Text style={styles.detectedTitle}>
                            Detected Behavior: {resultData.primary_behavior}
                        </Text>

                        <DropdownItem title='Results' defaultExpanded={true}>
                            <Text style={styles.placeholderContent}>
                                Primary Behavior: {resultData.primary_behavior}
                            </Text>

                            {resultData.lethargy_flags !== undefined && (
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
                    </>
                ) : (
                    <Text style={styles.errorText}>No results available.</Text>
                )}
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
    mediaContainer: {
        padding: 16,
        alignItems: 'center',
    },
    mediaPreview: {
        width: 200,
        height: 200,
        borderRadius: 8, 
        backgroundColor: Colors.light.background,
    }, 
    placeholderMedia: {
        width: 200,
        height: 200,
        borderRadius: 8,
        backgroundColor: '#e0e0e0',
        justifyContent: 'center',
        alignItems: 'center',
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
        fontFamily: 'NunitoSans-Regular',
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
    }
});