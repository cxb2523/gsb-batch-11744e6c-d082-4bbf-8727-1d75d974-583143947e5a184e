/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

"use client";

import { useEffect, useRef } from "react";

/** YouTube's player states, as its API reports them. */
export const YT_ENDED = 0;
export const YT_PLAYING = 1;
export const YT_PAUSED = 2;

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      host?: string;
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: { onStateChange?: (event: { data: number }) => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTNamespace> | null = null;

/** YouTube's IFrame API, loaded once, the first time a link is played. */
function loadApi(): Promise<YTNamespace> {
  api ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
  });
  return api;
}

export interface YouTubeControls {
  play(): void;
  pause(): void;
}

/**
 * YouTube's own player, shown in full as its terms ask, from the privacy
 * enhanced host. The page drives it through `controls` and hears about play,
 * pause and end through `onState`. It can't hear the sound: that takes the
 * tab-audio share (lib/orb/audio.ts, openTabAudio).
 */
export default function YouTubePlayer({
  id,
  start,
  controls,
  onState,
  className,
}: {
  id: string;
  start: number;
  controls: React.RefObject<YouTubeControls | null>;
  onState: (state: number) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stateRef = useRef(onState);
  stateRef.current = onState;

  useEffect(() => {
    let player: YTPlayer | null = null;
    let gone = false;
    const holder = host.current;
    loadApi().then((YT) => {
      if (gone || !holder) return;
      // The API replaces the element it is given, so give it a fresh one.
      const mount = document.createElement("div");
      holder.replaceChildren(mount);
      player = new YT.Player(mount, {
        host: "https://www.youtube-nocookie.com",
        videoId: id,
        width: "100%",
        height: "100%",
        playerVars: { start, playsinline: 1, rel: 0 },
        events: { onStateChange: (event) => stateRef.current(event.data) },
      });
      controls.current = {
        play: () => player?.playVideo(),
        pause: () => player?.pauseVideo(),
      };
    });
    return () => {
      gone = true;
      controls.current = null;
      player?.destroy();
      holder?.replaceChildren();
    };
  }, [id, start, controls]);

  return <div ref={host} className={className} />;
}
