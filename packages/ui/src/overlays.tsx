import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGLTranslation } from '@golden-lift/i18n';
import { GLHeading, GLIconButton } from './primitives';
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
  const { t } = useGLTranslation();
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
      className={'gl-dialog ' + (drawer ? 'gl-drawer' : 'gl-modal') + ' ' + className}
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
      <div className="gl-dialog-heading">
        <GLHeading level={2} role="heading4" id={id}>
          {title}
        </GLHeading>
        <GLIconButton variant="ghost" label={t('close')} onClick={onClose}>
          ×
        </GLIconButton>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
export function GLModal(props: OverlayProps) {
  return <Overlay {...props} />;
}
export function GLDrawer(props: OverlayProps) {
  return <Overlay {...props} drawer />;
}
export function GLTooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="gl-tooltip" tabIndex={0} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id}>
        {label}
      </span>
    </span>
  );
}
export function GLToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);
  const { t } = useGLTranslation();
  return message ? (
    <div role="status" className="gl-toast">
      {message}
      <GLIconButton label={t('close')} variant="ghost" onClick={onClose}>
        ×
      </GLIconButton>
    </div>
  ) : null;
}
