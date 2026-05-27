import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

// Heights match input scale exactly so buttons and inputs align on the same row.
const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5 text-sm",
  md: "h-8 px-3 text-base",
  lg: "h-9 px-3.5 text-base",
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-neutral-900 text-neutral-0 hover:bg-neutral-800 active:bg-neutral-900 disabled:bg-neutral-300 disabled:text-neutral-50",
  secondary:
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-150 active:bg-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400",
  ghost:
    "bg-transparent text-neutral-700 hover:bg-neutral-100 active:bg-neutral-150 disabled:text-neutral-400",
  destructive:
    "bg-danger-500 text-neutral-0 hover:bg-danger-600 active:bg-danger-700 disabled:bg-neutral-300 disabled:text-neutral-50",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium tracking-tight",
        "transition-colors duration-120",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40",
        "disabled:cursor-not-allowed",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
