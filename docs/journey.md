# How the orb got here

A record of the path, October 2026: what was built, what broke and what fixed it. Keep
adding to it; the point is to be able to show how each decision was reached, not only
where it ended up.

## 1. The idea

Voice products often show a glowing orb that moves while the assistant speaks. The aim
here was to build one from first principles and in the open: an orb drawn entirely in a
shader, moved by real audio, cheap enough to put many on one page, and still under
reduced motion.

## 2. First build: our own engine

The decision was to draw the colour in the shader from a four-stop palette instead of
painting an image per orb, so a new colour is a data change rather than a design task.

- **One shared WebGL2 context.** A board with eighteen orbs would pass the browser's limit
  of about sixteen contexts, so one hidden context draws every orb and copies each frame
  into that orb's own 2D canvas. It draws only orbs that are on screen and moving.
- **Four types** as fragment shaders over a shared prelude: painted, glass, silk, halftone.
- **Six states**, each a set of eased targets: dormant, ready, connecting, listening,
  talking, settled.

## 3. What broke, and the fix

| Problem | Cause | Fix |
|---------|-------|-----|
| Grain showed vertical stripes | A float sine hash loses precision across the canvas | An integer hash (`grainHash` in `shaders.ts`) |
| Real audio pinned every band at 1.0 | The byte spectrum saturates on speech | Read the float spectrum in dB (−95 to −20), split at call-band edges (90, 350, 1100, 2800, 7000 Hz), and calibrate each band to itself: the floor rises 0.15/s and drops instantly, the peak falls 0.05/s, a minimum span of 0.14, then an exponent of 1.8. Attack 28, release 8. Tuned until speech averages about 0.4 and peaks near 0.95 |
| Talking washed the orb white | The speech rings added light | The rings displace the colour instead (a UV ripple): the orb moves with the voice without brightening |
| The field looked marbled, then flat | Hard noise bands; then too little structure | Soft, rotated, stretched gaussian lights warped twice; the violet palette lightened |
| JavaScript failed to parse the shaders | Backticks inside GLSL comments in a template literal | No backticks in shader source |
| Turbopack panicked on the CSS | `composes` on a nested selector | `composes` only on simple class selectors; nested elements get their own classes |

## 4. A fluid for the voice

Noise alone moves the colour on a clock; a voice should push it around. So a fluid
simulation came next, in steps that could each be seen in the browser. The code is
`src/lib/orb/fluid.ts`, written from the textbook method (Stam's stable fluids, as in GPU
Gems chapter 38).

### Step 1: the liquid on its own

A 128 × 128 grid of velocities in a half-float texture, one per talking orb, advanced
every frame by full-screen passes on the GPU:

1. **Splat.** The bass pushes the liquid at three points on a ring around the centre.
   The ring turns with the treble and the push sways between outward and around.
2. **Advect.** Each cell looks back along its own velocity and takes what was there a
   moment ago. Looking back instead of pushing forward is what makes it stable at any
   speed.
3. **Divergence, pressure, gradient.** Measure where the liquid would bunch up, solve
   for the pressure that would undo it by sixteen Jacobi iterations, and subtract that
   pressure's slope. What is left can only swirl, never compress.

To see it before it touched the colour, `?flow` in the address draws every orb's
velocity as colour: grey is still, red and green are the x and y of the motion.

| Tried | What happened | Why |
|-------|---------------|-----|
| Splats pushing around the ring | Three swirling arms, like a pinwheel | Each push drags its neighbours along: the classic fluid look |
| Splats pushing straight outward | Still strong swirls | A point push is not pure squeeze: its sides slide past still liquid, which spins up a pair of opposite vortices. Projection keeps those and removes only the squeeze |
| The same, projection switched off | Three hard-edged blobs; the rest of the ball grey and still | Without pressure, a push only moves the liquid it touches. Pressure is how a push in one place moves liquid everywhere else |

Two choices that differ from a straight copy of the usual demos:

- **Every rate is per second.** Velocity keeps 25% of itself per second, raised to the
  frame's dt. A fixed 0.98 per step, as many demos use, fades twice as fast on a 120 Hz
  screen as on a 60 Hz one.
- **Half floats, with a way out.** Rendering into float textures needs
  `EXT_color_buffer_float`. Where the GPU lacks it, the renderer runs without a fluid
  instead of failing.

