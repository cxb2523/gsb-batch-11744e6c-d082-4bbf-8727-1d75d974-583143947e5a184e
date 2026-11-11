# dsh-soundcheck

[简体中文](README.md) | [English](README.en.md)

**Local music analysis for DSH.** dsh-soundcheck connects DSH Agents to the independent [Music Evidence Engine](https://github.com/ALittleLov/music-evidence-engine), providing inspectable audio measurements and time-localized evidence instead of unsupported guesses.

- **Local and CPU-based:** no dedicated GPU required. Audio is analyzed on your machine, not uploaded. Initial setup downloads dependencies and model files.
- **Evidence:** tempo, key candidates, loudness, energy, spectral bands, acoustic structure changes, timeline events, and vocal/instrument candidates; text and JSON outputs.
- **Optional capabilities:** the standard setup includes four-stem separation (vocals, drums, bass, other). Six-stem separation and lyric transcription are optional.
- **Independent updates:** Soundcheck handles the DSH integration, setup, and UI; the Engine is released separately. Engine upgrades require user confirmation and preserve the previous installation on failure.

## Install

Install `dsh-soundcheck` from the **DSH plugin marketplace** (recommended), or download the ZIP from [GitHub Releases](https://github.com/ALittleLov/dsh-soundcheck/releases/latest).

In DSH, open **Settings → Audio Analysis** and follow the Engine installation action. First-time setup prepares Python 3.12, an isolated environment, dependencies, and model files. All audio analysis runs locally. Processing time depends on CPU performance, audio duration, and selected tasks.

## Agent tools

- `audio_analyze` — whole-track or range-based evidence
- `audio_section` — focused analysis of a time interval
- `audio_bands` — frequency-band, energy, and onset-related measurements
- `audio_provision` — install, repair, and update the Engine and models

**Scope:** this is an evidence tool, not an automatic composition or mixing-settings recommender. Measurements, recognition candidates, and musical interpretation are different things.

## Development and tests

Stem-separation status (4-stem / 6-stem) lives in the pure module `lib/stem-status.js`. It takes a plain-data snapshot (dependency probe results, model-directory file names, optional byte sizes) and returns a structured diagnosis: per-track availability, missing dependencies and model files, total model size, and an ordered checklist. Both host overview branches (module / legacy) and the settings panel consume this single result.

The automated tests run fully offline — no real Python engine, network, or real model files — using Node's built-in test runner (no dependencies to install):

```bash
npm test
```

Tests live in `test/` and are auto-discovered by `node --test`:

- `test/stem-status.test.js` — happy / negative / edge paths of the pure module (missing dependency, 6-stem model only, empty directory, unrelated files, missing byte sizes counted as 0).
- `test/overview-stem-status.test.js` — host overview wiring, asserting the `stemStatus` field exists and stays consistent with the legacy boolean semantics of `components.stems` (true when at least one stem kind is available).

## Project and license

[Music Evidence Engine](https://github.com/ALittleLov/music-evidence-engine) · [Latest Soundcheck release](https://github.com/ALittleLov/dsh-soundcheck/releases/latest)

Primarily validated on Windows. MIT licensed; third-party dependencies and model weights retain their respective licenses.
