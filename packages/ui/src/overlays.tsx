import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBPTranslation } from '@business-platform/i18n';
import { BPHeading, BPCloseButton } from './primitives';
interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  keepMounted?: boolean;
}
function Overlay({
  open,
  onClose,
  title,
  children,
  className = '',
  keepMounted = false,
  drawer = false,
}: OverlayProps & { drawer?: boolean }) {
  const { t } = useBPTranslation();
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      prior?.focus();
    };
  }, [open]);
  if ((!open && !keepMounted) || typeof document === 'undefined') return null;
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={'bp-dialog ' + (drawer ? 'bp-drawer' : 'bp-modal') + ' ' + className}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="bp-dialog-heading">
        <BPHeading level={2} role="heading4" id={id}>
          {title}
        </BPHeading>
        <BPCloseButton label={t('close')} onClick={onClose} />
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
export function BPModal(props: OverlayProps) {
  return <Overlay {...props} />;
}
export function BPDrawer(props: OverlayProps) {
  return <Overlay {...props} drawer />;
}
export function BPTooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="bp-tooltip" tabIndex={0} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id}>
        {label}
      </span>
    </span>
  );
}
export function BPToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);
  const { t } = useBPTranslation();
  return message ? (
    <div role="status" className="bp-toast">
      {message}
      <BPCloseButton label={t('close')} onClick={onClose} />
    </div>
  ) : null;
}