The liquid costs nothing for orbs that never talk: a view gets its textures only once
its voice has bass, and stops stepping after six quiet seconds.

### Step 2: the liquid carries the colour

Reading the velocity and nudging the picture by it would move the picture only while the
liquid moves, springing back the moment it slows. To make the voice move the colour,
the simulation also keeps an **offset field**: for each point, how far the colour there
has travelled. Each frame the flow carries the offsets along (the same look-back as
advection), adds how far the liquid moved, and lets them relax toward zero, keeping 35% a
second. The orb then reads its colour from `p − offset`, before the sphere mapping, so the
carried colour still bends like the surface of a ball. A **Fluid** slider scales it; 0
turns the simulation off.

| Tried | What happened | Why, and the fix |
|-------|---------------|------------------|
| The violet orb, Fluid 0.7 | Hardly any visible change in a still | The field is soft gaussian pools: sliding a smooth gradient sideways barely changes it. The motion is there, the picture hides it |
| `?flow=grid`: a grid drawn through the same offsets | The grid swirls into a pinwheel, points dragged up to a quarter of the ball, folding near the centre | Confirmed the colour really travels. The grid view stays as a debugging tool |
| The type cards, where the pattern has more contrast | An S-shaped swirl through the painted orb; glass's caustic threads curl with the liquid | Every type samples through the same carried coordinates, so all four pick it up for free |
| Frame times with several talking orbs | About 8 ms a frame, steady, the display's full 120 Hz | Each liquid is about 25 passes over 16,000 cells, small for any GPU |

## 5. Made generic

Every section of the original lab page carried over as it was: stage, tune, six states,
four types, palettes and how it works.

- **Palettes named for how they look.** They used to be named after industries. Now they
  are Twilight, Lagoon, Forest and Midnight, plus a new warm Sunset, plum to gold.
- **Plain hex, not tokens.** The stops used to be the old site's colour tokens. As hex,
  the orbs do not change when the page theme is swapped.
- **No pointers to the old site.** The Silk and Halftone descriptions, and two shader
  comments, used to point at the old site's pages; they were rewritten.

## 6. The page wouldn't scroll, and a design system of our own

**What broke.** A mouse or trackpad could only reach the first screen. The
CSS came from a site that scrolls through Lenis, a smooth-scroll library. There,
`overflow-x: hidden` on html, body and main, and `overscroll-behavior-y: none` on body,
never mattered. Scrolling natively, `overflow-x: hidden` made body its own scroll
container. It was as tall as the page, so it never scrolled, and its overscroll behaviour
stopped the wheel from passing up to the page. Scrolling from a script still worked, which
is why the first checks missed it.

**The fix.** `overflow-x: clip`, which trims the sides without making a scroll container.
Lesson: test scrolling with a real wheel.

**Then a design system of our own:** fresh tokens in `globals.css` (neutral grounds, ink
text, one focus blue, a live green), a plain pill Button and a small Badge. The orbs are
the only colour on the page.

## 7. A light, minimal look

The base was clean but generic. The aim was a white, minimal page in the manner of the
best voice-AI and developer-tool sites, kept lean: mostly token and stylesheet changes,
almost no markup. References came from Mobbin (voice products, Cartesia, Voiceflow).

| What | Choice |
|------|--------|
| Page | #fdfcfc, a breath off white |
| Cards | #f5f3f1 warm grey, 16 px radius, no border; the chosen one is lifted to white |
| Body | Inter 15-17 px, near-black, warm grey for secondary text |
| Headings | Inter Tight Light, 36-52 px, -0.025em: size carries the hierarchy, not weight |
| Buttons | A black pill, 40 px, 15 px regular; a white pill with a hairline beside it |
| Tabs | A warm track, the chosen tab a white pill |

**Structure.** Sections sit on the page with 96 px between them (64 on a phone). The
stage is the only boxed section: one card for the orb and its controls. Sliders are a
hairline and a black dot, drawn the same in every browser. Numbers are in Geist Mono.

| Tried | What happened | Fix |
|-------|---------------|-----|
| The first screenshot after a reload | No orbs, only the play button | Nothing wrong: the capture came before the first frame |
| Phone width, the State tabs | Six tabs wrapped, and a full pill radius turned the track into a lumpy blob | A radius of half one row's height: a pill on one row, a rounded box when it wraps |
| Phone width, the control rows | Each row centred to its own width, so the labels sat at different left edges | Stacked on one left edge below 640 px |

