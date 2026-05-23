import React, { HTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  hoverable = false,
  ...props
}) => {
  return (
    <div
      className={twMerge(
        clsx(
          "bg-white dark:bg-reply-panel-dark rounded-2xl border border-reply-border dark:border-reply-border-dark shadow-sm overflow-hidden",
          hoverable &&
            "hover:shadow-xl hover:shadow-gray-200/40 dark:hover:shadow-none hover:-translate-y-1 transition-all duration-300"
        ),
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
