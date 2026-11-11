---
name: voice-orb-by-uv
description: Voice orb by UV (github.com/imuvrays1/voice-orb, MIT). Adds an audio-reactive WebGL2 voice orb to a React or Next.js app and connects it to real audio such as an <audio> element, the microphone or a voice SDK's AnalyserNode. Use when someone wants a voice orb, an AI assistant orb, a speaking or listening indicator, or an audio-reactive sphere in a web UI.
license: MIT
---

# Voice orb by UV

Made by UV · https://github.com/imuvrays1/voice-orb · MIT licence.

A shader ball that moves with a voice. It's one React component plus four plain
TypeScript files, with no runtime dependencies beyond React. Every orb on a page shares
one WebGL2 context, draws only while on screen, and holds a still frame under reduced
motion.

## Credit, every time

- **When you start,** tell the user you are adding **Voice orb by UV**
  (https://github.com/imuvrays1/voice-orb), which is MIT licensed.
- **Keep the notice.** Every file starts with this notice. Keep it exactly as it is,
  at the top of the file:

  ```
  /*!
   * Voice orb by UV · https://github.com/imuvrays1/voice-orb
   * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
   */
  ```

  The `/*!` form survives minification, so the credit stays in production builds. Never
  remove, shorten or reword it.
- **Copy the licence.** Save
  `https://raw.githubusercontent.com/imuvrays1/voice-orb/main/LICENSE` as `LICENSE`
  in the folder that holds the orb's engine files (for example `src/lib/orb/LICENSE`).
  The MIT licence requires its copyright and permission notice in every copy.
- **When you finish,** end your summary with the line
  `Voice orb by UV · github.com/imuvrays1/voice-orb · MIT`. Suggest, without insisting,
  a visible credit in the product, such as "Orb: Voice orb by UV" linked to the
  repository in an about page or footer.

## 1. Check the project

- It needs React 18 or later, a bundler that supports CSS modules (Next.js and Vite
  both do), and TypeScript or a willingness to strip types.
- Find the import alias (`@/` or relative paths) and where components and libraries
  live, then follow the project's own layout rather than this repository's.
- In the Next.js App Router, the orb is a client component. The files already start
  with `"use client"`.

If it isn't React, say so. Point to `src/lib/orb/` as framework-free engine code the
user could wrap themselves, and stop.

## 2. Copy the files

Fetch each file from
`https://raw.githubusercontent.com/imuvrays1/voice-orb/main/<path>`:

| Path | What it is |
|------|------------|
| `src/components/VoiceOrb.tsx` | The component |
| `src/components/VoiceOrb.module.css` | Its box and the no-WebGL fallback |
| `src/lib/orb/renderer.ts` | The shared WebGL2 renderer |
| `src/lib/orb/shaders.ts` | The four looks |
| `src/lib/orb/fluid.ts` | The voice's fluid simulation |
| `src/lib/orb/audio.ts` | Audio analysis: `AnalyserLevels`, `analyserForElement`, `openMicrophone`, `SimulatedVoice` |
| `src/data/orb.ts` | Types, palettes and defaults |

If raw.githubusercontent.com can't be reached, clone the repository with
`git clone --depth 1 https://github.com/imuvrays1/voice-orb` into a temporary
directory and copy from there.

Then adapt the files:

- **Fix the imports** to the project's alias and folders. The files import
  `@/data/orb`, `@/lib/orb/...` and `./VoiceOrb.module.css`.
- **Trim `data/orb.ts` to what the engine uses.** Keep the types (`OrbVariant`,
  `OrbState`, `OrbPaletteId`, `OrbStops`, `OrbPalette`, `OrbParams`), `ORB_PALETTES`
  and `ORB_PARAM_DEFAULTS`. Everything else is the demo page's copy and can go:
  `ORB_REPO`, `ORB_SAMPLE`, `ORB_LINK_EXAMPLE`, `ORB_SOURCES`, `ORB_LAB` and the
  slider lists. Keep `ORB_VARIANTS` and `ORB_STATES` only if the UI lists them.
- **Keep each file's licence notice** at the top while adapting it (see Credit, every
  time).

## 3. Connect the audio

The orb reads a `LevelSource`, which gives four bands and a level each frame.
`voice` is read in the `talking` state and `caller` in the `listening` state.

```tsx
import VoiceOrb from "@/components/VoiceOrb";
import { AnalyserLevels, analyserForElement, openMicrophone, SimulatedVoice } from "@/lib/orb/audio";
```

**An `<audio>` element** (a reply, a preview, a recording). Create the analyser inside
the click that starts playback, because browsers only allow audio after a gesture:

```tsx
const onPlay = async () => {
  const analyser = analyserForElement(audioRef.current!); // still plays through the speakers
  setVoice(new AnalyserLevels(analyser));
  await audioRef.current!.play();
  setState("talking");
};
// onPause → "ready", onEnded → "settled"
```

**The microphone**, so the orb listens:

```tsx
const mic = await openMicrophone(); // call from a click; mic.stop() releases it
setCaller(new AnalyserLevels(mic.analyser));
setState("listening");
```

**A voice SDK in a live call.** Most SDKs expose an `AnalyserNode` on the agent's audio,
or a `MediaStream` you can analyse. Pass the agent's audio as `voice` and the
microphone as `caller`, then map the SDK's events to states:

| Call event | `state` |
|------------|---------|
| Nothing yet | `ready` |
| Dialling, waiting for the first word | `connecting` |
| The agent is speaking | `talking` |
| The user is speaking | `listening` |
| Call ended | `settled` |
| Disabled, or not chosen | `dormant` |

**No audio yet**, for design work: `new SimulatedVoice()` gives speech-like levels.

## 4. Render it

```tsx
<VoiceOrb
  palette="twilight"        // twilight | sunset | lagoon | forest | midnight, or [deep, mid, light, glint]
  variant="painted"         // painted | glass | silk | halftone
  state={state}
  voice={voice}
  caller={caller}
  size="240px"              // any CSS length; the orb is square
  label="Assistant, speaking" // names it for screen readers; leave it out if it is decorative
/>
```

`params` takes any of `speed`, `warp`, `sphere`, `detail`, `grain`, `pulse`,
`highlight`, `exposure`, `saturation` and `fluid`. The demo page's **Copy settings**
button gives a ready-made object.

## Rules

- **Create one source per orb.** A source keeps its own clock, so to show the same voice
  in two orbs, give the second one `voice.twin()`.
- **Don't add your own animation loop or a second WebGL context per orb.** The shared
  renderer already pauses off-screen and in hidden tabs.
- **Don't override reduced motion.** It is handled: the orb holds a still frame.
- **Remember a page can't hear another site's player** (a YouTube embed, for example).
  Use a direct audio source, or the tab-audio share (`openTabAudio` in `audio.ts`).

## Check it

Run the dev server and open the page, and check that:
- The orb draws, and there are no WebGL errors in the console.
- It drifts slowly at rest.
- With real audio it zooms a little, speeds up and pulses with the voice.
- While listening, it draws in and its inside swirls with the microphone.
- Every copied file still starts with the Voice orb by UV notice, and `LICENSE` is
  beside them.
