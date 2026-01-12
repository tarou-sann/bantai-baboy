export const Colors = {
    light: {
        background: '#FFFFFF',
        primary: '#DAABAB',
        secondary: '#743535',
    }
}

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = typeof Colors.light;