import type { ReactNode, CSSProperties } from 'react';
import { X, Trash2 } from '@golden-lift/icons';
import { GLButton } from './primitives';
import { GLModal } from './overlays';

export function GLFilterToolbar({
  children,
  label,
  fields = 1,
}: {
  children: ReactNode;
  label: string;
  fields?: number;
}) {
  return (
    <section
      className="gl-filter-toolbar"
      aria-label={label}
      style={{ '--gl-filter-count': fields } as CSSProperties}
    >
      {children}
    </section>
  );
}
export function GLConfirmDialog({
  open,
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel,
  cancelLabel,
  pending = false,
  variant = 'destructive',
  icon,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  variant?: 'destructive' | 'secondary' | 'warning';
  icon?: ReactNode;
}) {
  return (
    <GLModal
      open={open}
      title={title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      {children}
      <div className="gl-dialog-actions">
        <GLButton variant="secondary" disabled={pending} onClick={onClose}>
          <X size={18} aria-hidden="true" />
          {cancelLabel}
        </GLButton>
        <GLButton variant={variant} loading={pending} onClick={onConfirm}>
          {icon ?? <Trash2 size={18} aria-hidden="true" />}
          {confirmLabel}
        </GLButton>
      </div>
    </GLModal>
  );
}
export function GLUnsavedChangesDialog({
  open,
  title,
  description,
  stayLabel,
  leaveLabel,
  onStay,
  onLeave,
}: {
  open: boolean;
  title: string;
  description: string;
  stayLabel: string;
  leaveLabel: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <GLConfirmDialog
      open={open}
      title={title}
      onClose={onStay}
      onConfirm={onLeave}
      cancelLabel={stayLabel}
      confirmLabel={leaveLabel}
      icon={<X size={18} aria-hidden="true" />}
    >
      <p>{description}</p>
    </GLConfirmDialog>
  );
}
