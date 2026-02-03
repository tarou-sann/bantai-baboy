import React from 'react';
import { 
    View, 
    Text,
    StyleSheet,
    StatusBar,
    Platform, 
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

    const bgColor = backgroundColor || colors.primary;
    const textColor = titleColor || colors.secondary;

    return (
        <>
        <StatusBar
            barStyle="dark-content"
            backgroundColor={bgColor}
            translucent={false}
        />
        <View
            style={[
            styles.container,
            {
                backgroundColor: bgColor,
                paddingTop: insets.top,
            },
            style,
            ]}
        >
            {leftIcon && (
                <TouchableOpacity 
                    onPress={onLeftIconPress}
                    style={styles.leftIcon}
                >
                {leftIcon}
                </TouchableOpacity>
            )}
            <Text
            style={[
                styles.title,
                { color: textColor },
                titleStyle,
            ]}
            >
            {title}
            </Text>
            
        </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    title: {
        fontSize: 20,
        // fontWeight: '700',
        fontFamily: 'Nunito-Black',
        textAlign: 'center',
    },
    leftIcon: {
        position: 'absolute',
        left: 16,
        bottom: 20,
        zIndex: 1,
    },
});