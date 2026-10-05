import type { ErrorBoundaryProps } from 'expo-router';
import { GLAlert, GLButton, GLHeading, GLPageContainer, GLSection } from '@golden-lift/ui';
import { useGLTranslation } from '@golden-lift/i18n';
export function StorefrontErrorBoundary({ retry }: ErrorBoundaryProps) {
  const { t } = useGLTranslation();
  return (
    <GLPageContainer>
      <GLSection>
        <GLHeading level={1}>{t('errorTitle')}</GLHeading>
        <GLAlert tone="error">{t('errorBody')}</GLAlert>
        <GLButton onClick={() => void retry()}>{t('retry')}</GLButton>
      </GLSection>
    </GLPageContainer>
  );
}
