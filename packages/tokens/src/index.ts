export const palette = {
  gold50: '#FBF6EA',
  gold100: '#F4E6C5',
  gold200: '#EBD39C',
  gold300: '#DEBD77',
  gold400: '#D3AD65',
  gold500: '#C9A15B',
  gold600: '#B38B47',
  gold700: '#967238',
  gold800: '#75582E',
  gold900: '#564124',
  champagne100: '#F1E6CC',
  champagne300: '#E4CEA0',
  champagne500: '#D8BD83',
  champagne700: '#B49358',
  bronze100: '#E6D6C4',
  bronze300: '#B99169',
  bronze500: '#8A6742',
  bronze700: '#65472E',
  bronze900: '#432F20',
  silver50: '#F7F8F8',
  silver100: '#ECEEEF',
  silver200: '#E1E3E4',
  silver300: '#D1D4D6',
  silver400: '#B8BDC1',
  silver500: '#9EA4A9',
  silver600: '#7D858B',
  silver700: '#60676C',
  silver800: '#454A4E',
  silver900: '#303437',
  charcoal950: '#0D0F10',
  charcoal900: '#121516',
  charcoal850: '#171A1C',
  charcoal800: '#1D2022',
  charcoal700: '#292D30',
  charcoal600: '#3B4044',
  charcoal500: '#4C5256',
  warmWhite: '#F7F4ED',
  softWhite: '#FBFAF7',
  white: '#FFFFFF',
  lightMetal: '#ECEEEF',
  pageBackground: '#F8F8F6',
} as const;
export const colors = {
  background: {
    page: palette.pageBackground,
    surface: palette.white,
    subtle: palette.warmWhite,
    metal: palette.lightMetal,
    dark: palette.charcoal900,
    deepDark: palette.charcoal950,
    overlay: 'rgba(13,15,16,.72)',
  },
  text: {
    primary: palette.charcoal900,
    secondary: palette.charcoal500,
    muted: palette.silver700,
    inverse: palette.softWhite,
    gold: palette.gold800,
    disabled: palette.silver700,
  },
  action: {
    primary: palette.gold500,
    primaryHover: palette.gold400,
    primaryPressed: palette.gold600,
    secondary: palette.silver100,
    destructive: '#A32626',
  },
  border: {
    default: palette.silver300,
    strong: palette.silver600,
    subtle: palette.silver200,
    gold: palette.gold500,
    focus: palette.gold700,
  },
  state: { success: '#246A47', warning: '#805409', error: '#A32626', info: '#245B7E' },
} as const;
export const space = {
  space0: 0,
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  space10: 40,
  space12: 48,
  space14: 56,
  space16: 64,
  space20: 80,
  space24: 96,
  space30: 120,
  space40: 160,
} as const;
export const radius = {
  radiusXS: 4,
  radiusSM: 6,
  radiusMD: 8,
  radiusLG: 12,
  radiusXL: 16,
  radius2XL: 24,
  radiusPill: 999,
} as const;
export const shadows = {
  shadowXS: '0 1px 2px rgba(0,0,0,.05)',
  shadowSM: '0 4px 12px rgba(0,0,0,.07)',
  shadowMD: '0 10px 30px rgba(0,0,0,.10)',
  shadowLG: '0 20px 50px rgba(0,0,0,.14)',
  shadowOverlay: '0 24px 64px rgba(0,0,0,.22)',
} as const;
export const motion = {
  fast: 120,
  normal: 180,
  medium: 240,
  slow: 320,
  reveal: 450,
  easing: 'cubic-bezier(.2,.8,.2,1)',
} as const;
export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 100,
  dropdown: 200,
  popover: 300,
  drawer: 400,
  overlay: 500,
  modal: 600,
  toast: 700,
  tooltip: 800,
} as const;
export const layout = {
  maxWidth: 1400,
  desktop: { columns: 12, gutter: 24, padding: 40 },
  tablet: { columns: 8, gutter: 20, padding: 24 },
  mobile: { columns: 4, gutter: 16, padding: 16 },
  breakpoints: { tablet: 768, desktop: 1100 },
} as const;
export const typography = {
  displayXL: { size: 72, line: 1.08, weight: 600 },
  displayLG: { size: 56, line: 1.12, weight: 600 },
  heading1: { size: 48, line: 1.2, weight: 600 },
  heading2: { size: 36, line: 1.25, weight: 600 },
  heading3: { size: 28, line: 1.3, weight: 600 },
  heading4: { size: 24, line: 1.35, weight: 600 },
  heading5: { size: 20, line: 1.4, weight: 600 },
  heading6: { size: 18, line: 1.45, weight: 600 },
  bodyLG: { size: 18, line: 1.7, weight: 400 },
  bodyMD: { size: 16, line: 1.7, weight: 400 },
  bodySM: { size: 14, line: 1.65, weight: 400 },
  labelLG: { size: 16, line: 1.5, weight: 600 },
  labelMD: { size: 14, line: 1.5, weight: 600 },
  labelSM: { size: 12, line: 1.5, weight: 600 },
  caption: { size: 12, line: 1.6, weight: 400 },
  buttonLG: { size: 16, line: 1.4, weight: 600 },
  buttonMD: { size: 14, line: 1.4, weight: 600 },
  buttonSM: { size: 12, line: 1.4, weight: 600 },
  technicalValue: { size: 16, line: 1.6, weight: 500 },
  technicalLabel: { size: 14, line: 1.6, weight: 400 },
  navigation: { size: 14, line: 1.5, weight: 500 },
  overline: { size: 12, line: 1.5, weight: 600 },
} as const;
export type TypographyRole = keyof typeof typography;
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = hex.replace('#', '').match(/.{2}/g);
    if (!c || c.length !== 3) throw new Error('Expected opaque hex colors');
    const [r = 0, g = 0, bl = 0] = c.map((x) => {
      const s = parseInt(x, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
