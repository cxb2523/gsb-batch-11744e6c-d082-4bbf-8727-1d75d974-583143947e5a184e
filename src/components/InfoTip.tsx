/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

"use client";

import { useId, useRef, useState } from "react";
import { Info } from "@phosphor-icons/react";
import styles from "./InfoTip.module.css";

/**
 * A small "i" beside a label that explains it.
 *
 * The text shows on hover, on keyboard focus and on tap (a tap focuses the
 * button on touch screens), and Escape hides it. The button is described by
 * the text, so a screen reader reads it without opening anything.
 *
 *   align  start  the bubble runs right from the icon (for labels at the left)
 *          end    it runs left (for labels at the right edge)
 *
 * When it opens it measures itself and slides back inside the screen, so a
 * tip near a phone's edge is never cut off.
 */
export default function InfoTip({
  label,
  children,
  align = "start",
}: {
  /** What the tip is about, for the button's name: "About Warp". */
  label: string;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  const id = useId();
  const [closed, setClosed] = useState(false);
  const bubble = useRef<HTMLSpanElement>(null);

  const place = () => {
    const el = bubble.current;
    if (!el) return;
    el.style.setProperty("--shift", "0px");
    const rect = el.getBoundingClientRect();
    const edge = 12;
    const room = document.documentElement.clientWidth - edge;
    const shift = rect.right > room ? room - rect.right : rect.left < edge ? edge - rect.left : 0;
    el.style.setProperty("--shift", `${Math.round(shift)}px`);
  };

  return (
    <span
      className={`${styles.tip} ${align === "end" ? styles.end : ""} ${closed ? styles.closed : ""}`}
      onPointerEnter={place}
      onFocus={place}
    >
      <button
        type="button"
        className={styles.button}
        aria-label={`About ${label}`}
        aria-describedby={id}
        onKeyDown={(event) => {
          if (event.key === "Escape") setClosed(true);
        }}
        onBlur={() => setClosed(false)}
        onMouseLeave={() => setClosed(false)}
        // A click on a label would otherwise move focus to its slider.
        onClick={(event) => event.preventDefault()}
      >
        <Info weight="regular" aria-hidden="true" />
      </button>
      <span ref={bubble} role="tooltip" id={id} className={styles.bubble}>
        {children}
      </span>
    </span>
  );
}
