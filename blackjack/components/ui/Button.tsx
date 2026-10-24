"use client";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:brightness-105 active:brightness-95 shadow-1",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 border border-line",
  outline: "bg-transparent text-ink border border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "bg-neg text-white hover:brightness-110",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-11 px-4 text-[0.9375rem] gap-2 rounded-xl",
  lg: "h-14 px-6 text-base gap-2.5 rounded-2xl",
};

export const buttonClass = (variant: ButtonVariant = "primary", size: ButtonSize = "md", block = false, className?: string) =>
  cx(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition",
    "disabled:pointer-events-none disabled:opacity-45",
    VARIANT[variant],
    SIZE[size],
    block && "w-full",
    className,
  );

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
};

/** Defaults to `type="button"`: a button inside a form never submits it by accident. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", block, icon, trailing, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, block, className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </button>
  );
});

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
};

export function ButtonLink({ variant = "primary", size = "md", block, icon, trailing, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, block, className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </Link>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md"; variant?: "ghost" | "secondary" };

/** An icon-only button. `label` is required because it is the only name a screen reader gets. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", variant = "ghost", className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:text-ink disabled:opacity-40",
        variant === "ghost" ? "hover:bg-surface-2" : "border border-line bg-surface-2 hover:bg-surface-3",
        size === "md" ? "h-11 w-11" : "h-9 w-9",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
