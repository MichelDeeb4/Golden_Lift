import type { ErrorBoundaryProps } from 'expo-router';
import { BPAlert, BPButton, BPHeading, BPPageContainer, BPSection } from '@business-platform/ui';
import { useBPTranslation } from '@business-platform/i18n';
export function StorefrontErrorBoundary({ retry }: ErrorBoundaryProps) {
  const { t } = useBPTranslation();
  return (
    <BPPageContainer>
      <BPSection>
        <BPHeading level={1}>{t('errorTitle')}</BPHeading>
        <BPAlert tone="error">{t('errorBody')}</BPAlert>
        <BPButton onClick={() => void retry()}>{t('retry')}</BPButton>
      </BPSection>
    </BPPageContainer>
  );
}
