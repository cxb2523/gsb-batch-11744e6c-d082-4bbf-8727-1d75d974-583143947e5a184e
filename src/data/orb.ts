/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

/**
 * The voice orb's palettes, types and states, and the copy of the page that
 * shows them at /.
 *
 * Each palette is four stops, deep to light, plus a glint: a neighbouring hue
 * the shader only lets in at the brightest points, which is what keeps a
 * one-hue orb from reading flat. A stop is a hex, or a custom property name
 * the renderer resolves off :root (so a token change would land here too).
 * The palettes here are plain hex, so they don't depend on the page's theme.
 */

export type OrbVariant = "painted" | "glass" | "silk" | "halftone";

export type OrbState =
  | "dormant"
  | "ready"
  | "connecting"
  | "listening"
  | "talking"
  | "settled";

export type OrbPaletteId = "twilight" | "sunset" | "lagoon" | "forest" | "midnight";

/** deep, mid, light, glint. */
export type OrbStops = [string, string, string, string];

export interface OrbPalette {
  id: OrbPaletteId;
  name: string;
  /** A short description of the ramp, shown under the orb. */
  scenario: string;
  stops: OrbStops;
  note: string;
}

export const ORB_PALETTES: OrbPalette[] = [
  {
    id: "twilight",
    name: "Twilight",
    scenario: "Violet to orchid",
    stops: ["#4a3aff", "#8a7fff", "#d2cfff", "#f6c9ff"],
    note: "Violet shadows, a lavender body and an orchid glint.",
  },
  {
    id: "sunset",
    name: "Sunset",
    scenario: "Plum to gold",
    stops: ["#55206e", "#e8566c", "#ffab73", "#ffe6a6"],
    note: "Plum shadows, a coral body and a gold glint.",
  },
  {
    id: "lagoon",
    name: "Lagoon",
    scenario: "Navy to aqua",
    stops: ["#003f86", "#018dff", "#8fd2ff", "#c4fff1"],
    note: "Navy shadows, a sky blue body and an aqua glint.",
  },
  {
    id: "forest",
    name: "Forest",
    scenario: "Pine to sunlight",
    stops: ["#0b5134", "#1da463", "#93e2b6", "#fff0b8"],
    note: "Pine to mint, with a glint of sunlight.",
  },
  {
    id: "midnight",
    name: "Midnight",
    scenario: "Indigo to white",
    stops: ["#080064", "#4a3aff", "#bfbaff", "#ffffff"],
    note: "Indigo to violet with a white glint: the neutral orb.",
  },
];

export const ORB_VARIANTS: { id: OrbVariant; name: string; body: string }[] = [
  {
    id: "painted",
    name: "Painted",
    body: "A soft painted field wrapped onto a sphere, drifting on layered noise, with film grain. The default.",
  },
  {
    id: "glass",
    name: "Glass",
    body: "A clear ball: bright fresnel rim, a sharp specular point and caustic threads moving inside. Reads as a physical object.",
  },
  {
    id: "silk",
    name: "Silk",
    body: "Ribbons of the palette flowing across the sphere, like an aurora drawn inside a ball. Speech lifts and widens them.",
  },
  {
    id: "halftone",
    name: "Halftone",
    body: "The painted field printed as a dot screen on pale paper, the darker the colour the bigger the dot. Speech swells the dots.",
  },
];

export const ORB_STATES: { id: OrbState; name: string; when: string; drives: string }[] = [
  {
    id: "dormant",
    name: "Dormant",
    when: "Not chosen yet, like the side orbs of a carousel.",
    drives: "One still frame, smaller and quieter. Nothing to draw after it.",
  },
  {
    id: "ready",
    name: "Ready",
    when: "Chosen, nothing playing.",
    drives: "A slow drift of the colour, on time alone.",
  },
  {
    id: "connecting",
    name: "Connecting",
    when: "Placing the call, waiting for the first word.",
    drives: "A faster drift and a circling highlight, so waiting reads as working.",
  },
  {
    id: "listening",
    name: "Listening",
    when: "The caller is speaking.",
    drives: "The orb draws in and the highlight leans toward the caller's voice.",
  },
  {
    id: "talking",
    name: "Talking",
    when: "The agent is speaking.",
    drives: "Bass stirs the liquid, low mid sends waves, treble lights the highlight. Loudness speeds it all.",
  },
  {
    id: "settled",
    name: "Settled",
    when: "The call has ended.",
    drives: "A slower, dimmer drift. The orb stays chosen.",
  },
];

