import { createContext, useContext, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { GLButton } from './primitives';
import { GLDrawer } from './overlays';

interface WorkspaceState {
  active: string;
  prefix: string;
}
const Context = createContext<WorkspaceState | null>(null);
export function GLWorkspace({
  active,
  onChange,
  sections,
  children,
  inspector,
  inspectorLabel,
  label,
}: {
  active: string;
  onChange: (section: string) => void;
  sections: readonly { id: string; label: string; status?: string }[];
  children: ReactNode;
  inspector: ReactNode;
  inspectorLabel: string;
  label: string;
}) {
  const prefix = useId(),
    [open, setOpen] = useState(false);
  return (
    <Context.Provider value={{ active, prefix }}>
      <div className="gl-workspace">
        <nav className="gl-workspace-rail" aria-label={label}>
          {sections.map((section, index) => (
            <button
              type="button"
              key={section.id}
              id={prefix + 'nav-' + section.id}
              aria-current={active === section.id ? 'step' : undefined}
              aria-controls={prefix + 'pane-' + section.id}
              onClick={() => onChange(section.id)}
            >
              <span className="gl-workspace-index">0{index + 1}</span>
              <span>
                {section.label}
                {section.status && <small>{section.status}</small>}
              </span>
            </button>
          ))}
        </nav>
        <div className="gl-workspace-canvas">
          <GLButton
            className="gl-inspector-trigger"
            variant="secondary"
            onClick={() => setOpen(true)}
          >
            {inspectorLabel}
          </GLButton>
          {children}
        </div>
        <aside className="gl-workspace-inspector" aria-label={inspectorLabel}>
          {inspector}
        </aside>
        <GLDrawer
          open={open}
          onClose={() => setOpen(false)}
          title={inspectorLabel}
          className="gl-admin-overlay"
        >
          <div className="gl-inspector-drawer">{open && inspector}</div>
        </GLDrawer>
      </div>
    </Context.Provider>
  );
}
export function GLWorkspacePanel({ id, children }: { id: string; children: ReactNode }) {
  const state = useContext(Context);
  if (!state) throw new Error('Workspace panel requires GLWorkspace');
  return (
    <div
      className="gl-workspace-pane"
      id={state.prefix + 'pane-' + id}
      role="region"
      aria-labelledby={state.prefix + 'nav-' + id}
      hidden={state.active !== id}
    >
      {children}
    </div>
  );
}
