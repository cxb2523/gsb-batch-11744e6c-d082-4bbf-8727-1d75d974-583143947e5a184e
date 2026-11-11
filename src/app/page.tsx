/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CaretLeft,
  CaretRight,
  Check,
  Copy,
  GithubLogo,
  Microphone,
  MicrophoneSlash,
  Palette,
  Pause,
  Phone,
  Play,
  ShieldCheck,
  Stack,
  Waveform,
} from "@phosphor-icons/react";
import VoiceOrb, { type OrbMeter } from "@/components/VoiceOrb";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import InfoTip from "@/components/InfoTip";
import SiteNav, { Byline, SiteFooter } from "@/components/SiteNav";
import OpenfileBanner from "@/components/OpenfileBanner";
import {
  ORB_LAB,
  ORB_LINK_EXAMPLE,
  ORB_PALETTES,
  ORB_PARAM_DEFAULTS,
  ORB_PARAM_GROUPS,
  ORB_PARAM_RANGES,
  ORB_REPO,
  ORB_SAMPLE,
  ORB_STATES,
  ORB_VARIANTS,
  type OrbParams,
  type OrbSourceId,
  type OrbState,
  type OrbVariant,
} from "@/data/orb";
import {
  AnalyserLevels,
  SimulatedVoice,
  analyserForElement,
  openMicrophone,
  openTabAudio,
  type LevelSource,
} from "@/lib/orb/audio";
import { cssColor, resolveColor } from "@/lib/orb/renderer";
import { prefersReducedMotion } from "@/lib/motion";
import { LinkError, fetchAudioLink, parseAudioLink, type AudioLink } from "./audio-link";
import Segmented from "./segmented";
import VoicePanel, { type LinkStatus } from "./voice-panel";
import { YT_ENDED, YT_PAUSED, YT_PLAYING, type YouTubeControls } from "./youtube-player";
import styles from "./page.module.css";

type Ground = "light" | "dark";
type Clip = { src: string; title: string };
const C = ORB_LAB.controls;
const P = ORB_LAB.preview;
const U = ORB_LAB.use;

/** The engine notes' icons, by the names the data gives them. */
const NOTE_ICONS = { stack: Stack, palette: Palette, waveform: Waveform, phone: Phone, shield: ShieldCheck };

/* The inside tiles: each turns layers off to show one more than the last. */
const QUIET: Partial<OrbParams> = { grain: 0, pulse: 0, highlight: 0, fluid: 0 };
const INSIDE_PARAMS: Record<string, Partial<OrbParams>> = {
  field: { ...QUIET, sphere: 0, warp: 0, speed: 0 },
  sphere: { ...QUIET, sphere: 0.85, warp: 0, speed: 0 },
  drift: { ...QUIET, sphere: 0.85, warp: 0.8, speed: 1 },
  voice: {},
};

/**
 * A section's head: its number and name small above the title on the left,
 * the intro and any actions on the right.
 */
function SectionHead({
  number,
  kicker,
  title,
  intro,
  children,
}: {
  number: string;
  kicker: string;
  title: string;
  intro: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.boardHead}>
      <div className={styles.boardLead}>
        <p className={styles.kicker}>
          <span className={styles.kickerNumber}>{number}</span>
          {kicker}
        </p>
        <h2 className={styles.boardTitle}>{title}</h2>
      </div>
      <div className={styles.boardAside}>
        <p className={styles.boardIntro}>{intro}</p>
        {children}
      </div>
    </div>
  );
}

/** A block of code with a copy button. */
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard blocked: the code is still there to select. */
    }
  };
  return (
    <div className={styles.code}>
      <pre>
        <code>{code}</code>
      </pre>
      <button type="button" className={styles.codeCopy} onClick={copy} aria-label={copied ? U.copied : U.copy}>
        {copied ? <Check weight="bold" /> : <Copy weight="bold" />}
      </button>
    </div>
  );
}

const toHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;

