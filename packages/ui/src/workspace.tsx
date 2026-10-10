import { createContext, useContext, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { BPButton } from './primitives';
import { BPDrawer } from './overlays';

interface WorkspaceState {
  active: string;
  prefix: string;
}
const Context = createContext<WorkspaceState | null>(null);
export function BPWorkspace({
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
      <div className="bp-workspace">
        <nav className="bp-workspace-rail" aria-label={label}>
          {sections.map((section, index) => (
            <button
              type="button"
              key={section.id}
              id={prefix + 'nav-' + section.id}
              aria-current={active === section.id ? 'step' : undefined}
              aria-controls={prefix + 'pane-' + section.id}
              onClick={() => onChange(section.id)}
            >
              <span className="bp-workspace-index">0{index + 1}</span>
              <span>
                {section.label}
                {section.status && <small>{section.status}</small>}
              </span>
            </button>
          ))}
        </nav>
        <div className="bp-workspace-canvas">
          <BPButton
            className="bp-inspector-trigger"
            variant="secondary"
            onClick={() => setOpen(true)}
          >
            {inspectorLabel}
          </BPButton>
          {children}
        </div>
        <aside className="bp-workspace-inspector" aria-label={inspectorLabel}>
          {inspector}
        </aside>
        <BPDrawer
          open={open}
          onClose={() => setOpen(false)}
          title={inspectorLabel}
          className="bp-admin-overlay"
        >
          <div className="bp-inspector-drawer">{open && inspector}</div>
        </BPDrawer>
      </div>
    </Context.Provider>
  );
}
export function BPWorkspacePanel({ id, children }: { id: string; children: ReactNode }) {
  const state = useContext(Context);
  if (!state) throw new Error('Workspace panel requires BPWorkspace');
  return (
    <div
      className="bp-workspace-pane"
      id={state.prefix + 'pane-' + id}
      role="region"
      aria-labelledby={state.prefix + 'nav-' + id}
      hidden={state.active !== id}
    >
      {children}
    </div>
  );
}
