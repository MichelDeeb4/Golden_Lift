import { Slot } from 'expo-router';
import { useFonts } from 'expo-font';
import Manrope_400Regular from '@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf';
import Manrope_600SemiBold from '@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf';
import Inter_400Regular from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
import Inter_500Medium from '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf';
import IBMPlexSansArabic_400Regular from '@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf';
import IBMPlexSansArabic_600SemiBold from '@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold/IBMPlexSansArabic_600SemiBold.ttf';
import NotoSansArabic_400Regular from '@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf';
import { StorefrontProvider } from '../providers/storefront';
import { Shell } from '../features/layout/shell';
import { usePathname } from 'expo-router';
import { StaffActionTokenProvider } from '../features/admin/action-token';
import '@golden-lift/ui/styles.css';
import '../features/layout/storefront.css';
export { StorefrontErrorBoundary as ErrorBoundary } from '../features/layout/error-boundary';
export default function Layout() {
  const pathname = usePathname();
  const [loaded, error] = useFonts({
    Manrope: Manrope_400Regular,
    ManropeSemiBold: Manrope_600SemiBold,
    Inter: Inter_400Regular,
    InterMedium: Inter_500Medium,
    IBMPlexSansArabic: IBMPlexSansArabic_400Regular,
    IBMPlexSansArabicSemiBold: IBMPlexSansArabic_600SemiBold,
    NotoSansArabic: NotoSansArabic_400Regular,
  });
  if (!loaded && !error)
    return (
      <div className="gl-bootstrap" role="status" aria-label="جارٍ التحميل">
        GOLDEN LIFT
      </div>
    );
  return (
    <StorefrontProvider>
      {pathname.startsWith('/admin') || pathname.startsWith('/super-admin') ? (
        <StaffActionTokenProvider>
          <Slot />
        </StaffActionTokenProvider>
      ) : (
        <Shell>
          <Slot />
        </Shell>
      )}
    </StorefrontProvider>
  );
}
