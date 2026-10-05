import { YStack as Stack, XStack, YStack, Text } from 'tamagui';
import { useGLTranslation, useLocale } from '@golden-lift/i18n';
import { typography } from '@golden-lift/tokens';
import type { TypographyRole } from '@golden-lift/tokens';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { createElement } from 'react';
export const GLStack = Stack,
  GLXStack = XStack,
  GLYStack = YStack;
export function GLPageContainer({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <Stack asChild>
      <div className={'gl-container ' + className} {...props}>
        {children}
      </div>
    </Stack>
  );
}
export function GLSection({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={'gl-section ' + className} {...props}>
      {children}
    </section>
  );
}
export function GLText({
  children,
  role = 'bodyMD',
  className = '',
  ...props
}: { children?: ReactNode; role?: TypographyRole } & HTMLAttributes<HTMLSpanElement>) {
  const { locale } = useLocale();
  const r = typography[role];
  return (
    <Text
      asChild
      fontFamily={locale === 'en' ? (role.startsWith('technical') ? '$data' : '$body') : '$arabic'}
      fontSize={r.size}
      lineHeight={r.size * r.line}
      fontWeight={String(r.weight) as '400' | '500' | '600'}
    >
      <span className={'gl-text ' + className} {...props}>
        {children}
      </span>
    </Text>
  );
}
export function GLHeading({
  children,
  level = 2,
  role,
  className = '',
  ...props
}: {
  children?: ReactNode;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  role?: TypographyRole;
} & HTMLAttributes<HTMLHeadingElement>) {
  const { locale } = useLocale();
  const r = typography[role ?? (`heading${level}` as TypographyRole)];
  return (
    <Text
      asChild
      fontFamily={locale === 'en' ? '$body' : '$arabic'}
      fontSize={r.size}
      lineHeight={r.size * r.line}
      fontWeight="600"
    >
      {createElement('h' + level, { ...props, className: 'gl-heading ' + className }, children)}
    </Text>
  );
}
export function GLSeparator() {
  return <hr className="gl-separator" />;
}
export type ButtonVariant =
  'primary' | 'secondary' | 'dark' | 'light' | 'ghost' | 'text' | 'destructive';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export function GLButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  const { t } = useGLTranslation();
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={`gl-button gl-button-${variant} gl-button-${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <span className={loading ? 'gl-button-label loading' : ''}>{children}</span>
      {loading && (
        <span className="gl-button-spinner">
          <GLSpinner label={t('loading')} />
        </span>
      )}
    </button>
  );
}
export function GLIconButton({
  label,
  children,
  ...props
}: Omit<Parameters<typeof GLButton>[0], 'children'> & { label: string; children: ReactNode }) {
  return (
    <GLButton {...props} className={'gl-icon-button ' + (props.className ?? '')} aria-label={label}>
      {children}
    </GLButton>
  );
}
export function GLBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gold' | 'success' | 'error';
}) {
  return <span className={'gl-badge gl-tone-' + tone}>{children}</span>;
}
export function GLChip({
  children,
  onRemove,
  label,
}: {
  children: ReactNode;
  onRemove?: () => void;
  label?: string;
}) {
  return (
    <span className="gl-chip">
      {children}
      {onRemove && (
        <GLIconButton label={label ?? ''} variant="ghost" size="xs" onClick={onRemove}>
          ×
        </GLIconButton>
      )}
    </span>
  );
}
export function GLAlert({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'error' | 'success';
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={'gl-alert gl-tone-' + tone}>
      {children}
    </div>
  );
}
export function GLSkeleton({ className = '' }: { className?: string }) {
  const { t } = useGLTranslation();
  return <div className={'gl-skeleton ' + className} role="status" aria-label={t('loading')} />;
}
export function GLSpinner({ label }: { label: string }) {
  return <span className="gl-spinner" role="status" aria-label={label} />;
}
export function GLEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="gl-empty">
      <GLHeading level={3}>{title}</GLHeading>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function GLCard({
  children,
  className = '',
  direction = 'column',
  ...props
}: HTMLAttributes<HTMLDivElement> & { direction?: 'column' | 'row' }) {
  return (
    <Stack asChild flexDirection={direction}>
      <div className={'gl-card ' + className} {...props}>
        {children}
      </div>
    </Stack>
  );
}
export function GLTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="gl-table-scroll">
      <table className="gl-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {v}
                  </th>
                ) : (
                  <td key={j}>{v}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
