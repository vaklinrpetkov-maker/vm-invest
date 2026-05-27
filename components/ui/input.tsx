import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Size = "sm" | "md" | "lg";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  inputSize?: Size;
  invalid?: boolean;
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5",
  md: "h-8 px-3",
  lg: "h-9 px-3.5",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize = "md", invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "block w-full rounded-lg text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight",
        "transition-colors duration-120",
        "focus:outline-none focus:ring-2 focus:ring-accent-500/40",
        "disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed",
        "read-only:bg-transparent read-only:text-neutral-700",
        invalid
          ? "bg-danger-50 hover:bg-danger-50 focus:ring-danger-500/40"
          : "bg-neutral-100 hover:bg-neutral-150",
        sizeClasses[inputSize],
        className,
      )}
      {...props}
    />
  );
});
