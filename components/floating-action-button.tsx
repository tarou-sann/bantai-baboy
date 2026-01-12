import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { UploadSimple, VideoCamera, Image } from 'phosphor-react-native';
import { Colors } from '@/theme/colors';

export interface FABAction {
    icon: React.ReactNode;
    onpress: () => void;
}

export interface FloatingActionButtonProps {
    onVideoPress?: () => void;
    onImagePress?: () => void;
    mainColor?: string;
    smallButtonColor?: string;
    iconColor?: string;
    style?: ViewStyle;
}

export function FloatingActionButton({
    onVideoPress,
    onImagePress,
    mainColor = '#743535',
    smallButtonColor = Colors.light.primary,
    iconColor = Colors.light.secondary,
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

    return (
        <>
        {/* Dimmed Background Overlay*/}
        {expanded && (
            <TouchableOpacity 
                style={styles.overlay}
                activeOpacity={1}
                onPress={() => setExpanded(false)}
            />
        )}

        {/* Expanded Action Buttons */}
        {expanded && (
            <View style={styles.expandedButtons}>
                {/* Video Button - Left */}
                <TouchableOpacity 
                    style={[styles.smallFab, { backgroundColor: '#E3CECE'}]}
                    onPress={handleVideoPress}
                    activeOpacity={0.8}>
                    <VideoCamera size={30} color='#9D6565' weight="bold" />
                </TouchableOpacity>
                {/* Image Button - Right */}
                <TouchableOpacity 
                    style={[styles.smallFab, { backgroundColor: '#E3CECE'}]}
                    onPress={handleImagePress}
                    activeOpacity={0.8}>
                    <Image size={30} color='#9D6565' weight="bold" />
                </TouchableOpacity>
            </View>
        )}

        {/* Main FAB */}
        <TouchableOpacity
            style={[
                styles.fab,
                { backgroundColor: Colors.light.primary },
                expanded && styles.fabExpanded,
                style,
            ]}
            onPress={() => setExpanded(!expanded)}
            activeOpacity={0.8}
            >
                <UploadSimple 
                    size={50} 
                    color={Colors.light.secondary} 
                    weight="bold"
                    />
        </TouchableOpacity>
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
    fab: {
        position: 'absolute',
        bottom: 30,
        alignSelf: 'center',
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        // shadowColor: '#000',
        // shadowOffset: { width: 0, height: 4 },
        // shadowOpacity: 0.3,
        // shadowRadius: 4,
        zIndex: 3,
    },
    fabExpanded: {
        opacity: 0.9,
    },
    expandedButtons: {
        position: 'absolute',
        bottom: 140, 
        alignSelf: 'center',
        flexDirection: 'row',
        gap: 20,
        zIndex: 2,
    },
    smallFab: {
        width: 75,
        height: 75,
        borderRadius: 40,
        justifyContent: 'center', 
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 3,
    },
});