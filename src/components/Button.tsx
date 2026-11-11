/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

"use client";

import Link from "next/link";
import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import styles from "./Button.module.css";

/**
 * The lab's button.
 *
 *   variant  primary   the one action a panel asks for: an ink fill
 *            secondary the alternative beside it: white with a hairline
 *            ghost     a quiet text action
 *   surface  light | dark: what the button sits on. On dark, primary turns
 *            white and the others follow.
 *   size     sm 32px · md 40px · lg 48px
 *
 * Pass `href` for a link (internal paths use next/link; `external` opens a new
 * tab), otherwise it renders a <button type="button">.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSurface = "light" | "dark";
export type ButtonSize = "sm" | "md" | "lg";

type OwnProps = {
  variant?: ButtonVariant;
  surface?: ButtonSurface;
  size?: ButtonSize;
  /** A leading icon. */
  icon?: ReactNode;
  /** A trailing arrow that nudges forward on hover. */
  arrow?: boolean;
  fullWidth?: boolean;
  /** Shows a spinner in place of the icon and blocks presses. */
  loading?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonProps = OwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof OwnProps> & { href?: undefined };

type LinkProps = OwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof OwnProps> & {
    href: string;
    /** Opens in a new tab with rel="noopener noreferrer". */
    external?: boolean;
  };

export default function Button(props: ButtonProps | LinkProps) {
  const {
    variant = "primary",
    surface = "light",
    size = "md",
    icon,
    arrow = false,
    fullWidth = false,
    loading = false,
    className,
    children,
    ...rest
  } = props;

  const classes = [
    styles.button,
    styles[variant],
    styles[surface],
    styles[size],
    fullWidth ? styles.full : "",
    loading ? styles.loading : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        icon && <span className={styles.icon}>{icon}</span>
      )}
      <span>{children}</span>
      {arrow && (
        <span className={styles.arrow} aria-hidden="true">
          <ArrowRight weight="bold" />
        </span>
      )}
    </>
  );

  if (props.href !== undefined) {
    const { href, external, ...anchor } = rest as Omit<LinkProps, keyof OwnProps>;
    const shared = { ...anchor, className: classes, "aria-busy": loading || undefined };
    if (external || /^(https?:|mailto:|tel:)/.test(href)) {
      return (
        <a
          {...shared}
          href={href}
          target={external ? "_blank" : anchor.target}
          rel={external ? "noopener noreferrer" : anchor.rel}
        >
          {content}
        </a>
      );
    }
    return (
      <Link {...shared} href={href}>
        {content}
      </Link>
    );
  }

  const { type, disabled, ...button } = rest as Omit<ButtonProps, keyof OwnProps>;
  return (
    <button
      {...button}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </button>
  );
}
