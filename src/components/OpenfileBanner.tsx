/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */
"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { ORB_LAB, ORB_OPENFILE } from "@/data/orb";
import styles from "./OpenfileBanner.module.css";

const O = ORB_LAB.openfile;

/**
 * One quiet card for Openfile, UV's Framer template shop, at the foot of the
 * page. The whole card is the link, so it's one easy target on a phone. The
 * referrer is kept (noopener, not noreferrer) alongside the UTM tags.
 */
export default function OpenfileBanner() {
  return (
    <a href={ORB_OPENFILE.href("banner")} target="_blank" rel="noopener" className={styles.banner}>
      <OpenfileMark className={styles.mark} />
      <span className={styles.text}>
        <span className={styles.label}>{O.label}</span>
        <span className={styles.title}>{O.title}</span>
        <span className={styles.body}>{O.body}</span>
      </span>
      <span className={styles.cta}>
        {O.cta}
        <ArrowUpRight weight="bold" aria-hidden="true" />
      </span>
    </a>
  );
}

/** Openfile's mark. It's Openfile's own and isn't covered by this project's MIT licence. */
function OpenfileMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="10 10 316 316" aria-hidden="true">
      <rect x="10" y="10" width="316" height="316" fill="#000" />
      <path
        fill="#fff"
        d="M168 40C238.692 40 296 97.3076 296 168C296 238.692 238.692 296 168 296C97.3076 296 40 238.692 40 168C40 97.3076 97.3076 40 168 40ZM197.512 87.5127C181.213 71.2136 154.786 71.2136 138.487 87.5127L92.8779 133.122C73.6154 152.385 73.6154 183.615 92.8779 202.878L138.487 248.487C154.786 264.786 181.213 264.786 197.512 248.487L243.122 202.878C262.384 183.615 262.384 152.385 243.122 133.122L197.512 87.5127Z"
      />
      <path
        fill="#fff"
        d="M168 113L171.026 119.926C179.831 140.08 195.92 156.169 216.074 164.974L223 168L216.074 171.026C195.92 179.831 179.831 195.92 171.026 216.074L168 223L164.974 216.074C156.169 195.92 140.08 179.831 119.926 171.026L113 168L119.926 164.974C140.08 156.169 156.169 140.08 164.974 119.926L168 113Z"
      />
    </svg>
  );
}
