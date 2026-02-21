export const Colors = {
    light: {
        background: '#FFF6F6',
        white: '#FBFBFB',
        primary: '#DAABAB',
        secondary: '#743535',
        text: '#271D1D',
        subtext: '#776D6D',
        smallfab: '#BE9999',
        buttonbg: '#F2D9D9',
        results: '#9D6565',
    }
}

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = typeof Colors.light;