import { useEffect, useId, useRef, useState } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { useBPTranslation } from '@business-platform/i18n';
import { Search, X } from '@business-platform/icons';
import { BPIconButton } from './primitives';
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
  required,
  children,
}: { id: string; children: ReactNode; required?: boolean } & FieldProps) {
  return (
    <div className={'bp-field ' + (error ? 'is-error' : success ? 'is-success' : '')}>
      <label htmlFor={id}>
        {label}
        {required && <span className="bp-required" aria-hidden="true" />}
      </label>
      {children}
      {(help || error || success) && (
        <span id={id + '-help'} className="bp-field-help" role={error ? 'alert' : undefined}>
          {error ?? success ?? help}
        </span>
      )}
    </div>
  );
}
export function BPInput({
  label,
  help,
  error,
  success,
  id: given,
  onClear,
  clearLabel,
  ...props
}: InputHTMLAttributes<HTMLInputElement> &
  FieldProps & { onClear?: () => void; clearLabel?: string }) {
  const { t } = useBPTranslation();
  const generated = useId(),
    id = given ?? generated;
  return (
    <Field {...{ id, label, help, error, success }} required={props.required}>
      <div
        className={
          props.type === 'search' ? 'bp-input-control bp-input-search' : 'bp-input-control'
        }
      >
        {props.type === 'search' && (
          <Search size={18} className="bp-input-adornment" aria-hidden="true" />
        )}
        <input
          {...props}
          id={id}
          className={'bp-input ' + (props.className ?? '')}
          aria-invalid={!!error}
          aria-describedby={help || error || success ? id + '-help' : undefined}
        />
        {onClear && String(props.value ?? '') && (
          <BPIconButton
            className="bp-input-clear"
            label={clearLabel ?? t('clear')}
            variant="ghost"
            disabled={props.disabled}
            onClick={onClear}
          >
            <X size={16} aria-hidden="true" />
          </BPIconButton>
        )}
      </div>
    </Field>
  );
}
export function BPTextarea({
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
        className="bp-input bp-textarea"
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
export function BPSelect({
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
      <div className="bp-combobox" ref={container}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={id + '-list'}
          aria-activedescendant={open && options[active] ? id + '-' + active : undefined}
          id={id}
          className="bp-input bp-select"
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
          <ul id={id + '-list'} role="listbox" className="bp-options">
            {options.map((o, i) => (
              <li
                key={o.value}
                id={id + '-' + i}
                role="option"
                aria-selected={o.value === value}
                className={i === active ? 'bp-option-active' : ''}
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
export function BPCombobox({
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
      <div className="bp-combobox">
        <input
          id={id}
          className="bp-input"
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
          <ul id={id + '-list'} role="listbox" className="bp-options">
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
export function BPCheckbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="bp-choice">
      <input {...props} type="checkbox" />
      {label}
    </label>
  );
}
export function BPRadio({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="bp-choice">
      <input {...props} type="radio" />
      {label}
    </label>
  );
}
export function BPSwitch({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="bp-choice bp-switch">
      <input {...props} type="checkbox" role="switch" />
      {label}
    </label>
  );
}
export function BPSearchField({
  label,
  onSubmit,
  ...props
}: Omit<Parameters<typeof BPInput>[0], 'type'> & { onSubmit?: () => void }) {
  const { t } = useBPTranslation();
  return (
    <div className="bp-search-field">
      <BPInput
        {...props}
        label={label}
        type="search"
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.key === 'Enter') onSubmit?.();
        }}
      />
      <BPIconButton label={t('search')} variant="dark" onClick={onSubmit}>
        <Search size={18} />
      </BPIconButton>
    </div>
  );
}