Checked at 1280 px and 375 px, light and dark grounds, with no sideways overflow and
wheel scrolling intact.

## 8. Hierarchy, grouping and reading: a docs-style page

The light look was right but the page was hard to read: centred paragraphs in every card,
ten sliders in one undifferentiated grid, a levels box mostly empty, and sections that
blurred together. The aim now was a page that reads like a well documented open-source
project.

**The frame:** the content sits in a 1180 px column with 1 px side rules at 6% black,
full-width section dividers in the same tone, and white cards lifted by a half-pixel ring
and two tiny shadows (0.5 px at 13%, then 1 px and 2-4 px at 4%). **From Mobbin:** Customer.io's tone sliders (groups with a line of explanation, a live preview
beside them) and GitBook's and Cursor's feature cards (icon chip, title, two lines, left
aligned).

| Problem | Change |
|---------|--------|
| Sections ran together | One framed column with faint side rules; a full-width hairline over each section with a small cross where it meets the rules; a sticky nav and a footer in the same frame |
| Headings had no hierarchy | Each section opens with a small mono number and name ("01 CONTROLS") over a light title, the intro and actions to the right |
| Centred paragraphs, hard to read | All card text left aligned, the orb centred in its own well above a hairline. States read as two labelled rows, When and Drives. Copy cut to one idea per line |
| Ten sliders in a flat grid | Three groups (Field, Motion and voice, Grade) of four, four and two, each with one line of explanation, in a white card |
| Sliders hard to understand | An info tip on every slider and every level band: hover, focus or tap shows one or two sentences |
| The levels box was mostly empty, and froze when the stage scrolled away | A sticky preview beside the sliders: the stage's orb again, fed by a twin reader of the same voice, so a slider's effect is in view. Levels underneath in evenly spaced rows, each with its number |
| Nothing marked what was chosen | The chosen type and palette lift to a white card with a "Chosen" tag |
| How it works was five uneven cards | Icon chips, and a sixth tile onward, so the grid is three by two |

| Tried | What happened | Fix |
|-------|---------------|-----|
| The info button inside each slider's label | A label names its first control, so the button would have taken the slider's name | Each slider got an explicit label tied to it by id; every slider checked to have exactly one |
| Four control groups in one row on the stage | They did not fit, and each tab track wrapped mid-group | Two by two, each track at its own width |
| One voice source for the stage and the preview | A source keeps its own clock, so two orbs reading it would run it at double speed | `twin()` on each source: a second reader of the same voice, in step |
| Tooltips on a 375 px phone | Bubbles near the right edge ran 13 px past the screen, clipped | The tip measures itself when it opens and slides back inside |
| A "centre the first thing in a card" rule | Would have centred step numbers too | Centre only real media: a VoiceOrb, whose root carries data-state |

Checked at 1440 px and 375 px, light and dark; no sideways scrolling, and the production
build passes.

## 9. Idle, then Play: zoom, speed, pulse

At rest the orb should keep moving, slowly; on Play it should zoom in a little, speed up,
then pulse with the audio, and ease back on pause.

**On Play, a sequence rather than a cut:**

| Beat | When | How |
|------|------|-----|
| Zoom | At once, about 400 ms | CSS: the stage orb's wrapper scales to 1.06 with an ease-out |
| Speed | After 0.25 s | The engine holds the drift for a moment, then eases it to talking's faster speed |
| Pulse | Fades in from 0.45 s to 1.1 s | The voice's bands are multiplied by a smoothstep of the time since talking began, so rings, fluid and breathing arrive last |
| Breathing | While talking | The ball rests a little smaller (0.94) and the voice's level grows it by up to 0.05, so it zooms in and out with the speech |

Pause or the clip ending eases all of it back. Under reduced motion there is no zoom.

| Tried | What happened | Why, and the fix |
|-------|---------------|------------------|
| Zoom inside the shader, by resting the ball smaller | Anything drawn behind the canvas would show around a smaller ball | The zoom is CSS on the whole orb; the shader only does the breathing |
| Sampling the zoom on the first try | It read 1.0 all the way | The script had picked the wrong element; on the orb's wrapper it eased 1.034 at 100 ms, 1.056 at 250 ms, 1.06 by 400 ms |
| Levels with a real clip | A first window read nearly zero | The clip had restarted; over a full play they averaged 0.43 bass and peaked at 0.98, as tuned |

