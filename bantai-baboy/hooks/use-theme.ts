import { useColorScheme } from "react-native";
import { Colors, type ThemeColors} from '@/theme';

export function useTheme() {
    const colorScheme = useColorScheme();
    const theme = (colorScheme && colorScheme in Colors) ? colorScheme : 'light';

    return {
        colors: Colors[theme as keyof typeof Colors],
        colorScheme: theme,
    };
}

export function useThemeColors(
    props: { light?: string },
    colorName: keyof ThemeColors
) {
    const { colorScheme, colors } = useTheme();
    const colorFromProps = props[colorScheme as 'light'];

    if (colorFromProps) {
        return colorFromProps;
    }
    return colors[colorName];
}