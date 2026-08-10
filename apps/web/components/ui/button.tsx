import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "default";
  size?: "sm" | "md" | "lg";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  default: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-surface text-foreground border border-border hover:bg-background",
  outline: "border border-border bg-background text-foreground hover:bg-surface",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "bg-transparent text-muted hover:text-foreground hover:bg-surface",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-2.5 py-1 text-xs font-medium rounded-md",
  md: "px-3.5 py-2 text-sm font-medium rounded-md",
  lg: "px-4 py-2.5 text-base font-medium rounded-lg",
};

export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
