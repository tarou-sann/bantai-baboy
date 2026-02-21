import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle, Text } from 'react-native';
import { UploadSimple, Video, Image, Camera} from 'phosphor-react-native';
import { Colors } from '@/theme/colors';

export interface FloatingActionButtonProps {
    onVideoPress?: () => void;
    onImagePress?: () => void;
    onCameraPress?: () => void;
    style?: ViewStyle;
}

export function FloatingActionButton({
    onVideoPress,
    onImagePress,
    onCameraPress,
    style
}: FloatingActionButtonProps) {
    const [expanded, setExpanded] = useState(false);

    const handleVideoPress = () => {
        onVideoPress?.();
        setExpanded(false);
    };

    const handleImagePress = () => {
        onImagePress?.();
        setExpanded(false);
    };

    const handleCameraPress = () => {
        onCameraPress?.();
        setExpanded(false);
    };

    return (
        <>
        {/* {expanded && (
            <TouchableOpacity 
                style={styles.overlay}
                activeOpacity={1}
                onPress={() => setExpanded(false)}
            />
        )} */}

        <View style={[styles.fabContainer, style]}>
            <View style={styles.pillContainer}>
                {/* Camera — left, no expanded content above */}
                <TouchableOpacity
                    onPress={handleCameraPress}
                    activeOpacity={0.8}
                    style={styles.pillButton}>
                    <Camera size={24} color={Colors.light.secondary} weight="regular" />
                    <Text style={styles.pillLabel}>Camera</Text>
                </TouchableOpacity>

                {/* Upload — right, expanded content floats above it */}
                <View style={styles.uploadWrapper}>
                    {expanded && (
                        <View style={styles.topRow}>
                            <TouchableOpacity 
                                style={styles.smallFab}
                                onPress={handleVideoPress}
                                activeOpacity={0.8}>
                                <Video size={24} color={Colors.light.white} weight="fill" />
                                <Text style={styles.fabLabel}>Video</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={styles.smallFab}
                                onPress={handleImagePress}
                                activeOpacity={0.8}>
                                <Image size={24} color={Colors.light.white} weight="fill" />
                                <Text style={styles.fabLabel}>Image</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <TouchableOpacity
                        onPress={() => setExpanded(!expanded)}
                        activeOpacity={0.8}
                        style={[styles.uploadIconWrapper, expanded && styles.uploadIconWrapperActive]}>
                        <UploadSimple size={24} color={expanded ? Colors.light.white : Colors.light.secondary} />
                        <Text style={[styles.pillLabel, expanded && styles.pillLabelActive]}>Upload</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
        </>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        zIndex: 1,
    },
    fabContainer: {
        position: 'absolute',
        bottom: 30,
        alignSelf: 'center',
        zIndex: 2,
    },
    pillContainer: {
        flexDirection: 'row',
        backgroundColor: Colors.light.buttonbg,
        borderRadius: 50,
        paddingVertical: 1,
        paddingHorizontal: 8,
        alignItems: 'center',
        // elevation: 6,
        // shadowColor: '#000',
        // shadowOffset: { width: 0, height: 3 },
        // shadowOpacity: 0.25,
        // shadowRadius: 3,
    },
    pillButton: {
        alignItems: 'center',
        gap: 0,
        paddingHorizontal: 20,
    },
    pillLabel: {
        color: Colors.light.secondary,
        fontSize: 12,
        fontFamily: 'NunitoSans-SemiBold',
    },
    pillLabelActive: {
        color: Colors.light.white,
    },
    uploadWrapper: {
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    topRow: {
        position: 'absolute',
        bottom: '100%',
        flexDirection: 'row',
        gap: 16,
        paddingBottom: 12,
        alignSelf: 'center',
    },
    smallFabWrapper: {
        alignItems: 'center',
        gap: 4,
    },
    smallFab: {
        width: 60,
        height: 58,
        borderRadius: 40,
        backgroundColor: Colors.light.smallfab,
        justifyContent: 'center',
        alignItems: 'center',
        // elevation: 6,
        // shadowColor: '#000',
        // shadowOffset: { width: 0, height: 3 },
        // shadowOpacity: 0.25,
        shadowRadius: 3,
    },
    fabLabel: {
        color: Colors.light.white,
        fontSize: 12,
        fontFamily: 'NunitoSans-SemiBold',
    },
    uploadIconWrapper: {
        width: 60,
        height: 58,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 0,
    },
    uploadIconWrapperActive: {
        backgroundColor: Colors.light.smallfab,
    },
});