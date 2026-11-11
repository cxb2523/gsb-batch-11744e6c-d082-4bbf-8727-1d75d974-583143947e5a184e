/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

/**
 * What the Link source accepts: a YouTube link (played in YouTube's own
 * player) or a direct link to an audio file (fetched and played here, which
 * only works when its host allows other pages to read it, through CORS).
 */
export type AudioLink =
  | { kind: "youtube"; id: string; start: number }
  | { kind: "audio"; url: string };

/** A link's kind, or null when it is neither. */
export function parseAudioLink(raw: string): AudioLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
  } else {
    return { kind: "audio", url: url.href };
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  return { kind: "youtube", id, start: seconds(url.searchParams.get("t") ?? url.searchParams.get("start")) };
}

/** YouTube's start time: "33", "33s" or "1m3s". */
function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export class LinkError extends Error {
  constructor(public reason: "blocked" | "invalid") {
    super(reason);
  }
}

/**
 * A direct audio link, downloaded into an object URL so Web Audio may read
 * it. Throws LinkError("blocked") when the host refuses other pages (the
 * usual case without CORS), LinkError("invalid") when it isn't audio.
 */
export async function fetchAudioLink(url: string): Promise<{ src: string; title: string }> {
  let response: Response;
  try {
    response = await fetch(url, { mode: "cors" });
  } catch {
    throw new LinkError("blocked");
  }
  if (!response.ok) throw new LinkError("blocked");
  const type = response.headers.get("content-type") ?? "";
  if (type.startsWith("text/") || type.includes("html") || type.includes("json")) throw new LinkError("invalid");
  const blob = await response.blob();
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "") || "Audio link";
  return { src: URL.createObjectURL(blob), title: name };
}
