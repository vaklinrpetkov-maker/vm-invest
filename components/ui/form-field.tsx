import type { ReactNode } from "react";
import { FieldHelp } from "@/components/ui/field-help";
import { cn } from "@/lib/cn";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  required?: boolean;
  helper?: ReactNode;
  error?: string;
  // Optional rich help content shown via a `?` icon next to the label.
  // Use for fields where the meaning isn't obvious from the label alone
  // (Bulgarian ID format, abbreviations, business-rule selectors). Pass
  // plain text for short hints, JSX for richer content (lists, emphasis).
  help?: ReactNode;
  // Optional override for the help popover header. Defaults to the field's
  // `label` so the popover echoes which field it's about.
  helpTitle?: string;
  children: ReactNode;
  className?: string;
};

export function FormField({
  label,
  htmlFor,
  required,
  helper,
  error,
  help,
  helpTitle,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-neutral-700 tracking-tight"
        >
          {label}
          {required && (
            <span aria-hidden="true" className="text-neutral-400 ml-1">
              *
            </span>
          )}
        </label>
        {help && <FieldHelp content={help} title={helpTitle ?? label} />}
      </div>
      {children}
      {error ? (
        <p className="text-sm text-danger-700 mt-1.5">{error}</p>
      ) : helper ? (
        <p className="text-sm text-neutral-500 mt-1.5">{helper}</p>
      ) : null}
    </div>
  );
}
