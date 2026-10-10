import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BPButton, BPHeading } from './primitives';
import { BPBreadcrumb } from './navigation';
import type { NavLink } from './navigation';
import {
  Pencil,
  Eye,
  Link,
  Move,
  ArrowUpDown,
  CircleCheck,
  CircleOff,
  Trash2,
  Archive,
  Plus,
  Save,
  X,
  Search,
  FilterX,
  Upload,
  Download,
  FolderPlus,
  MoreHorizontal,
} from '@business-platform/icons';
const actionIcons = {
  edit: Pencil,
  view: Eye,
  link: Link,
  move: Move,
  reorder: ArrowUpDown,
  enable: CircleCheck,
  disable: CircleOff,
  delete: Trash2,
  deprecate: Archive,
  create: Plus,
  save: Save,
  cancel: X,
  search: Search,
  clear: FilterX,
  upload: Upload,
  download: Download,
  child: FolderPlus,
  more: MoreHorizontal,
};

export function BPPageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  context,
}: {
  title: string;
  description?: string;
  breadcrumbs?: readonly NavLink[];
  actions?: ReactNode;
  context?: ReactNode;
}) {
  return (
    <header className="bp-page-heading">
      {breadcrumbs && <BPBreadcrumb items={breadcrumbs} />}
      <div className="bp-page-heading-row">
        <div>
          <BPHeading level={1} role="heading2">
            {title}
          </BPHeading>
          {description && <p className="bp-page-intro">{description}</p>}
          {context && <div className="bp-page-context">{context}</div>}
        </div>
        {actions && <div className="bp-page-actions">{actions}</div>}
      </div>
    </header>
  );
}
export function BPFormSection({
  title,
  description,
  children,
  className = '',
  id,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const heading = useId();
  return (
    <section id={id} className={'bp-form-section ' + className} aria-labelledby={heading}>
      <div className="bp-form-section-heading">
        <BPHeading level={2} role="heading5" id={heading}>
          {title}
        </BPHeading>
        {description && <p>{description}</p>}
      </div>
      <div className="bp-form-section-body">{children}</div>
    </section>
  );
}
export function BPActionBar({ children }: { children: ReactNode }) {
  return <div className="bp-action-bar">{children}</div>;
}
export interface BPMenuAction {
  label: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: keyof typeof actionIcons;
  tone?: 'success' | 'warning';
}
export function BPActionMenu({ label, items }: { label: string; items: readonly BPMenuAction[] }) {
  const [open, setOpen] = useState(false),
    host = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    host.current
      ?.querySelector<HTMLElement>(
        '.bp-action-menu-panel a, .bp-action-menu-panel button:not(:disabled)',
      )
      ?.focus();
    function outside(event: PointerEvent) {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div
      className="bp-action-menu"
      ref={host}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (!open && event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true);
        }
        if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const actions = Array.from(
            host.current?.querySelectorAll<HTMLElement>(
              '.bp-action-menu-panel a, .bp-action-menu-panel button:not(:disabled)',
            ) ?? [],
          );
          const current = actions.indexOf(document.activeElement as HTMLElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? actions.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) %
                  actions.length;
          actions[next]?.focus();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="bp-button bp-button-ghost bp-button-md bp-action-menu-trigger"
        title={label}
        aria-haspopup="menu"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          className="bp-action-menu-panel"
          role="menu"
          aria-label={label}
          style={{
            top: Math.max(
              8,
              Math.min(
                (trigger.current?.getBoundingClientRect().bottom ?? 0) + 8,
                window.innerHeight - items.length * 48 - 32,
              ),
            ),
            left: Math.max(
              8,
              Math.min(
                trigger.current && getComputedStyle(trigger.current).direction === 'rtl'
                  ? trigger.current.getBoundingClientRect().left
                  : (trigger.current?.getBoundingClientRect().right ?? 220) - 220,
                window.innerWidth - 228,
              ),
            ),
          }}
        >
          {items.map((item, index) => {
            const Icon = actionIcons[item.icon ?? (item.destructive ? 'delete' : 'more')];
            const content = (
              <>
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </>
            );
            const separated = item.destructive && !items[index - 1]?.destructive;
            return item.href ? (
              <a
                key={index}
                href={item.href}
                role="menuitem"
                className="bp-button bp-button-ghost bp-button-md"
                onClick={() => setOpen(false)}
              >
                {content}
              </a>
            ) : (
              <BPButton
                key={index}
                role="menuitem"
                className={separated ? 'bp-menu-destructive' : undefined}
                variant={item.destructive ? 'destructive' : (item.tone ?? 'ghost')}
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                {content}
              </BPButton>
            );
          })}
        </div>
      )}
    </div>
  );
}
