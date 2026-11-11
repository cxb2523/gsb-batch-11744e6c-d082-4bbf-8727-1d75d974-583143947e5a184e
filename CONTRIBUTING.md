# Contributing

Thanks for taking a look. This is Voice orb by UV, a small project, so the process is
light. By contributing you agree your work is released under its [MIT licence](LICENSE).

## Run it locally

```bash
pnpm install
pnpm dev
```

Before opening a pull request, run `pnpm typecheck` and `pnpm build`.

## What helps most

- **Bug reports with a browser and GPU.** WebGL behaves differently across devices.
  Say which browser, operating system and device you used, and add a screenshot or
  screen recording if you can. `?flow` and `?flow=grid` in the address show the fluid,
  which helps with motion bugs.
- **Performance on low-end phones.** Frame times, and what helped.
- **New looks or palettes.** A look is one fragment shader in `src/lib/orb/shaders.ts`;
  a palette is four colours in `src/data/orb.ts`.

## How the code is written

- **Keep the engine free of dependencies.** `src/lib/orb` and `VoiceOrb.tsx` should need
  nothing but React.
- **Keep comments on the why.** Comments explain why something works the way it does,
  in plain sentences. Match the style of the file you're in.
- **Respect reduced motion.** Any new motion must hold still under
  `prefers-reduced-motion`.
- **Keep it fast.** Orbs draw only on screen and in a visible tab. Keep it that way.
- **Start every new source file with the licence notice.** It's the same notice as
  in the other files:
  `/*! Voice orb by UV · https://github.com/imuvrays1/voice-orb … */`.
- **Use original assets only.** Audio, images or shader code from other projects only
  come in with a licence that allows it. Credit them in the README.

If you change how something works, add a short entry to `docs/journey.md`: what you
tried, what broke and the fix.
