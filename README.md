# Voice orb

**by [UV](https://github.com/imuvrays1)** · [MIT licence](LICENSE) ·
[github.com/imuvrays1/voice-orb](https://github.com/imuvrays1/voice-orb)

**[Try it live → imuvrays1.github.io/voice-orb](https://imuvrays1.github.io/voice-orb/)**

An audio-reactive orb for voice interfaces, drawn in WebGL2. Play any voice through it,
tune the look, and take the code.

- **Moves with a real voice.** Web Audio splits the sound into four calibrated bands that
  stir a small GPU fluid, send rings through the colour and light the rim.
- **Six states** for a voice agent (dormant, ready, connecting, listening, talking,
  settled), **four looks** (painted, glass, silk, halftone) and **five palettes**, or
  four colours of your own.
- **Light to run.** Every orb on a page shares one WebGL2 context, draws only while on
  screen, and holds a still frame under reduced motion. It uses no image assets and has
  no dependencies beyond React.
- **Any audio.** Use the built-in sample, a file of yours (MP3, WAV, M4A, OGG, FLAC), a
  link, your microphone, or a voice SDK's `AnalyserNode` in a live call.

## Run it

```bash
git clone https://github.com/imuvrays1/voice-orb.git
cd voice-orb
pnpm install
pnpm dev
```

Open http://localhost:3000. The page is the demo and the documentation in one place: try
the sources under the orb, tune the sliders, and copy the settings.

`pnpm build` makes a production build and `pnpm typecheck` runs TypeScript alone.

### Host your own copy

The live page is GitHub Pages, built by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`.
In a fork, open **Settings → Pages**, set **Source** to **GitHub Actions**, and push.
The page appears at `https://<you>.github.io/<repository>/`. The workflow sets
`PAGES_BASE_PATH` to the repository's folder, which makes `next build` export static
files with every path under it.

## Use it in your project

Copy these into your React app, along with [`LICENSE`](LICENSE), then point the orb at
any audio. Each file starts with a short licence notice; keep it (see
[Credit](#credit)).

| File | What it is |
|------|------------|
| [`src/components/VoiceOrb.tsx`](src/components/VoiceOrb.tsx) | The component: states, easing, the drift and pulse clocks |
| [`src/components/VoiceOrb.module.css`](src/components/VoiceOrb.module.css) | Its box, and a still gradient where WebGL2 is missing |
| [`src/lib/orb/renderer.ts`](src/lib/orb/renderer.ts) | One hidden WebGL2 context draws every orb and copies each frame into that orb's canvas. Browsers drop contexts past about sixteen, so one per orb would break a page of them |
| [`src/lib/orb/shaders.ts`](src/lib/orb/shaders.ts) | GLSL ES 3.00: a shared prelude (noise, the sphere lens, the voice ripple, lights, grain) and one fragment shader per look |
| [`src/lib/orb/fluid.ts`](src/lib/orb/fluid.ts) | The voice's liquid: a 128 × 128 stable-fluids simulation per talking orb, plus an offset field that carries the colour. Add `?flow` or `?flow=grid` to the address to see it |
| [`src/lib/orb/audio.ts`](src/lib/orb/audio.ts) | Web Audio: four self-calibrating bands, the microphone, this tab's audio, and a simulated voice |
| [`src/data/orb.ts`](src/data/orb.ts) | Types, palettes and defaults (the rest is this page's copy, and can go) |

```tsx
import VoiceOrb from "@/components/VoiceOrb";
import { AnalyserLevels, analyserForElement } from "@/lib/orb/audio";

// Inside the click that starts playback (browsers allow audio only after a gesture):
const voice = new AnalyserLevels(analyserForElement(audioElement));

<VoiceOrb palette="twilight" state="talking" voice={voice} label="Assistant, speaking" />;
```

| Prop | Type | What it does |
|------|------|--------------|
| `palette` | id or `[deep, mid, light, glint]` | `twilight`, `sunset`, `lagoon`, `forest`, `midnight`, or four colours |
| `variant` | string | `painted`, `glass`, `silk` or `halftone` |
| `state` | string | `dormant`, `ready`, `connecting`, `listening`, `talking` or `settled` |
| `voice` | `LevelSource` | The speaker, read while talking |
| `caller` | `LevelSource` | The person listening, usually the microphone, read while listening |
| `params` | `Partial<OrbParams>` | The look: what the page's **Copy settings** button gives you |
| `size` | CSS length | The orb is square. Defaults to `240px` |
| `label` | string | Names it for screen readers; without one it is decorative |

A live call works the same way: pass the agent's audio analyser as `voice` and the
microphone's as `caller`, and set `state` from the call's events.

## Use it with Claude

The repository is also a Claude Code plugin with one skill, **Voice orb by UV**
(`voice-orb-by-uv`). It copies the files into your project with their licence, fixes
the imports and connects your audio.

```text
/plugin marketplace add imuvrays1/voice-orb
/plugin install voice-orb-by-uv@voice-orb
```

Then just ask, for example "add a voice orb to my call screen that listens to the mic".
To call the skill by name, use `/voice-orb-by-uv:voice-orb-by-uv`.

To install the skill alone instead, copy
[`plugin/skills/voice-orb-by-uv`](plugin/skills/voice-orb-by-uv) to
`~/.claude/skills/voice-orb-by-uv` and call it as `/voice-orb-by-uv`. On claude.ai, zip
that folder (the zip should contain `voice-orb-by-uv/SKILL.md`) and upload it under
Customize, then Skills.

## Audio sources on the page

| Source | How it is heard |
|--------|-----------------|
| Sample | A minute on how the orb works, read by an AI voice over a quiet pad |
| Your file | Choose or drop any file your browser plays. It stays on your device |
| Link | A direct audio link plays here if its host allows other pages to read it (CORS). A YouTube link plays in YouTube's own player, and the orb hears it by asking to share this tab's audio. That works in Chrome and Edge on a computer; elsewhere the orb simulates a voice and says so |
| Microphone | The orb listens: it draws in, and your voice swirls its inside |

## How it got here

[`docs/journey.md`](docs/journey.md) is the build journal: every step from a blank
canvas, with what was tried, what broke and the fix.

## Credits

- **The sample clip's voice** was made with [ElevenLabs](https://elevenlabs.io); the
  quiet pad under it was synthesised for this project.
- **The fonts** are Inter, Inter Tight and Geist Mono, under the SIL Open Font License,
  loaded by `next/font`.
- **The fluid** follows Jos Stam's *Stable Fluids* (1999), as in GPU Gems, chapter 38.

## Credit

Voice orb is MIT licensed, so you can use it in anything, commercial or not. The licence
asks for one thing in return: **keep the copyright and licence notice with the code.**
In practice:

- **Keep the notice at the top of each file:**

  ```
  /*!
   * Voice orb by UV · https://github.com/imuvrays1/voice-orb
   * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
   */
  ```

  The `/*!` form survives minification, so the credit stays in production builds.
- **Ship [`LICENSE`](LICENSE) with the files** if you copy them out of this repository.
- **If you can, credit it where people see it,** for example "Orb: Voice orb by UV"
  linking to https://github.com/imuvrays1/voice-orb. It isn't required, but it is how
  others find it.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

The code is [MIT](LICENSE), copyright (c) 2026 UV. The sample clip, `public/audio/voice-orb.mp3`, isn't covered
by it: its voice comes from ElevenLabs' free plan, which allows non-commercial use with a
credit. To use the page commercially, replace the clip with audio of your own.
