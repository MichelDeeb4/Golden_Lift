import { createFont, createTamagui, createTokens } from 'tamagui';
import { colors, palette, radius, space, typography, zIndex } from '@golden-lift/tokens';
const font = (family: string, bold: string) =>
  createFont({
    family,
    size: Object.fromEntries(Object.entries(typography).map(([k, v]) => [k, v.size])),
    lineHeight: Object.fromEntries(
      Object.entries(typography).map(([k, v]) => [k, v.size * v.line]),
    ),
    weight: { 4: '400', 5: '500', 6: '600', 7: '700' },
    face: {
      400: { normal: family },
      500: { normal: family },
      600: { normal: bold },
      700: { normal: bold },
    },
  });
export const config = createTamagui({
  tokens: createTokens({
    color: palette,
    space: { ...space, true: 16 },
    size: { small: 36, true: 44, large: 52 },
    radius: { ...radius, true: 8 },
    zIndex: { ...zIndex, true: zIndex.base },
  }),
  themes: {
    light: {
      background: colors.background.page,
      backgroundHover: colors.background.subtle,
      backgroundPress: colors.background.metal,
      color: colors.text.primary,
      colorHover: colors.text.primary,
      colorPress: colors.text.primary,
      borderColor: colors.border.default,
      borderColorHover: colors.border.gold,
      borderColorFocus: colors.border.focus,
      shadowColor: 'rgba(0,0,0,.1)',
    },
    dark: {
      background: colors.background.dark,
      color: colors.text.inverse,
      borderColor: palette.charcoal600,
    },
  },
  fonts: {
    body: font('Manrope', 'ManropeSemiBold'),
    data: font('Inter', 'InterMedium'),
    arabic: font('IBMPlexSansArabic', 'IBMPlexSansArabicSemiBold'),
  },
  media: {
    mobile: { maxWidth: 767 },
    tablet: { minWidth: 768, maxWidth: 1099 },
    desktop: { minWidth: 1100 },
  },
  settings: { defaultFont: 'body', allowedStyleValues: 'somewhat-strict' },
});
type GLConfig = typeof config;
declare module 'tamagui' {
  interface TamaguiCustomConfig extends GLConfig {}
}