## 10. Open source: a voice for every click, and the page as the docs

The orb was ready to share, so the page became its home: anything that was only
scaffolding came out, and what someone needs to understand it, try it with their own
audio and take the code went in.

**Motion people notice.** At rest the drift ran at 0.28 field units a second, which
people who weren't looking for it read as still. It is now 0.42 (`DRIFT_RATE`), talking
drifts at 2.4 times that (was 1.6) and listening at 1.3 (was 0.7), so Play is a change
you can't miss. The heard bands now follow the audio with a fast attack and a slower
release (24 and 7 a second) on top of the analyser's own, so the inside flows instead of
flickering.

**The microphone moves the inside too.** Listening used to read only the caller's overall
level: the ball drew in, but nothing inside moved. Now the caller's four bands drive the
same rings, highlight and fluid as a talking voice, at 0.8 strength, and the fluid's
splats push inward (`pull`) instead of out, so listening reads as drawing in rather than
speaking backwards.

**A voice on the first click.** Play needs something real to play, with nothing to
choose first. The default is a minute of John F. Kennedy's 1962 "We choose to go to the
Moon" speech at Rice University: a US government recording, public domain, from the JFK
Presidential Library via Wikimedia Commons. It was cut around its landmarks, the
laughter after "Why does Rice play Texas?" and the applause after "…and the others,
too", found by measuring how noise-like and how steady each half second is (applause is
flat and has no gaps; speech has both), then checked on a waveform. It is loudness
normalised to -16 LUFS: 59 seconds, 715 KB.

**Four ways to give it a voice**, in one panel under the orb:

| Source | How it is heard |
|--------|-----------------|
| Sample | The speech above, through an `<audio>` element and an analyser |
| Your file | Choose or drop any file the browser plays (MP3, WAV, M4A, OGG, FLAC, WebM); it becomes an object URL and never leaves the device. Dropping anywhere on the stage works |
| Link | A direct audio link is fetched into an object URL, which works when its host allows other pages to read it (CORS); otherwise the page says so. A YouTube link plays in YouTube's own player |
| Microphone | The orb listens |

**YouTube can't be heard by a page.** Its player is another site's frame, so neither its
sound nor its media element is reachable. The one honest way is to ask the browser to
share this tab's own audio (`getDisplayMedia` with `preferCurrentTab`, Chrome and Edge on
a computer), which includes the embed's sound. The orb asks on the first Play; if the
share is declined or unsupported it says so and simulates a voice instead of pretending.
The link field's example is Steve Jobs at Stanford, from 0:33. It is only a link: the
speech is copyrighted, so no copy of it is in the repository.

**The page as the docs.** New sections: how the orb is built, four live tiles that add
one layer each (a flat colour field, wrapped on a sphere, drifting, moved by a voice) and
the path from a voice to the colour; and how to use it, three ways (run it, copy the
files in, or ask Claude with the skill in `plugin/`) with the component's props and its
files. The nav links to the repository with its live star count, read from GitHub's API
in the visitor's browser and kept for ten minutes, since GitHub allows sixty unsigned
requests an hour.

| Tried | What happened | Fix |
|-------|---------------|-----|
| Transcribing the speech on the Mac to find the famous line | macOS stopped the command-line tool: speech recognition needs a permission a script can't ask for | Found it by its crowd noise instead (above) |
| The new stylesheet | Turbopack failed to build the page | `composes` again, twice: once on a selector list (`.a, .b`), once on a descendant (`.a span`). It is only allowed on a single class |
| The three ways side by side | Code lines ran under the copy button and scrolled | One full-width row per way, the description beside the code |
| Typing "not a link" and pressing Load | The browser's own URL check answered, not the page | `noValidate` on the form, so the page's message says what is wrong |
| Phone width, a long YouTube title | Cut to "Steve Job…" | Titles wrap on small screens |

Checked: the sample plays and drives the levels (bass mean 0.42, peaks near 0.9); a
dropped file switches to Your file and plays; a direct link loads, a blocked host shows
its message; the YouTube example plays from 0:33 with the simulated fallback where tab
sharing is blocked. The tab share itself and the microphone need a real browser to try.

## 11. A clearer default voice

