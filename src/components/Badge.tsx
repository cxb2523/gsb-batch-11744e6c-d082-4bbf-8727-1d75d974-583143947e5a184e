/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

import styles from "./Badge.module.css";

/** A small pill above a page title, with an optional live dot. */
export default function Badge({ children, dot = false }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={styles.badge}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