/**
 * /: the voice orb.
 *
 * A stage with a carousel of palettes and a voice to play through them (a
 * sample speech, your file, a link or your microphone); the controls for
 * type, state and ground; sliders for the look, with live meters and a copy
 * button; how the orb is built, layer by layer; boards of every state, type
 * and palette; how to use it; and notes on the engine.
 */
export default function VoiceOrbPage() {
  const [index, setIndex] = useState(0);
  const [variant, setVariant] = useState<OrbVariant>("painted");
  const [state, setState] = useState<OrbState>("ready");
  const [source, setSource] = useState<OrbSourceId>("sample");
  const [ground, setGround] = useState<Ground>("light");
  const [params, setParams] = useState<OrbParams>(ORB_PARAM_DEFAULTS);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState<LevelSource | null>(null);
  const [caller, setCaller] = useState<LevelSource | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [swatches, setSwatches] = useState<Record<string, string[]>>({});
  // Your file, as an object URL, and whether the browser could play it.
  const [file, setFile] = useState<Clip | null>(null);
  const [fileError, setFileError] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The link: what is typed, and what was loaded (the example to begin with).
  const [linkText, setLinkText] = useState("");
  const [link, setLink] = useState<AudioLink | null>(() => parseAudioLink(ORB_LINK_EXAMPLE.url));
  const [linkTitle, setLinkTitle] = useState<string | null>(ORB_LINK_EXAMPLE.name);
  const [linkClip, setLinkClip] = useState<Clip | null>(null);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("idle");
  const [tabHeard, setTabHeard] = useState<boolean | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const youtube = useRef<YouTubeControls | null>(null);
  const micStop = useRef<(() => void) | null>(null);
  const tabStop = useRef<(() => void) | null>(null);
  // A file just chosen plays as soon as its element is in.
  const playNext = useRef(false);
  const meterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const palette = ORB_PALETTES[index];
  const count = ORB_PALETTES.length;
  const prev = ORB_PALETTES[(index - 1 + count) % count];
  const next = ORB_PALETTES[(index + 1) % count];

  // What the <audio> element plays, if anything, and the YouTube link if that
  // is the source instead.
  const clip: Clip | null =
    source === "sample" ? ORB_SAMPLE : source === "file" ? file : source === "link" && link?.kind === "audio" ? linkClip : null;
  const video = source === "link" && link?.kind === "youtube" ? link : null;
  const active = source === "microphone" ? micOn : clip || video ? playing : state === "talking";

  useEffect(() => {
    setReduced(prefersReducedMotion());
    // Tokens resolve only once the stylesheet is in, so the swatches' hex
    // values are read after mount.
    setSwatches(
      Object.fromEntries(ORB_PALETTES.map((p) => [p.id, p.stops.map((s) => toHex(resolveColor(s)))])),
    );
  }, []);

  /* ---------- voice sources ---------- */

  const stopMic = useCallback(() => {
    micStop.current?.();
    micStop.current = null;
    setMicOn(false);
  }, []);

  const stopTab = useCallback(() => {
    tabStop.current?.();
    tabStop.current = null;
    setTabHeard(null);
  }, []);

  const pauseAll = useCallback(() => {
    audioRef.current?.pause();
    youtube.current?.pause();
    setPlaying(false);
  }, []);

  // Until something real plays, a simulated voice speaks for the agent and
  // another for the caller, so every state has something to show. Play swaps
  // in the real one; the microphone replaces the caller.
  useEffect(() => {
    setVoice(new SimulatedVoice(1));
    setCaller(source === "microphone" ? null : new SimulatedVoice(11, 0.85));
  }, [source, clip?.src, video?.id]);

  // Leaving a source releases it and settles the orb.
  useEffect(() => {
    pauseAll();
    setState((current) => (current === "talking" || current === "listening" ? "ready" : current));
    if (source !== "microphone") stopMic();
    if (source !== "link") stopTab();
  }, [source, pauseAll, stopMic, stopTab]);

  useEffect(
    () => () => {
      stopMic();
      stopTab();
    },
    [stopMic, stopTab],
  );

  // A replaced file or link frees its object URL.
  useEffect(() => (file ? () => URL.revokeObjectURL(file.src) : undefined), [file]);
  useEffect(() => (linkClip ? () => URL.revokeObjectURL(linkClip.src) : undefined), [linkClip]);

  const startClip = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setVoice(new AnalyserLevels(analyserForElement(audio)));
    try {
      await audio.play();
    } catch {
      /* Blocked until a press, or unplayable (onError says so). */
    }
  }, []);

  // A file just chosen or dropped starts once its element has mounted.
  useEffect(() => {
    if (!playNext.current || !file) return;
    playNext.current = false;
    void startClip();
  }, [file, startClip]);

  const takeFile = (chosen: File) => {
    pauseAll();
    setSource("file");
    setFileError(false);
    setFile({ src: URL.createObjectURL(chosen), title: chosen.name });
    playNext.current = true;
  };

  const loadLink = async () => {
    const text = linkText.trim() || ORB_LINK_EXAMPLE.url;
    const parsed = parseAudioLink(text);
    pauseAll();
    stopTab();
    if (!parsed) {
      setLinkStatus("invalid");
      return;
    }
    if (parsed.kind === "youtube") {
      setLink(parsed);
      setLinkClip(null);
      setLinkTitle(text === ORB_LINK_EXAMPLE.url ? ORB_LINK_EXAMPLE.name : "YouTube video");
      setLinkStatus("idle");
      return;
    }
    setLinkStatus("loading");
    try {
      const loaded = await fetchAudioLink(parsed.url);
      setLink(parsed);
      setLinkClip(loaded);
      setLinkTitle(loaded.title);
      setLinkStatus("idle");
    } catch (error) {
      setLinkStatus(error instanceof LinkError ? error.reason : "blocked");
    }
  };

  const toggleMic = async () => {
    if (micOn) {
      stopMic();
      setState("ready");
      return;
    }
    try {
      const mic = await openMicrophone();
      micStop.current = mic.stop;
      setCaller(new AnalyserLevels(mic.analyser));
      setMicOn(true);
      setMicDenied(false);
      setState("listening");
    } catch {
      setMicDenied(true);
    }
  };

  // YouTube: on the first Play, ask to hear this tab (the only way a page can
  // hear another site's player); if that isn't possible, simulate the voice.
  const toggleVideo = async () => {
    const player = youtube.current;
    if (!player) return;
    if (playing) {
      player.pause();
      return;
    }
    if (!tabStop.current) {
      try {
        const tab = await openTabAudio(() => {
          tabStop.current = null;
          setTabHeard(false);
          setVoice(new SimulatedVoice(1));
        });
        tabStop.current = tab.stop;
        setVoice(new AnalyserLevels(tab.analyser));
        setTabHeard(true);
      } catch {
        setVoice(new SimulatedVoice(1));
        setTabHeard(false);
      }
    }
    player.play();
  };

  const onVideoState = useCallback((ytState: number) => {
    if (ytState === YT_PLAYING) {
      setPlaying(true);
      setState("talking");
    } else if (ytState === YT_PAUSED) {
      setPlaying(false);
      setState((current) => (current === "talking" ? "ready" : current));
    } else if (ytState === YT_ENDED) {
      setPlaying(false);
      setState("settled");
    }
  }, []);

  const togglePlay = async () => {
    if (source === "microphone") return toggleMic();
    if (video) return toggleVideo();
    const audio = audioRef.current;
    if (clip && audio) {
      if (!audio.paused) audio.pause();
      else await startClip();
      return;
    }
    // Nothing to play yet: the simulated voice talks.
    setState((current) => (current === "talking" ? "ready" : "talking"));
  };

  const choosePalette = (to: number) => {
    setIndex(((to % count) + count) % count);
  };

  /* ---------- meters and settings ---------- */

  const onFrame = useCallback((m: OrbMeter) => {
    const values = [...m.bands, m.input];
    values.forEach((v, i) => {
      const level = Math.min(1, v);
      const el = meterRefs.current[i];
      if (el) el.style.transform = `scaleX(${level.toFixed(3)})`;
      const value = valueRefs.current[i];
      if (value) value.textContent = level.toFixed(2);
    });
  }, []);

  const copySettings = async () => {
    const settings = { palette: palette.id, variant, state, params };
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard blocked: nothing to copy to. */
    }
  };

  // One simulated voice and caller per state card, type card and inside
  // tile, made once, so each speaks its own way and keeps doing so.
  const stateVoices = useMemo(() => ORB_STATES.map((_, i) => new SimulatedVoice(21 + i)), []);
  const stateCallers = useMemo(() => ORB_STATES.map((_, i) => new SimulatedVoice(41 + i, 0.85)), []);
  const typeVoices = useMemo(() => ORB_VARIANTS.map((_, i) => new SimulatedVoice(61 + i)), []);
  const insideVoice = useMemo(() => new SimulatedVoice(81), []);

  // The tuning preview mirrors the stage with its own readers of the same
  // voices (a source read by two orbs would run at double speed).
  const previewVoice = useMemo(() => voice?.twin?.() ?? null, [voice]);
  const previewCaller = useMemo(() => caller?.twin?.() ?? null, [caller]);

  return (
    <main className={`${styles.page} ${ground === "dark" ? styles.dark : ""}`}>
      <SiteNav />

      <header className={styles.head}>
        <Badge dot>{ORB_LAB.badge}</Badge>
        <h1 className={styles.title}>{ORB_LAB.title}</h1>
        <p className={styles.intro}>{ORB_LAB.intro}</p>
        <div className={styles.headActions}>
          <Button href={ORB_REPO.url} external surface={ground} icon={<GithubLogo weight="fill" />} arrow>
            {ORB_LAB.getCode}
          </Button>
          <Button href="#inside" variant="secondary" surface={ground}>
            {ORB_LAB.howLink}
          </Button>
        </div>
        <Byline className={styles.byline} />
        {reduced && <p className={styles.notice}>{ORB_LAB.reducedMotion}</p>}
      </header>

      {/* ---------- the stage ---------- */}
      <section
        className={styles.panel}
        aria-label={`${palette.name} orb`}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files[0];
          if (dropped) takeFile(dropped);
        }}
      >
        <div className={`${styles.stage} ${dragging ? styles.stageDrop : ""}`}>
          {dragging && (
            <div className={styles.dropOverlay} aria-hidden="true">
              {ORB_LAB.voice.file.dropHere}
            </div>
          )}
          <div className={styles.stageShow}>
            <div className={styles.carousel}>
              <button
                type="button"
                className={styles.side}
                onClick={() => choosePalette(index - 1)}
                aria-label={`${C.show} ${prev.name}`}
              >
                <VoiceOrb palette={prev.id} variant={variant} state="ready" params={params} size="150px" />
              </button>

              <div className={styles.centre}>
                {/* Zooms in a little while talking: the first beat of Play.
                    A click anywhere on the orb plays too. */}
                <div
                  className={`${styles.zoom} ${state === "talking" ? styles.zoomed : ""}`}
                  onClick={togglePlay}
                >
                  <VoiceOrb
                    palette={palette.id}
                    variant={variant}
                    state={state}
                    voice={voice}
                    caller={caller}
                    params={params}
                    // Shrinks with a phone's width rather than overflowing it.
                    size="min(320px, 70vw)"
                    label={`${palette.name} orb, ${state}`}
                  />
                </div>
                <button
                  type="button"
                  className={`${styles.play} ${active ? styles.playActive : ""}`}
                  onClick={togglePlay}
                  aria-label={
                    source === "microphone"
                      ? micOn
                        ? ORB_LAB.voice.microphone.off
                        : ORB_LAB.voice.microphone.on
                      : active
                        ? C.pause
                        : C.play
                  }
                >
                  {source === "microphone" ? (
                    micOn ? (
                      <MicrophoneSlash size={22} weight="fill" />
                    ) : (
                      <Microphone size={22} weight="fill" />
                    )
                  ) : active ? (
                    <Pause size={22} weight="fill" />
                  ) : (
                    <Play size={22} weight="fill" />
                  )}
                </button>
              </div>

              <button
                type="button"
                className={styles.side}
                onClick={() => choosePalette(index + 1)}
                aria-label={`${C.show} ${next.name}`}
              >
                <VoiceOrb palette={next.id} variant={variant} state="ready" params={params} size="150px" />
              </button>
            </div>

            <div className={styles.caption}>
              <button type="button" className={styles.arrow} onClick={() => choosePalette(index - 1)} aria-label={C.previous}>
                <CaretLeft size={16} weight="bold" />
              </button>
              <div className={styles.captionText}>
                <b className={styles.captionName}>{palette.name}</b>
                <span className={styles.captionScenario}>{palette.scenario}</span>
              </div>
              <button type="button" className={styles.arrow} onClick={() => choosePalette(index + 1)} aria-label={C.next}>
                <CaretRight size={16} weight="bold" />
              </button>
            </div>
          </div>

          <VoicePanel
            source={source}
            onSource={setSource}
            surface={ground}
            active={active}
            onPlay={togglePlay}
            file={file}
            fileError={fileError}
            onFile={takeFile}
            link={link}
            linkTitle={linkTitle}
            linkText={linkText}
            onLinkText={(text) => {
              setLinkText(text);
              if (linkStatus !== "loading") setLinkStatus("idle");
            }}
            onLoadLink={loadLink}
            linkStatus={linkStatus}
            tabHeard={tabHeard}
            youtube={youtube}
            onYouTubeState={onVideoState}
            micOn={micOn}
            micDenied={micDenied}
          />

          <div className={styles.controls}>
            <Segmented label={C.type} options={ORB_VARIANTS} value={variant} onChange={setVariant} />
            <Segmented
              label={C.ground}
              options={[
                { id: "light" as Ground, name: C.light },
                { id: "dark" as Ground, name: C.dark },
              ]}
              value={ground}
              onChange={setGround}
            />
            <div className={styles.controlWide}>
              <Segmented label={C.state} options={ORB_STATES} value={state} onChange={setState} />
            </div>
          </div>

          {clip && (
            <audio
              // A new file means a new element: an element connects to Web
              // Audio once, and the analyser follows the element.
              key={clip.src}
              ref={audioRef}
              src={clip.src}
              preload="none"
              onPlay={() => {
                setPlaying(true);
                setState("talking");
              }}
              onPause={() => {
                setPlaying(false);
                setState((current) => (current === "talking" ? "ready" : current));
              }}
              onEnded={() => {
                setPlaying(false);
                setState("settled");
              }}
              onError={() => {
                if (source === "file") setFileError(true);
              }}
            />
          )}
        </div>
      </section>

      {/* ---------- tuning ---------- */}
      <section className={styles.panel}>
        <SectionHead
          number="01"
          kicker={ORB_LAB.sections.tune.kicker}
          title={ORB_LAB.sections.tune.title}
          intro={ORB_LAB.sections.tune.intro}
        >
          <div className={styles.boardActions}>
            <Button
              variant="secondary"
              surface={ground}
              size="sm"
              icon={<ArrowCounterClockwise weight="bold" />}
              onClick={() => setParams(ORB_PARAM_DEFAULTS)}
            >
              {C.reset}
            </Button>
            <Button
              variant="secondary"
              surface={ground}
              size="sm"
              icon={copied ? <Check weight="bold" /> : <Copy weight="bold" />}
              onClick={copySettings}
            >
              {copied ? C.copied : C.copy}
            </Button>
          </div>
        </SectionHead>

        <div className={styles.tune}>
          <div className={styles.sliders}>
            {ORB_PARAM_GROUPS.map((group) => (
              <div
                key={group.id}
                className={styles.group}
                role="group"
                aria-labelledby={`group-${group.id}`}
              >
                <div>
                  <h3 id={`group-${group.id}`} className={styles.groupName}>
                    {group.name}
                  </h3>
                  <p className={styles.groupBody}>{group.body}</p>
                </div>
                <div className={styles.groupSliders}>
                  {ORB_PARAM_RANGES.filter((range) => range.group === group.id).map((range) => (
                    <div key={range.key} className={styles.slider}>
                      <div className={styles.sliderHead}>
                        <label htmlFor={`param-${range.key}`}>{range.name}</label>
                        <InfoTip label={range.name}>{range.hint}</InfoTip>
                        <output htmlFor={`param-${range.key}`}>{params[range.key].toFixed(2)}</output>
                      </div>
                      <input
                        id={`param-${range.key}`}
                        type="range"
                        min={range.min}
                        max={range.max}
                        step={range.step}
                        value={params[range.key]}
                        onChange={(event) =>
                          setParams((current) => ({ ...current, [range.key]: Number(event.target.value) }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside className={styles.preview} aria-label={P.title}>
            <div className={styles.previewHead}>
              <div>
                <p className={styles.previewTitle}>{P.title}</p>
                <p className={styles.previewBody}>{P.body}</p>
              </div>
              <Button
                variant="secondary"
                surface={ground}
                size="sm"
                icon={
                  source === "microphone" ? (
                    micOn ? <MicrophoneSlash weight="bold" /> : <Microphone weight="bold" />
                  ) : active ? (
                    <Pause weight="fill" />
                  ) : (
                    <Play weight="fill" />
                  )
                }
                onClick={togglePlay}
              >
                {source === "microphone"
                  ? micOn
                    ? ORB_LAB.voice.microphone.off
                    : ORB_LAB.voice.microphone.on
                  : active
                    ? C.pause
                    : C.play}
              </Button>
            </div>
            <div className={styles.previewOrb}>
              <VoiceOrb
                palette={palette.id}
                variant={variant}
                state={state}
                voice={previewVoice}
                caller={previewCaller}
                params={params}
                size="176px"
                onFrame={onFrame}
              />
            </div>
            <div className={styles.levels}>
              <p className={styles.levelsHead}>
                {P.levels}
                <InfoTip label={P.levels}>{P.levelsHint}</InfoTip>
              </p>
              <div className={styles.meters}>
                {ORB_LAB.meters.map((meter, i) => (
                  <div key={meter.name} className={styles.meter}>
                    <span className={styles.meterName}>
                      {meter.name}
                      <InfoTip label={meter.name}>{meter.hint}</InfoTip>
                    </span>
                    <span className={styles.meterTrack} aria-hidden="true">
                      <span
                        ref={(el) => {
                          meterRefs.current[i] = el;
                        }}
                        className={`${styles.meterFill} ${i === 4 ? styles.meterCaller : ""}`}
                      />
                    </span>
                    <span
                      className={styles.meterValue}
                      aria-hidden="true"
                      ref={(el) => {
                        valueRefs.current[i] = el;
                      }}
                    >
                      0.00
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* ---------- inside the orb ---------- */}
      <section className={styles.panel} id="inside">
        <SectionHead
          number="02"
          kicker={ORB_LAB.sections.inside.kicker}
          title={ORB_LAB.sections.inside.title}
          intro={ORB_LAB.sections.inside.intro}
        />
        <ol className={`${styles.grid} ${styles.grid4} ${styles.steps}`}>
          {ORB_LAB.inside.map((step, i) => (
            <li key={step.id} className={styles.card}>
              <div className={styles.cardMedia}>
                <span className={styles.stepNumber}>{i + 1}</span>
                <VoiceOrb
                  palette={palette.id}
                  variant={variant}
                  state={step.id === "voice" ? "talking" : "ready"}
                  voice={step.id === "voice" ? insideVoice : null}
                  params={{ ...params, ...INSIDE_PARAMS[step.id] }}
                  size="150px"
                />
              </div>
              <h3 className={styles.cardTitle}>{step.name}</h3>
              <p className={styles.cardBody}>{step.body}</p>
            </li>
          ))}
        </ol>

        <div className={styles.pipeline}>
          <h3 className={styles.groupName}>{ORB_LAB.pipeline.title}</h3>
          <ol className={styles.pipelineSteps}>
            {ORB_LAB.pipeline.steps.map((step) => (
              <li key={step.name} className={styles.pipelineStep}>
                <b>{step.name}</b>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- states ---------- */}
      <section className={styles.panel}>
        <SectionHead
          number="03"
          kicker={ORB_LAB.sections.states.kicker}
          title={ORB_LAB.sections.states.title}
          intro={ORB_LAB.sections.states.intro}
        />
        <div className={`${styles.grid} ${styles.grid3}`}>
          {ORB_STATES.map((s, i) => (
            <article key={s.id} className={styles.card}>
              <div className={styles.cardMedia}>
                <VoiceOrb
                  palette={palette.id}
                  variant={variant}
                  state={s.id}
                  voice={stateVoices[i]}
                  caller={stateCallers[i]}
                  params={params}
                  size="160px"
                />
              </div>
              <h3 className={styles.cardTitle}>{s.name}</h3>
              <dl className={styles.facts}>
                <div>
                  <dt>{C.when}</dt>
                  <dd>{s.when}</dd>
                </div>
                <div>
                  <dt>{C.drives}</dt>
                  <dd>{s.drives}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- types ---------- */}
      <section className={styles.panel}>
        <SectionHead
          number="04"
          kicker={ORB_LAB.sections.types.kicker}
          title={ORB_LAB.sections.types.title}
          intro={ORB_LAB.sections.types.intro}
        />
        <div className={`${styles.grid} ${styles.grid4}`}>
          {ORB_VARIANTS.map((v, i) => (
            <article
              key={v.id}
              className={`${styles.card} ${v.id === variant ? styles.cardActive : ""}`}
            >
              <div className={styles.cardMedia}>
                <button
                  type="button"
                  className={styles.cardPick}
                  onClick={() => setVariant(v.id)}
                  aria-pressed={v.id === variant}
                  aria-label={`${C.type}: ${v.name}`}
                >
                  <VoiceOrb
                    palette={palette.id}
                    variant={v.id}
                    state="talking"
                    voice={typeVoices[i]}
                    params={params}
                    size="160px"
                  />
                </button>
              </div>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.cardTitle}>{v.name}</h3>
                {v.id === variant && <span className={styles.chosen}>{C.chosen}</span>}
              </div>
              <p className={styles.cardBody}>{v.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- palettes ---------- */}
      <section className={styles.panel}>
        <SectionHead
          number="05"
          kicker={ORB_LAB.sections.palettes.kicker}
          title={ORB_LAB.sections.palettes.title}
          intro={ORB_LAB.sections.palettes.intro}
        />
        <div className={`${styles.grid} ${styles.grid5}`}>
          {ORB_PALETTES.map((p, i) => (
            <article
              key={p.id}
              className={`${styles.card} ${i === index ? styles.cardActive : ""}`}
            >
              <div className={styles.cardMedia}>
                <button
                  type="button"
                  className={styles.cardPick}
                  onClick={() => choosePalette(i)}
                  aria-pressed={i === index}
                  aria-label={`${C.show} ${p.name}`}
                >
                  <VoiceOrb palette={p.id} variant={variant} state="ready" params={params} size="128px" />
                </button>
              </div>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.cardTitle}>{p.name}</h3>
                {i === index && <span className={styles.chosen}>{C.chosen}</span>}
              </div>
              <ul className={styles.swatches}>
                {p.stops.map((stop, s) => (
                  <li key={s}>
                    <span className={styles.swatch} style={{ background: cssColor(stop) }} />
                    <code>{stop.startsWith("--") ? swatches[p.id]?.[s] ?? stop : stop}</code>
                  </li>
                ))}
              </ul>
              <p className={styles.cardBody}>{p.note}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- use it ---------- */}
      <section className={styles.panel} id="use">
        <SectionHead
          number="06"
          kicker={ORB_LAB.sections.use.kicker}
          title={ORB_LAB.sections.use.title}
          intro={ORB_LAB.sections.use.intro}
        >
          <div className={styles.boardActions}>
            <Button href={ORB_REPO.url} external variant="secondary" surface={ground} size="sm" icon={<GithubLogo weight="fill" />}>
              {ORB_LAB.getCode}
            </Button>
          </div>
        </SectionHead>

        <ol className={styles.ways}>
          {U.ways.map((way, i) => (
            <li key={way.id} className={`${styles.card} ${styles.way}`}>
              <div>
                <div className={styles.wayHead}>
                  <span className={styles.stepNumber}>{i + 1}</span>
                  <h3 className={styles.cardTitle}>{way.name}</h3>
                </div>
                <p className={styles.cardBody}>{way.body}</p>
              </div>
              <CodeBlock code={way.code} />
            </li>
          ))}
        </ol>

        <div className={styles.reference}>
          <div>
            <h3 className={styles.groupName}>{U.propsTitle}</h3>
            <dl className={styles.props}>
              {U.props.map((prop) => (
                <div key={prop.name}>
                  <dt>
                    <code>{prop.name}</code>
                    <span>{prop.type}</span>
                  </dt>
                  <dd>{prop.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className={styles.groupName}>{U.filesTitle}</h3>
            <ul className={styles.files}>
              {U.files.map((f) => (
                <li key={f.path}>
                  <a href={`${ORB_REPO.url}/blob/main/${f.path}`} target="_blank" rel="noreferrer">
                    <code>{f.path}</code>
                    <ArrowUpRight weight="bold" aria-hidden="true" />
                  </a>
                  <span>{f.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- engine notes ---------- */}
      <section className={styles.panel} id="how">
        <SectionHead
          number="07"
          kicker={ORB_LAB.sections.how.kicker}
          title={ORB_LAB.sections.how.title}
          intro={ORB_LAB.sections.how.intro}
        />
        <div className={`${styles.grid} ${styles.grid3}`}>
          {ORB_LAB.howItWorks.map((item) => {
            const Icon = NOTE_ICONS[item.icon as keyof typeof NOTE_ICONS];
            return (
              <article key={item.title} className={`${styles.card} ${styles.note}`}>
                <span className={styles.noteIcon} aria-hidden="true">
                  <Icon weight="regular" />
                </span>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardBody}>{item.body}</p>
              </article>
            );
          })}
          <a
            href={ORB_LAB.more.href}
            target="_blank"
            rel="noreferrer"
            className={`${styles.card} ${styles.note} ${styles.cardActive} ${styles.noteLink}`}
          >
            <div>
              <span className={styles.noteIcon} aria-hidden="true">
                <BookOpen weight="regular" />
              </span>
              <h3 className={styles.cardTitle}>{ORB_LAB.more.title}</h3>
              <p className={styles.cardBody}>{ORB_LAB.more.body}</p>
            </div>
            <span className={styles.noteMore}>
              {ORB_LAB.more.link}
              <ArrowRight weight="bold" aria-hidden="true" />
            </span>
          </a>
        </div>
      </section>

      {/* ---------- also by UV: last, so it never stands between a reader and the orb ---------- */}
      <section className={`${styles.panel} ${styles.panelSlim}`} aria-label={ORB_LAB.openfile.label}>
        <OpenfileBanner />
      </section>

      <SiteFooter />
    </main>
  );
}
