import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-elevated px-3 text-sm text-fg placeholder:text-subtle outline-none transition-[border-color] duration-150 focus:border-line",
        className,
      )}
      {...props}
    />
  );
}
