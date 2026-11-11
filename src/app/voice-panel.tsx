/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

"use client";

import { useRef } from "react";
import {
  FileAudio,
  LinkSimple,
  Microphone,
  MicrophoneSlash,
  MusicNotesSimple,
  Pause,
  Play,
  UploadSimple,
} from "@phosphor-icons/react";
import Button from "@/components/Button";
import { ORB_LAB, ORB_LINK_EXAMPLE, ORB_SAMPLE, ORB_SOURCES, type OrbSourceId } from "@/data/orb";
import type { AudioLink } from "./audio-link";
import YouTubePlayer, { type YouTubeControls } from "./youtube-player";
import styles from "./page.module.css";

const V = ORB_LAB.voice;

/** The formats the file picker offers; anything else the browser plays still works by drop. */
const ACCEPT = "audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.aif,.aiff,.caf";

export type LinkStatus = "idle" | "loading" | "invalid" | "blocked";

/**
 * The voice panel under the orb: where its sound comes from, and what is
 * playing. Four sources, each with one obvious action:
 *
 *   Sample      a minute on how the orb works, ready on the first click
 *   Your file   drop or choose any audio file; it stays on the device
 *   Link        a YouTube link (its own player, heard through a tab share)
 *               or a direct audio link
 *   Microphone  the orb listens to you
 *
 * State lives in the page, which also owns the stage's Play button and the
 * <audio> element; this only draws it.
 */
export default function VoicePanel(props: {
  source: OrbSourceId;
  onSource: (source: OrbSourceId) => void;
  surface: "light" | "dark";
  /** Whether the stage is playing (or listening, for the microphone). */
  active: boolean;
  onPlay: () => void;
  file: { title: string } | null;
  fileError: boolean;
  onFile: (file: File) => void;
  link: AudioLink | null;
  linkTitle: string | null;
  linkText: string;
  onLinkText: (text: string) => void;
  onLoadLink: () => void;
  linkStatus: LinkStatus;
  /** Whether the orb hears the YouTube tab: null before the first Play. */
  tabHeard: boolean | null;
  youtube: React.RefObject<YouTubeControls | null>;
  onYouTubeState: (state: number) => void;
  micOn: boolean;
  micDenied: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { source, surface, active } = props;

  const playButton = (
    <Button
      variant="primary"
      surface={surface}
      size="sm"
      icon={active ? <Pause weight="fill" /> : <Play weight="fill" />}
      onClick={props.onPlay}
    >
      {active ? ORB_LAB.controls.pause : ORB_LAB.controls.play}
    </Button>
  );

  const track = (title: string, by: React.ReactNode, icon: React.ReactNode) => (
    <div className={styles.track}>
      <span className={styles.trackIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.trackText}>
        <b className={styles.trackTitle}>{title}</b>
        {by && <span className={styles.trackBy}>{by}</span>}
      </div>
      {playButton}
    </div>
  );

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={(event) => {
        const chosen = event.target.files?.[0];
        event.target.value = "";
        if (chosen) props.onFile(chosen);
      }}
    />
  );

  return (
    <div className={styles.voice}>
      <div className={styles.voiceHead}>
        <span className={styles.controlLabel}>{V.label}</span>
        <div className={styles.segmented} role="group" aria-label={V.label}>
          {ORB_SOURCES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={styles.segment}
              aria-pressed={option.id === source}
              onClick={() => props.onSource(option.id)}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.voiceBody} aria-live="polite">
        {source === "sample" && (
          <>
            {track(ORB_SAMPLE.title, null, <MusicNotesSimple weight="regular" />)}
            <p className={styles.voiceNote}>{V.sample.body}</p>
          </>
        )}

        {source === "file" &&
          (props.file ? (
            <>
              {track(
                props.file.title,
                <button type="button" className={styles.textButton} onClick={() => fileRef.current?.click()}>
                  {V.file.change}
                </button>,
                <FileAudio weight="regular" />,
              )}
              {props.fileError && <p className={styles.voiceError}>{V.file.unplayable}</p>}
              {fileInput}
            </>
          ) : (
            <div className={styles.drop}>
              <span className={styles.trackIcon} aria-hidden="true">
                <UploadSimple weight="regular" />
              </span>
              <p className={styles.dropTitle}>
                {V.file.drop} <span>{V.file.or}</span>
              </p>
              <Button variant="secondary" surface={surface} size="sm" onClick={() => fileRef.current?.click()}>
                {V.file.choose}
              </Button>
              <p className={styles.voiceNote}>{V.file.formats}</p>
              {fileInput}
            </div>
          ))}

        {source === "link" && (
          <>
            <form
              className={styles.linkForm}
              // Our own message says what is wrong with a link, not the browser's.
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                props.onLoadLink();
              }}
            >
              <label className={styles.linkLabel} htmlFor="voice-link">
                {V.link.label}
              </label>
              <div className={styles.linkRow}>
                <span className={styles.linkIcon} aria-hidden="true">
                  <LinkSimple weight="bold" />
                </span>
                <input
                  id="voice-link"
                  className={styles.linkInput}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={ORB_LINK_EXAMPLE.url}
                  value={props.linkText}
                  onChange={(event) => props.onLinkText(event.target.value)}
                  aria-describedby="voice-link-help"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  surface={surface}
                  size="sm"
                  loading={props.linkStatus === "loading"}
                >
                  {V.link.load}
                </Button>
              </div>
              <p id="voice-link-help" className={props.linkStatus === "invalid" || props.linkStatus === "blocked" ? styles.voiceError : styles.voiceNote}>
                {props.linkStatus === "invalid"
                  ? V.link.invalid
                  : props.linkStatus === "blocked"
                    ? V.link.blocked
                    : `${V.link.help} ${ORB_LINK_EXAMPLE.name}.`}
              </p>
            </form>

            {props.link?.kind === "youtube" && (
              <div className={styles.youtube}>
                <YouTubePlayer
                  id={props.link.id}
                  start={props.link.start}
                  controls={props.youtube}
                  onState={props.onYouTubeState}
                  className={styles.youtubeFrame}
                />
                <div className={styles.youtubeSide}>
                  {track(props.linkTitle ?? "YouTube", "YouTube", <LinkSimple weight="regular" />)}
                  <p className={props.tabHeard === false ? styles.voiceError : styles.voiceNote}>
                    {props.tabHeard === null ? V.link.youtube : props.tabHeard ? V.link.youtubeLive : V.link.youtubeSimulated}
                  </p>
                </div>
              </div>
            )}
            {props.link?.kind === "audio" && props.linkTitle && track(props.linkTitle, V.link.label, <LinkSimple weight="regular" />)}
          </>
        )}

        {source === "microphone" && (
          <div className={styles.track}>
            <span className={styles.trackIcon} aria-hidden="true">
              <Microphone weight="regular" />
            </span>
            <div className={styles.trackText}>
              <b className={styles.trackTitle}>{props.micOn ? V.microphone.live : ORB_SOURCES[3].name}</b>
              <span className={props.micDenied ? styles.voiceErrorInline : styles.trackBy}>
                {props.micDenied ? V.microphone.denied : V.microphone.body}
              </span>
            </div>
            <Button
              variant="primary"
              surface={surface}
              size="sm"
              icon={props.micOn ? <MicrophoneSlash weight="bold" /> : <Microphone weight="bold" />}
              onClick={props.onPlay}
            >
              {props.micOn ? V.microphone.off : V.microphone.on}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
