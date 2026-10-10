import { X } from '@business-platform/icons';
import { YStack as Stack, XStack, YStack, Text } from 'tamagui';
import { useBPTranslation, useLocale } from '@business-platform/i18n';
import { typography } from '@business-platform/tokens';
import type { TypographyRole } from '@business-platform/tokens';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { createElement } from 'react';
export const BPStack = Stack,
  BPXStack = XStack,
  BPYStack = YStack;
export function BPPageContainer({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <Stack asChild>
      <div className={'bp-container ' + className} {...props}>
        {children}
      </div>
    </Stack>
  );
}
export function BPSection({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={'bp-section ' + className} {...props}>
      {children}
    </section>
  );
}
export function BPText({
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
      <span className={'bp-text ' + className} {...props}>
        {children}
      </span>
    </Text>
  );
}
export function BPHeading({
  children,
  level = 2,
  role,
  className = '',
  fluid = false,
  ...props
}: {
  children?: ReactNode;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  role?: TypographyRole;
  fluid?: boolean;
} & HTMLAttributes<HTMLHeadingElement>) {
  const { locale } = useLocale();
  const r = typography[role ?? (`heading${level}` as TypographyRole)];
  if (fluid)
    return createElement(
      'h' + level,
      { ...props, className: 'bp-heading bp-heading-fluid ' + className },
      children,
    );
  return (
    <Text
      asChild
      fontFamily={locale === 'en' ? '$body' : '$arabic'}
      fontSize={r.size}
      lineHeight={r.size * r.line}
      fontWeight="600"
    >
      {createElement('h' + level, { ...props, className: 'bp-heading ' + className }, children)}
    </Text>
  );
}
export function BPSeparator() {
  return <hr className="bp-separator" />;
}
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'neutral'
  | 'dark'
  | 'light'
  | 'ghost'
  | 'text'
  | 'destructive'
  | 'success'
  | 'warning';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export function BPButton({
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
  const { t } = useBPTranslation();
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={`bp-button bp-button-${variant} bp-button-${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <span className={loading ? 'bp-button-label loading' : 'bp-button-label'}>{children}</span>
      {loading && (
        <span className="bp-button-spinner">
          <BPSpinner label={t('loading')} />
        </span>
      )}
    </button>
  );
}
export function BPIconButton({
  label,
  children,
  ...props
}: Omit<Parameters<typeof BPButton>[0], 'children'> & { label: string; children: ReactNode }) {
  return (
    <BPButton
      {...props}
      title={props.title ?? label}
      className={'bp-icon-button ' + (props.className ?? '')}
      aria-label={label}
    >
      {children}
    </BPButton>
  );
}
export function BPBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gold' | 'success' | 'error' | 'warning' | 'info';
}) {
  return <span className={'bp-badge bp-tone-' + tone}>{children}</span>;
}
export function BPStatusBadge({ state, children }: { state: string; children?: ReactNode }) {
  const status = state.toUpperCase();
  const tone = ['ACTIVE', 'PUBLISHED', 'READY'].includes(status)
    ? 'success'
    : ['FAILED', 'BLOCKED'].includes(status)
      ? 'error'
      : ['PROCESSING', 'PENDING', 'INVITED'].includes(status)
        ? 'warning'
        : 'neutral';
  return <BPBadge tone={tone}>{children ?? state}</BPBadge>;
}
export function BPChip({
  children,
  onRemove,
  label,
}: {
  children: ReactNode;
  onRemove?: () => void;
  label?: string;
}) {
  return (
    <span className="bp-chip">
      {children}
      {onRemove && (
        <BPIconButton label={label ?? ''} variant="ghost" size="xs" onClick={onRemove}>
          ×
        </BPIconButton>
      )}
    </span>
  );
}
export function BPAlert({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'error' | 'success';
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={'bp-alert bp-tone-' + tone}>
      {children}
    </div>
  );
}
export function BPSkeleton({ className = '' }: { className?: string }) {
  const { t } = useBPTranslation();
  return <div className={'bp-skeleton ' + className} role="status" aria-label={t('loading')} />;
}
export function BPSpinner({ label }: { label: string }) {
  return <span className="bp-spinner" role="status" aria-label={label} />;
}
export function BPEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="bp-empty">
      <BPHeading level={3}>{title}</BPHeading>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function BPCard({
  children,
  className = '',
  direction = 'column',
  ...props
}: HTMLAttributes<HTMLDivElement> & { direction?: 'column' | 'row' }) {
  return (
    <Stack asChild flexDirection={direction}>
      <div className={'bp-card ' + className} {...props}>
        {children}
      </div>
    </Stack>
  );
}
export function BPTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="bp-table-scroll">
      <table className="bp-table">
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

export function BPCloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <BPIconButton label={label} variant="ghost" className="bp-close-button" onClick={onClick}>
      <X size={20} aria-hidden="true" />
    </BPIconButton>
  );
}