/** Where the code lives: the nav's star count and every "get the code" link. */
export const ORB_REPO = {
  owner: "imuvrays1",
  name: "voice-orb",
  url: "https://github.com/imuvrays1/voice-orb",
  license: "https://github.com/imuvrays1/voice-orb/blob/main/LICENSE",
};

/**
 * Who made it: the "Built by" credit on the page. The same name is in
 * LICENSE, the README, the skill and the notice at the top of every file.
 * `url` is where the name links (GitHub until there is an X profile).
 */
export const ORB_AUTHOR = {
  name: "UV",
  url: "https://github.com/imuvrays1",
};

/**
 * Openfile, UV's shop of Framer templates: a link in the nav and one quiet
 * card at the foot of the page. Each link carries UTM tags, and utm_content
 * names the spot it sits in, so Openfile's analytics can tell the two apart.
 */
export const ORB_OPENFILE = {
  name: "Openfile",
  href: (spot: "nav" | "banner") =>
    `https://openfile.pro/?utm_source=voice-orb&utm_medium=referral&utm_campaign=voice-orb&utm_content=${spot}`,
};

/**
 * What Play plays before you choose anything: a minute on how the orb works,
 * read by an AI voice over a quiet synthesised pad, so the orb hears a clear
 * voice on the first click in every browser.
 */
