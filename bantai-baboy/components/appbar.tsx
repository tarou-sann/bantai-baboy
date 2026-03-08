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
    rightIcon?: React.ReactNode;     
    onRightIconPress?: () => void;
    subtitle?: string;
}

export function AppBar({
    title = 'Bant-AI Baboy',
    backgroundColor,
    titleColor,
    style,
    titleStyle,
    leftIcon,
    onLeftIconPress,
    rightIcon,                         
    onRightIconPress,
    subtitle,
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
                <View style={styles.titleBlock}>                         
                    <Text style={[styles.title, { color: textColor }, titleStyle]}>
                        {title}
                    </Text>
                    {subtitle && (                                       
                        <Text style={[styles.subtitle, { color: textColor }]}>
                            {subtitle}
                        </Text>
                    )}
                </View>
                {rightIcon && (               
                    <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon}>
                        {rightIcon}
                    </TouchableOpacity>
                )}
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

    titleBlock: {
    flex: 1,
    },
    
    subtitle: {
        fontSize: 12,
        fontFamily: 'NunitoSans-Regular',
        opacity: 0.6,
        marginTop: -4,
    },

    rightIcon: {
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 'auto',  
    },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    }
});