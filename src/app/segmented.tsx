/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

"use client";

import styles from "./page.module.css";

/** A row of mutually exclusive choices, for the orb board's controls. */
export default function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; name: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className={styles.control}>
      <span className={styles.controlLabel}>{label}</span>
      <div className={styles.segmented} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={styles.segment}
            aria-pressed={option.id === value}
            onClick={() => onChange(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}
