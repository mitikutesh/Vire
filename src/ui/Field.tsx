import { useId } from 'react';
import type { ReactNode } from 'react';

/**
 * Form primitives for the profile screen, which is almost entirely numeric
 * entry. The label is a real `<label>` bound to the control by id — the
 * prototype wrapped controls in a label element with no association, which
 * works by accident for clicks and not at all for screen readers.
 */

const CONTROL_CLASS =
  'border-line bg-paper text-ink rounded-xl border px-3 py-2 text-sm font-normal normal-case outline-none';

interface FieldProps {
  label: string;
  /** Rendered under the control — used for the allergy label-check warning. */
  hint?: string;
  children: (props: { id: string; className: string }) => ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sub text-xs font-semibold tracking-wide uppercase">
        {label}
      </label>
      {children({ id, className: CONTROL_CLASS })}
      {hint ? <p className="text-sub text-xs">{hint}</p> : null}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}

export function TextField({ label, value, onChange, placeholder, hint }: TextFieldProps) {
  return (
    <Field label={label} hint={hint}>
      {({ id, className }) => (
        <input
          id={id}
          className={className}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}

export function NumberField({ label, value, onChange, hint }: NumberFieldProps) {
  return (
    <Field label={label} hint={hint}>
      {({ id, className }) => (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className={className}
          value={value}
          onChange={(e) => {
            // Clamp at zero here; the real ranges are enforced by the profile
            // schema on save, server-side (I5).
            const next = Number.parseInt(e.target.value || '0', 10);
            onChange(Math.max(0, Number.isFinite(next) ? next : 0));
          }}
        />
      )}
    </Field>
  );
}

interface SelectFieldProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  return (
    <Field label={label} hint={hint}>
      {({ id, className }) => (
        <select
          id={id}
          className={`${className} w-full`}
          value={value}
          onChange={(e) => {
            const picked = options.find((o) => String(o.value) === e.target.value);
            if (picked) onChange(picked.value);
          }}
        >
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
