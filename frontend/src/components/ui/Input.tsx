import React, { InputHTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
  label?: string;
}

export const Input: React.FC<InputProps> = ({
  className,
  icon,
  error,
  label,
  id,
  type = "text",
  ...props
}) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest transition-colors"
        >
          {label}
        </label>
      )}
      <div className="relative w-full group">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-reply-text-secondary dark:text-reply-text-secondary-dark group-focus-within:text-reply-brand transition-colors shrink-0">
            {icon}
          </div>
        )}
        <input
          id={id}
          type={type}
          className={twMerge(
            clsx(
              "w-full bg-reply-bg/20 dark:bg-white/5 border rounded-xl py-2.5 text-sm font-medium transition-all outline-none text-reply-text-primary dark:text-reply-text-primary-dark placeholder:text-reply-text-secondary/40",
              icon ? "pl-10 pr-4" : "px-4",
              error
                ? "border-rose-500 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500"
                : "border-reply-border dark:border-reply-border-dark focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand",
              props.disabled && "opacity-40 pointer-events-none"
            ),
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <span className="text-[11px] font-bold text-rose-500 animate-in fade-in slide-in-from-top-1 duration-200">
          {error}
        </span>
      )}
    </div>
  );
};
