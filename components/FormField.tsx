interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "number" | "textarea";
  placeholder?: string;
  step?: number;
  rows?: number;
}

export function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  step,
  rows = 2,
}: FormFieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {type === "textarea" ? (
        <textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-borderc bg-background px-3 py-2 text-sm"
        />
      ) : (
        <input
          type={type}
          step={type === "number" ? (step ?? 1) : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-md border border-borderc bg-background px-3 py-1.5 text-sm ${
            type === "number" ? "tabular-nums" : ""
          }`}
        />
      )}
    </label>
  );
}
