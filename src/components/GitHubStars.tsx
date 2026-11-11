/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

"use client";

import { useEffect, useState } from "react";
import { GithubLogo, Star } from "@phosphor-icons/react";
import styles from "./GitHubStars.module.css";

const KEY = "voice-orb:stars";
/* GitHub allows sixty unsigned requests an hour per visitor, so a count is
   kept for ten minutes in the tab before asking again. */
const FRESH = 10 * 60 * 1000;

/** 1234 → "1.2k". */
function short(n: number) {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, "")}k`;
}

/**
 * A link to the repository with its live star count, read from GitHub's API
 * in the visitor's browser. Until the count arrives (or if GitHub can't be
 * reached) it is just the link, with room kept so nothing shifts.
 */
export default function GitHubStars({
  owner,
  repo,
  label,
  star,
}: {
  owner: string;
  repo: string;
  /** The link's accessible name, e.g. "Star voice-orb on GitHub". */
  label: string;
  /** The visible word, e.g. "Star". */
  star: string;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      if (saved && Date.now() - saved.at < FRESH) {
        setCount(saved.count);
        return;
      }
    } catch {
      /* No storage: just ask. */
    }
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (typeof data?.stargazers_count !== "number") return;
        setCount(data.stargazers_count);
        try {
          sessionStorage.setItem(KEY, JSON.stringify({ count: data.stargazers_count, at: Date.now() }));
        } catch {
          /* Not kept: asked again next time. */
        }
      })
      .catch(() => {
        /* Offline or rate limited: the link alone. */
      });
    return () => controller.abort();
  }, [owner, repo]);

  const countLabel = count === null ? "" : `, ${count} ${count === 1 ? "star" : "stars"}`;

  return (
    <a
      className={styles.stars}
      href={`https://github.com/${owner}/${repo}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label}${countLabel}`}
    >
      <GithubLogo weight="fill" aria-hidden="true" className={styles.logo} />
      <span className={styles.word}>{star}</span>
      <span className={styles.count} data-ready={count !== null} aria-hidden="true">
        <Star weight="fill" />
        {count === null ? "–" : short(count)}
      </span>
    </a>
  );
}
