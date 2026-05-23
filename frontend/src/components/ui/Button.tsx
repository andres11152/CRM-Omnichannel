import React, { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = "primary",
  size = "md",
  isLoading,
  disabled,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-bold transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-40 rounded-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-reply-brand/50 select-none";

  const variants = {
    primary:
      "bg-reply-brand hover:bg-reply-brand-dark text-white shadow-md shadow-reply-brand/10 hover:shadow-lg hover:shadow-reply-brand/20",
    secondary:
      "bg-reply-panel dark:bg-reply-panel-dark text-reply-text-primary dark:text-reply-text-primary-dark border border-reply-border dark:border-reply-border-dark hover:bg-reply-bg dark:hover:bg-reply-bg-dark",
    outline:
      "border border-reply-brand text-reply-brand hover:bg-reply-brand/5 dark:hover:bg-reply-brand/10",
    ghost:
      "text-reply-text-secondary dark:text-reply-text-secondary-dark hover:text-reply-text-primary dark:hover:text-reply-text-primary-dark hover:bg-reply-bg dark:hover:bg-reply-bg-dark",
    danger:
      "bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/10 hover:shadow-lg hover:shadow-rose-500/20",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-3",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : null}
      {children}
    </button>
  );
};
