import { useEffect, useId, useRef, useState } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { useGLTranslation } from '@golden-lift/i18n';
import { Search } from '@golden-lift/icons';
import { GLIconButton } from './primitives';
interface FieldProps {
  label: string;
  help?: string;
  error?: string;
  success?: string;
}
function Field({
  id,
  label,
  help,
  error,
  success,
  children,
}: { id: string; children: ReactNode } & FieldProps) {
  return (
    <div className={'gl-field ' + (error ? 'is-error' : success ? 'is-success' : '')}>
      <label htmlFor={id}>{label}</label>
      {children}
      {(help || error || success) && (
        <span id={id + '-help'} className="gl-field-help" role={error ? 'alert' : undefined}>
          {error ?? success ?? help}
        </span>
      )}
    </div>
  );
}
export function GLInput({
  label,
  help,
  error,
  success,
  id: given,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const generated = useId(),
    id = given ?? generated;
  return (
    <Field {...{ id, label, help, error, success }}>
      <input
        {...props}
        id={id}
        className={'gl-input ' + (props.className ?? '')}
        aria-invalid={!!error}
        aria-describedby={help || error || success ? id + '-help' : undefined}
      />
    </Field>
  );
}
export function GLTextarea({
  label,
  help,
  error,
  success,
  id: given,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const generated = useId(),
    id = given ?? generated;
  return (
    <Field {...{ id, label, help, error, success }}>
      <textarea
        {...props}
        id={id}
        className="gl-input gl-textarea"
        aria-invalid={!!error}
        aria-describedby={help || error || success ? id + '-help' : undefined}
      />
    </Field>
  );
}
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}
export function GLSelect({
  label,
  options,
  value,
  onChange,
  disabled,
  error,
  help,
}: {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
} & FieldProps) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const selected = options.find((o) => o.value === value);
  function show() {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  }
  return (
    <Field {...{ id, label, error, help }}>
      <div className="gl-combobox" ref={container}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={id + '-list'}
          aria-activedescendant={open && options[active] ? id + '-' + active : undefined}
          id={id}
          className="gl-input gl-select"
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              setOpen(false);
              return;
            }
            if (e.key === 'Escape') {
              if (open) {
                e.preventDefault();
                e.stopPropagation();
              }
              setOpen(false);
              return;
            }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              if (!open) {
                show();
                return;
              }
              setActive((i) =>
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? options.length - 1
                    : (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
              );
            }
            if ((e.key === 'Enter' || e.key === ' ') && open) {
              e.preventDefault();
              const item = options[active];
              if (item) onChange(item.value);
              setOpen(false);
            }
          }}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={help || error ? id + '-help' : undefined}
        >
          {selected?.label ?? label}
        </button>
        {open && (
          <ul id={id + '-list'} role="listbox" className="gl-options">
            {options.map((o, i) => (
              <li
                key={o.value}
                id={id + '-' + i}
                role="option"
                aria-selected={o.value === value}
                className={i === active ? 'gl-option-active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
export function GLCombobox({
  label,
  options,
  value,
  onChange,
}: {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
} & FieldProps) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const matches = options.filter((o) => o.label.toLowerCase().includes(value.toLowerCase()));
  return (
    <Field id={id} label={label}>
      <div className="gl-combobox">
        <input
          id={id}
          className="gl-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={id + '-list'}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? id + '-' + active : undefined}
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((v) => Math.min(v + 1, matches.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((v) => Math.max(0, v - 1));
            }
            if (e.key === 'Escape') {
              if (open) {
                e.preventDefault();
                e.stopPropagation();
              }
              setOpen(false);
            }
            if (e.key === 'Enter' && open && matches[active]) {
              e.preventDefault();
              onChange(matches[active]!.label);
              setOpen(false);
            }
          }}
        />
        {open && (
          <ul id={id + '-list'} role="listbox" className="gl-options">
            {matches.map((o, i) => (
              <li
                key={o.value}
                id={id + '-' + i}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.label);
                  setOpen(false);
                }}
              >
                {o.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
export function GLCheckbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="gl-choice">
      <input {...props} type="checkbox" />
      {label}
    </label>
  );
}
export function GLRadio({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="gl-choice">
      <input {...props} type="radio" />
      {label}
    </label>
  );
}
export function GLSwitch({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="gl-choice gl-switch">
      <input {...props} type="checkbox" role="switch" />
      {label}
    </label>
  );
}
export function GLSearchField({
  label,
  onSubmit,
  ...props
}: Omit<Parameters<typeof GLInput>[0], 'type'> & { onSubmit?: () => void }) {
  const { t } = useGLTranslation();
  return (
    <div className="gl-search-field">
      <GLInput
        {...props}
        label={label}
        type="search"
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.key === 'Enter') onSubmit?.();
        }}
      />
      <GLIconButton label={t('search')} variant="dark" onClick={onSubmit}>
        <Search size={18} />
      </GLIconButton>
    </div>
  );
}
