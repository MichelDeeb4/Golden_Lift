import type { ReactNode, CSSProperties } from 'react';
import { X, Trash2 } from '@business-platform/icons';
import { BPButton } from './primitives';
import { BPModal } from './overlays';

export function BPFilterToolbar({
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
      className="bp-filter-toolbar"
      aria-label={label}
      style={{ '--bp-filter-count': fields } as CSSProperties}
    >
      {children}
    </section>
  );
}
export function BPConfirmDialog({
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
    <BPModal
      open={open}
      className="bp-confirm-dialog"
      title={title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      {children}
      <div className="bp-dialog-actions">
        <BPButton variant="secondary" disabled={pending} onClick={onClose}>
          <X size={18} aria-hidden="true" />
          {cancelLabel}
        </BPButton>
        <BPButton variant={variant} loading={pending} onClick={onConfirm}>
          {icon ?? <Trash2 size={18} aria-hidden="true" />}
          {confirmLabel}
        </BPButton>
      </div>
    </BPModal>
  );
}
export function BPUnsavedChangesDialog({
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
    <BPConfirmDialog
      open={open}
      title={title}
      onClose={onStay}
      onConfirm={onLeave}
      cancelLabel={stayLabel}
      confirmLabel={leaveLabel}
      icon={<X size={18} aria-hidden="true" />}
    >
      <p>{description}</p>
    </BPConfirmDialog>
  );
}
