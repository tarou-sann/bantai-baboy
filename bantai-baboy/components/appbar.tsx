import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    ViewStyle,
    TextStyle,
    TouchableOpacity,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface AppBarProps {
    title?: string;
    backgroundColor?: string;
    titleColor?: string;
    style?: ViewStyle;
    titleStyle?: TextStyle;
    leftIcon?: React.ReactNode;
    onLeftIconPress?: () => void;
}

export function AppBar({
    title = 'Bant-AI Baboy',
    backgroundColor,
    titleColor,
    style,
    titleStyle,
    leftIcon,
    onLeftIconPress
}: AppBarProps) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();

    const bgColor = backgroundColor || colors.background;
    const textColor = titleColor || colors.secondary;

    return (
        <>
        <StatusBar
            barStyle="dark-content"
            backgroundColor={bgColor}
            translucent={false}
        />
        <View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top + 16 }, style]}>
            <View style={styles.row}>
                {leftIcon && (
                    <TouchableOpacity
                        onPress={onLeftIconPress}
                        style={styles.leftIcon}
                    >
                        {leftIcon}
                    </TouchableOpacity>
                )}
                <Text style={[styles.title, { color: textColor }, titleStyle]}>
                    {title}
                </Text>
            </View>
        </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        // flexDirection: 'row',
        // alignItems: 'center',
        // justifyContent: 'flex-start',
        // gap: 8,
    },
    title: {
        fontSize: 28,
        fontFamily: 'Nunito-Black',
        textAlign: 'left',
        flexShrink: 1,
    },
    leftIcon: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    }
});