export const ORB_SAMPLE = {
  src: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/audio/voice-orb.mp3`,
  title: "A voice orb, explained",
};

/** The link field's example, loaded when Load is pressed with the field empty. */
export const ORB_LINK_EXAMPLE = {
  url: "https://www.youtube.com/watch?v=1i9kcBHX2Nw&t=33s",
  name: "Steve Jobs at Stanford, from 0:33",
};

/** Where the voice comes from on the stage. */
export type OrbSourceId = "sample" | "file" | "link" | "microphone";

export const ORB_SOURCES: { id: OrbSourceId; name: string }[] = [
  { id: "sample", name: "Sample" },
  { id: "file", name: "Your file" },
  { id: "link", name: "Link" },
  { id: "microphone", name: "Microphone" },
];

/** The page's own words. */
export const ORB_LAB = {
  title: "Voice orb",
  intro:
    "An audio-reactive orb for voice interfaces, drawn in WebGL2. Play any voice through it, tune the look, and take the code. Open source, MIT licensed.",
  badge: "Open source · MIT",
  getCode: "Get the code",
  /** The secondary call to action in the header. */
  howLink: "How it works",
  nav: {
    home: "Voice orb",
    links: [
      { href: "#inside", name: "How it works" },
      { href: "#use", name: "Use it" },
    ],
    star: "Star",
    starLabel: "Star voice-orb on GitHub",
    templates: "Templates",
    templatesLabel: "Templates: Framer templates on Openfile, opens in a new tab",
  },
  footer: {
    built: "Built by",
    licence: "MIT licence",
    source: "Source on GitHub",
    journal: "Build journal",
  },
  openfile: {
    label: "Also by UV",
    title: "Openfile",
    body: "Framer templates for products, studios and portfolios, with every page shown before you buy. Some are free.",
    cta: "Browse templates",
  },
  reducedMotion: "Reduced motion is on, so every orb holds one still frame.",
  controls: {
    type: "Type",
    state: "State",
    ground: "Ground",
    light: "Light",
    dark: "Dark",
    play: "Play",
    pause: "Pause",
    previous: "Previous palette",
    next: "Next palette",
    show: "Show",
    reset: "Reset",
    copy: "Copy settings",
    copied: "Copied",
    chosen: "Chosen",
    when: "When",
    drives: "Drives",
  },
  /** The voice panel under the orb: where the sound comes from. */
  voice: {
    label: "Voice",
    playing: "Playing",
    simulated: "Simulated voice",
    sample: {
      body: "Press play, or click the orb, and it tells you how it works while it moves with the voice.",
    },
    file: {
      drop: "Drop an audio file here",
      or: "or",
      choose: "Choose a file",
      change: "Choose another",
      formats: "MP3, WAV, M4A, OGG, FLAC, WebM: anything your browser plays. It never leaves your device.",
      dropHere: "Drop to play it through the orb",
      unplayable: "Your browser can't play that file. Try MP3 or WAV.",
    },
    link: {
      label: "YouTube or audio link",
      load: "Load",
      loading: "Loading",
      help: "A YouTube link, or a direct link to an audio file. Leave it empty to load the example:",
      invalid: "That isn't a YouTube or audio link.",
      blocked: "That site doesn't let other pages read its audio. Download the file and use Your file instead.",
      youtube:
        "YouTube's player can't be read by other pages, so on Play the orb asks to hear this tab. In Chrome's prompt, pick this tab and keep tab audio on.",
      youtubeLive: "Hearing this tab.",
      youtubeSimulated:
        "Not hearing the tab, so the orb is simulating a voice. Press Play again to share it (Chrome or Edge on a computer).",
    },
    microphone: {
      on: "Use my microphone",
      off: "Stop microphone",
      body: "The orb listens: it draws in, and your voice swirls its inside.",
      live: "Listening. Speak and watch the inside move.",
      denied: "Microphone blocked. Allow it from the address bar to use this source.",
    },
  },
  /** The live levels beside the sliders, with what each one drives. */
  meters: [
    { name: "Bass", hint: "90 to 350 Hz. Stirs the fluid and breathes the field in and out." },
    { name: "Low mid", hint: "350 Hz to 1.1 kHz, where most of a voice sits. Sends the pulse rings outward." },
    { name: "High mid", hint: "1.1 to 2.8 kHz. Adds to the overall level that speeds the drift." },
    { name: "Treble", hint: "2.8 to 7 kHz, the hiss of s and t. Lights the highlight near the rim." },
    { name: "Caller", hint: "The microphone, while listening. Draws the orb in, swirls its inside and turns the highlight." },
  ],
  preview: {
    title: "Preview",
    body: "Mirrors the stage: palette, type, state and voice.",
    levels: "Live levels",
    levelsHint: "What the orb hears, each band from 0 to 1 and calibrated to the voice itself. Play the stage to see them move.",
  },
  sections: {
    tune: {
      kicker: "Controls",
      title: "Tune",
      intro: "Every slider changes every orb on the page. Hover or tap the i for what each one does, and copy the settings to share a look.",
    },
    inside: {
      kicker: "Inside",
      title: "How the orb is built",
      intro: "Four layers, each one live below with the palette you chose. Then the path a voice takes from the speaker to the colour.",
    },
    states: {
      kicker: "States",
      title: "Six states",
      intro: "The same orb in each state. Talking and listening run on simulated voices here.",
    },
    types: {
      kicker: "Types",
      title: "Four types",
      intro: "The same palette and voice in each type, all talking.",
    },
    palettes: {
      kicker: "Palettes",
      title: "Palettes",
      intro: "Five ramps, deep to light, each with a glint of a neighbouring hue. Or pass four colours of your own.",
    },
    use: {
      kicker: "Use it",
      title: "Use it in your project",
      intro: "It is a React component and a few plain TypeScript files, no orb library to install. Clone it, copy it in, or let Claude wire it up.",
    },
    how: {
      kicker: "Engine",
      title: "Engine notes",
      intro: "What keeps it fast and well behaved. The full story, with what broke on the way, is in the build journal.",
    },
  },
  /** The layers, each shown live by one tile (page.tsx gives each its params). */
  inside: [
    {
      id: "field",
      name: "A colour field",
      body: "Four colour stops, deep to light, laid out by layered noise. Flat and still.",
    },
    {
      id: "sphere",
      name: "Wrapped on a sphere",
      body: "Every point goes through a lens: the middle magnifies, the edge compresses, and the flat field reads as a ball.",
    },
    {
      id: "drift",
      name: "Drifting",
      body: "The noise is warped through itself and a clock moves it. Time alone does this: it is the orb at rest.",
    },
    {
      id: "voice",
      name: "Moved by a voice",
      body: "The voice stirs a small fluid, sends rings outward and lights the rim. Grain and a grade finish it.",
    },
  ],
  /** The path from sound to colour. */
  pipeline: {
    title: "From a voice to the colour",
    steps: [
      { name: "Audio", body: "A file, a link, your microphone, or a live call." },
      { name: "Analyser", body: "Web Audio reads the spectrum every frame." },
      { name: "Four bands", body: "Bass, low mid, high mid, treble, each 0 to 1." },
      { name: "Clocks and liquid", body: "Loudness speeds the drift; bass stirs a 128 × 128 fluid." },
      { name: "Shader", body: "One WebGL2 pass draws the ball, shared by every orb." },
    ],
  },
  use: {
    ways: [
      {
        id: "clone",
        name: "Run it",
        body: "Clone the repository and start the page you are reading.",
        code: "git clone https://github.com/imuvrays1/voice-orb.git\ncd voice-orb\npnpm install\npnpm dev",
      },
      {
        id: "copy",
        name: "Copy it in",
        body: "Copy src/lib/orb, src/components/VoiceOrb.tsx (and its CSS) and src/data/orb.ts into your React app, with LICENSE, and keep the notice at the top of each file. Then give it any AnalyserNode.",
        code: "import VoiceOrb from \"@/components/VoiceOrb\";\nimport { AnalyserLevels } from \"@/lib/orb/audio\";\n\n// Any Web Audio AnalyserNode: an <audio>, the mic, a voice SDK.\nconst voice = new AnalyserLevels(analyser);\n\n<VoiceOrb palette=\"twilight\" state=\"talking\" voice={voice} />",
      },
      {
        id: "claude",
        name: "Ask Claude",
        body: "Install Voice orb by UV, the Claude Code skill, then ask for an orb. It copies the files with their licence and connects your audio.",
        code: "/plugin marketplace add imuvrays1/voice-orb\n/plugin install voice-orb-by-uv@voice-orb\n\nAdd a voice orb to my call screen",
      },
    ],
    copy: "Copy",
    copied: "Copied",
    propsTitle: "Props",
    props: [
      { name: "palette", type: "id or 4 colours", body: "twilight, sunset, lagoon, forest, midnight, or [deep, mid, light, glint]." },
      { name: "variant", type: "string", body: "painted, glass, silk or halftone." },
      { name: "state", type: "string", body: "dormant, ready, connecting, listening, talking or settled." },
      { name: "voice", type: "LevelSource", body: "The speaker. Read while talking." },
      { name: "caller", type: "LevelSource", body: "The person listening, usually the mic. Read while listening." },
      { name: "params", type: "Partial<OrbParams>", body: "The sliders above: paste what Copy settings gives you." },
      { name: "size", type: "CSS length", body: "The orb is square. Defaults to 240px." },
      { name: "label", type: "string", body: "Names it for screen readers; without one it is decorative." },
    ],
    filesTitle: "The files",
    files: [
      { path: "src/components/VoiceOrb.tsx", body: "The component: states, easing, the drift and pulse clocks." },
      { path: "src/lib/orb/renderer.ts", body: "One shared WebGL2 context draws every orb on the page." },
      { path: "src/lib/orb/shaders.ts", body: "The four types, and the lens, noise, lights and grain they share." },
      { path: "src/lib/orb/fluid.ts", body: "The voice's liquid: a small stable-fluids simulation on the GPU." },
      { path: "src/lib/orb/audio.ts", body: "Web Audio: four calibrated bands, the mic, tab audio, a simulated voice." },
      { path: "src/data/orb.ts", body: "Palettes, states, slider ranges and this page's words." },
    ],
  },
  howItWorks: [
    {
      icon: "stack",
      title: "One renderer, many orbs",
      body: "Every orb shares one hidden WebGL2 context and copies its frame into its own canvas. Browsers drop contexts past about sixteen, so one per orb would break a page like this.",
    },
    {
      icon: "palette",
      title: "No image assets",
      body: "Each type is a fragment shader: a colour field wrapped onto a sphere, bent by layered noise, lit from the top left and finished with grain.",
    },
    {
      icon: "waveform",
      title: "Calibrated to the voice",
      body: "Each band calibrates to itself, so a quiet recording and a loud microphone both use the full range. A running total drives the drift, so speech speeds it and silence lets it coast.",
    },
    {
      icon: "phone",
      title: "Live calls",
      body: "Anything with a Web Audio AnalyserNode can drive it. Voice SDKs often expose one for the agent's audio; a second on the microphone drives listening.",
    },
    {
      icon: "shield",
      title: "Rules it keeps",
      body: "Draws only on screen and in a visible tab, holds a still frame under reduced motion, survives a GPU reset, and resting side orbs cost nothing after their first frame.",
    },
  ],
  /** The last engine note: onward to the journal and the code. */
  more: {
    title: "Read the build journal",
    body: "Every step from a blank canvas to this page: what was tried, what broke, and the fix.",
    href: "https://github.com/imuvrays1/voice-orb/blob/main/docs/journey.md",
    link: "Open the journal",
  },
};

/** The tunable look parameters, with their ranges for the board's sliders. */
export interface OrbParams {
  speed: number;
  warp: number;
  sphere: number;
  detail: number;
  grain: number;
  pulse: number;
  highlight: number;
  exposure: number;
  saturation: number;
  /** How far the voice's liquid carries the colour (fluid.ts); 0 turns it off. */
  fluid: number;
}

export const ORB_PARAM_DEFAULTS: OrbParams = {
  speed: 1,
  warp: 0.8,
  sphere: 0.85,
  detail: 1.1,
  grain: 0.22,
  pulse: 0.6,
  highlight: 0.7,
  exposure: 0,
  saturation: 1,
  fluid: 0.7,
};

/** The sliders' groups, in the order the board shows them. */
export type OrbParamGroup = "field" | "voice" | "finish";

export const ORB_PARAM_GROUPS: { id: OrbParamGroup; name: string; body: string }[] = [
  { id: "field", name: "Field", body: "The colour pattern, its texture and how it sits on the ball." },
  { id: "voice", name: "Motion and voice", body: "How time and speech move and light the orb." },
  { id: "finish", name: "Grade", body: "Exposure and colour over the finished orb." },
];

export const ORB_PARAM_RANGES: {
  key: keyof OrbParams;
  name: string;
  group: OrbParamGroup;
  /** One or two sentences for the slider's info tooltip. */
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "sphere", name: "Sphere", group: "field", min: 0, max: 1.5, step: 0.01,
    hint: "How strongly the flat field wraps onto a ball: magnified at the centre, compressed at the edge. 0 is flat." },
  { key: "warp", name: "Warp", group: "field", min: 0, max: 1.5, step: 0.01,
    hint: "How far layered noise bends the colour. Low is soft pools, high draws them into streaks." },
  { key: "detail", name: "Detail", group: "field", min: 0.3, max: 3, step: 0.05,
    hint: "The scale of that noise. Higher makes smaller, busier shapes." },
  { key: "grain", name: "Grain", group: "field", min: 0, max: 0.6, step: 0.01,
    hint: "Film grain over the finish, so flat areas never look digital." },
  { key: "speed", name: "Drift speed", group: "voice", min: 0, max: 3, step: 0.05,
    hint: "How fast the field drifts on its own. Speech adds to it, silence lets it coast." },
  { key: "fluid", name: "Fluid", group: "voice", min: 0, max: 2, step: 0.01,
    hint: "How far the bass-driven liquid drags the colour into swirls. 0 turns the simulation off." },
  { key: "pulse", name: "Pulse rings", group: "voice", min: 0, max: 1.5, step: 0.01,
    hint: "Waves that travel outward through the colour on the low-mid band." },
  { key: "highlight", name: "Highlight", group: "voice", min: 0, max: 1.5, step: 0.01,
    hint: "The bright arc circling near the rim, lit by treble, the caller and the connecting state." },
  { key: "exposure", name: "Exposure", group: "finish", min: -0.4, max: 0.4, step: 0.01,
    hint: "Brightens or darkens the whole orb, after everything else." },
  { key: "saturation", name: "Saturation", group: "finish", min: 0, max: 1.6, step: 0.01,
    hint: "How vivid the palette is. 0 is greyscale." },
];
