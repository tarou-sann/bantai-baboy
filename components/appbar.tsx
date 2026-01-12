import React from 'react';
import { 
    View, 
    Text,
    StyleSheet,
    StatusBar,
    Platform, 
    ViewStyle,
    TextStyle,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface AppBarProps {
    title?: string;
    backgroundColor?: string;
    titleColor?: string;
    style?: ViewStyle;
    titleStyle?: TextStyle;
}

export function AppBar({
    title = 'Bant-AI Baboy',
    backgroundColor,
    titleColor,
    style,
    titleStyle,
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
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 20,
        // fontWeight: '700',
        fontFamily: 'Nunito-Black',
    },
});