The Moon speech worked, but it was the wrong signal: a 1962 hall recording, with room
echo, laughter and applause. The orb moved as much for the crowd as for the words, and
its rhythm got lost. The default needed to be one person talking, close to the mic.

**The new clip** is a minute about the orb itself, written for it ("Hi. What you're
looking at is a voice orb, and right now, it's moving with my voice…"), read by an AI
voice, over a pad quiet enough to hear only in the pauses. `scripts/sample/make-sample.mjs`
makes it from start to finish. It stays in the private repository, since it calls
ElevenLabs with your key.

| Part | How |
|------|-----|
| Voice | ElevenLabs text to speech, `eleven_multilingual_v2`, the built-in voice Chris ("charming, down-to-earth"): conversational, and not the reel's voice. Stability 0.5, speed 0.96 |
| Music | Synthesised by ffmpeg, so it has no licence of its own: two soft chords (A major nine, F sharp minor nine) crossfading every 16 s. Each note is a pair of sines a few cents apart with its own slow swell, low-passed at 1.4 kHz, with a wide echo for room |
| Mix | The music starts 1.6 s early and rings 3.2 s after. It sits about 18 dB under the voice in the pauses and ducks further while the voice speaks (a sidechain compressor keyed by the voice). Normalised to about -18 LUFS: 54 s, 866 KB |

Measured in the orb's four bands, each band now swings 29 to 81 dB between pause and
speech. The old clip swung 20 to 33. So the orb pulses on the words and settles in the
gaps, instead of churning with the room.

| Tried | What happened | Fix |
|-------|---------------|-----|
| A library voice ("Jerry B, realistic and conversational") | The API refused it: free accounts can't use library voices through the API | A built-in voice |
| The music 12 dB under the voice | Plain in every pause | Another 6 dB down, about 18 dB under, plus the ducking |
| Checking the meters live | They read zero | The browser pane was hidden, so no frames were drawn. The clip played, and the bands were measured offline instead |

**A licence note.** The account is on ElevenLabs' free plan, whose audio is for
non-commercial use and must credit ElevenLabs. So the sample row says "Voice:
elevenlabs.io", and the README says the clip isn't covered by the MIT licence. A paid
plan, or a recording of your own, removes both.

## 12. Credit, the licence everywhere, and a joined-up flow

**Credit.** The page says "Built by UV" under the header and in the footer, linked to
GitHub until there's an X profile (`ORB_AUTHOR` in `src/data/orb.ts`), next to a link
to the MIT licence. The sample row is now just its title, "A voice orb, explained", with
the line under it.

**The licence, so the credit travels.** MIT asks for one thing: keep the copyright and
licence notice in every copy. So the notice goes where copies come from:

| Where | What |
|-------|------|
| `LICENSE` | `Copyright (c) 2026 UV (https://github.com/imuvrays1/voice-orb)` |
| The top of every source file | A three-line `/*!` notice: Voice orb by UV, the repository, the copyright, MIT. The `!` tells minifiers to keep it, so it survives into production bundles |
| `package.json` | Author, homepage, repository and issues |
| README | "by UV" under the title, a Credit section with the notice to keep, and a polite ask for a visible credit |
| The skill, renamed `voice-orb-by-uv` | It says "Voice orb by UV" when it starts, keeps the notice in every file it copies, copies `LICENSE` beside them, and ends with the credit line |

MIT can't require a visible credit in someone's product, only the notice in the code, so
the README asks for one instead of demanding it.

**The flow from a voice to the colour.** On a phone, each step drew its own short line
with a dot hanging off its edge, so the path broke between steps. Now each step draws a
numbered node and one line to the next node. That reads as a single timeline, across on a
wide screen and down on a phone.

| Tried | What happened | Fix |
|-------|---------------|-----|
| Screenshots in the browser pane | Blank below the stage | The pane was in the background and not painting. Took them with headless Chrome over its debugging protocol instead, clipped to each element |
| The page's class list | It read `page undefined` on the light ground | Only the dark ground has a class; the light ground now adds none |

## 13. Going public

The lab where all this was built stays private, and the open-source repository,
[imuvrays1/voice-orb](https://github.com/imuvrays1/voice-orb), starts with one clean
commit. A copy, not the lab's history, because history keeps everything: a file deleted
in a later commit is still one `git checkout` away. Starting fresh means only what is
meant to be public was ever in it.

An export script copies the lab's committed files into the public clone, leaving out
the private ones, and drops the dependencies only they used. Updates go the same way:
commit in the lab, export, commit and push in the public copy.

Before the first push, a last check:

| Check | Why |
|-------|-----|
| The export changes nothing | The public copy matches the lab's latest commit |
| No private paths, no keys | A pushed secret has to be revoked, not just deleted |
| The repository name is free, and the push uses the owner's account | The star count and every link already point at it |

## 14. A live page on GitHub Pages

The page is now live at [imuvrays1.github.io/voice-orb](https://imuvrays1.github.io/voice-orb/),
hosted by GitHub Pages and rebuilt by a workflow on every push to `main`.

**Why it works as plain files.** Pages serves files and nothing else: no server code runs.
This page never needed any. Every route is prerendered, and everything that moves
(WebGL, Web Audio, the star count) runs in the browser. So `next build` with
`output: "export"` writes it all to `out/` as HTML, JavaScript and the clip.

**The folder.** A project's Pages site lives under its repository's name,
`/voice-orb/`, not at the root. Next's `basePath` prefixes its own links and scripts.
The sample's path is a plain string, so it doesn't get the prefix on its own, and the
config hands the prefix to the page as `NEXT_PUBLIC_BASE_PATH`.

All of this happens only when the workflow sets `PAGES_BASE_PATH`. That way
`pnpm dev` and `pnpm build` on your machine still run at the root, and a fork gets its
own folder name without editing anything.

| Tried | What happened | Fix |
|-------|---------------|-----|
| Checking the export before pushing | Built in a clean copy with `--frozen-lockfile`, as the workflow does, then served `out/` under `/voice-orb/` | Nothing failed to load, there were no console errors, and Play found the clip at `/voice-orb/audio/voice-orb.mp3` |
| Running the workflow in the private lab | Pages on a private repository needs a paid plan, so the deploy would fail on every push | The build job skips private repositories |

## 15. A pass on the phone, and Openfile

**Balance.** On a phone, buttons and choices sized to their words leave rows of
uneven lengths, and small targets for a thumb. Each fix gives a row equal shares of the
width:

| Where | Before | After |
|-------|--------|-------|
| The header's two actions | Each as wide as its words, one under the other | Full width, 48px tall |
| Tune's Reset and Copy | An outlined button beside a bare word | Two outlined halves |
| Voice, type, ground, state | A row that wrapped wherever the words ran out: Microphone alone, Halftone alone | A grid of equal cells, two across |
| Code in "Use it" | Long lines showed through the copy button and out past it | The well's colour over its corner, with a short fade |

**Touch.** Phones have no hover, so a tap leaves `:hover` stuck on whatever was
tapped. Every hover style now sits behind `(hover: hover) and (pointer: fine)`, and
the play button no longer stays pinned over the orb after a tap.

| Tried | What happened | Fix |
|-------|---------------|-----|
| The browser's own tap feedback | A grey-blue flash over everything tapped | Turned off; each control has its own pressed state |
| Small targets | Sliders 20px tall, info and copy icons 20–28px | On touch screens: 32px sliders with a bigger dot, and invisible padding around the icons |
| The link field | 14px text, which iOS zooms into on focus and leaves zoomed | 16px on touch screens |
| A Templates link in the nav | It squeezed "Voice orb" onto two lines | The name never wraps; the arrow drops under 390px and the link under 340px |

**Openfile.** Openfile is UV's shop of Framer templates. It gets two quiet spots:
"Templates ↗" in the nav, and one card at the very end, after the engine notes, so it
never stands between a reader and the orb. Both links carry UTM tags, with
`utm_content` set to `nav` or `banner`, so Openfile's analytics can tell the two
apart.

Emulating a phone in a desktop browser can't show sticky hover, the tap flash or input
zoom. Those need a real phone to confirm.

## 16. Next

Ideas, roughly in the order they would teach the most:

1. **Tune the fluid by ear** with more real recordings, now that the microphone stirs it
   too.
2. **Painted artwork mode**: paint or generate our own ball images and run them through
   the `artwork` shader, to compare painting against palette.
3. **A real voice agent** driving the states end to end (connecting, listening, talking).
4. **Performance on low-end phones**: frame times, a lower-resolution path, an
   OffscreenCanvas worker.
5. **Packaging `VoiceOrb`** as an npm package with a documented API.
