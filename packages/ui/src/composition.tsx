import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GLButton, GLHeading } from './primitives';
import { GLBreadcrumb } from './navigation';
import type { NavLink } from './navigation';

export function GLPageHeader({
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
    <header className="gl-page-heading">
      {breadcrumbs && <GLBreadcrumb items={breadcrumbs} />}
      <div className="gl-page-heading-row">
        <div>
          <GLHeading level={1} role="heading2">
            {title}
          </GLHeading>
          {description && <p className="gl-page-intro">{description}</p>}
          {context && <div className="gl-page-context">{context}</div>}
        </div>
        {actions && <div className="gl-page-actions">{actions}</div>}
      </div>
    </header>
  );
}
export function GLFormSection({
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
    <section id={id} className={'gl-form-section ' + className} aria-labelledby={heading}>
      <div className="gl-form-section-heading">
        <GLHeading level={2} role="heading5" id={heading}>
          {title}
        </GLHeading>
        {description && <p>{description}</p>}
      </div>
      <div className="gl-form-section-body">{children}</div>
    </section>
  );
}
export function GLActionBar({ children }: { children: ReactNode }) {
  return <div className="gl-action-bar">{children}</div>;
}
export interface GLMenuAction {
  label: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}
export function GLActionMenu({ label, items }: { label: string; items: readonly GLMenuAction[] }) {
  const [open, setOpen] = useState(false),
    host = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    host.current
      ?.querySelector<HTMLElement>(
        '.gl-action-menu-panel a, .gl-action-menu-panel button:not(:disabled)',
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
      className="gl-action-menu"
      ref={host}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const actions = Array.from(
            host.current?.querySelectorAll<HTMLElement>(
              '.gl-action-menu-panel a, .gl-action-menu-panel button:not(:disabled)',
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
        className="gl-button gl-button-ghost gl-button-md"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <div
          id={id}
          className="gl-action-menu-panel"
          role="group"
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
                (trigger.current?.getBoundingClientRect().right ?? 220) - 220,
                window.innerWidth - 228,
              ),
            ),
          }}
        >
          {items.map((item, index) =>
            item.href ? (
              <a
                key={index}
                href={item.href}
                className="gl-button gl-button-ghost gl-button-md"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ) : (
              <GLButton
                key={index}
                variant={item.destructive ? 'destructive' : 'ghost'}
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                {item.label}
              </GLButton>
            ),
          )}
        </div>
      )}
    </div>
  );
}
