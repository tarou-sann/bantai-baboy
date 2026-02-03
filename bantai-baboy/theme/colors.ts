export const Colors = {
    light: {
        background: '#F5F5F5',
        primary: '#DAABAB',
        secondary: '#743535',
        text: '#271D1D',
        subtext: '#776D6D'
    }
}

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = typeof Colors.light;