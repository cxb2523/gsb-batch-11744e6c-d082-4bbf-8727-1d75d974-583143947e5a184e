import { C, MOTION, RADIUS } from '../tokens';

export const panelsCss = `
      /* ---- panels ---- */
      .lc-card {
        background: ${C.surface};
        border: 1px solid #E6E9F0;
        border-radius: 14px;
        box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 10px 28px -18px rgba(16, 24, 40, 0.35);
      }
      .lc-card-head {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 18px;
        border-bottom: 1px solid ${C.divider};
      }
      .lc-card-title { margin: 0; font-size: 15px; font-weight: 700; color: ${C.text}; letter-spacing: -0.1px; }
      .lc-card-body { padding: 18px; }

      /* State as a segmented control: every option visible, one click to move. */
      .lc-states { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: ${C.surfaceSunken}; flex-wrap: wrap; }
      .lc-state-opt {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 11px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: ${C.textSubtle};
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color ${MOTION.fast}, color ${MOTION.fast};
      }
      .lc-state-opt:hover:not(:disabled) { background: rgba(9, 30, 66, 0.06); color: ${C.text}; }
      .lc-state-opt:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-state-opt:disabled { cursor: not-allowed; opacity: 0.6; }
      .lc-state-opt[aria-pressed="true"] { background: ${C.surface}; color: ${C.text}; box-shadow: 0 1px 2px rgba(9, 30, 66, 0.16); }
      .lc-state-swatch { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

      /* A round, on-brand checkbox: the native one looks borrowed. */
      .lc-check {
        position: relative;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        border: 1.5px solid ${C.borderStrong};
        border-radius: 7px;
        background: ${C.surface};
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: transparent;
        transition: background-color ${MOTION.fast}, border-color ${MOTION.fast}, color ${MOTION.fast};
      }
      .lc-check:hover:not(:disabled) { border-color: ${C.accent}; }
      .lc-check:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-check[aria-checked="true"] { background: #22A06B; border-color: #22A06B; color: #FFFFFF; }
      .lc-check:disabled { cursor: not-allowed; opacity: 0.6; }

      /* A date that sits in a line of facts rather than in a form. */
      .lc-inline-date {
        height: 30px;
        margin-top: 2px;
        padding: 0 6px;
        border: 1px solid transparent;
        border-radius: ${RADIUS.md}px;
        background: transparent;
        color: ${C.text};
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color ${MOTION.fast}, border-color ${MOTION.fast};
      }
      .lc-inline-date:hover:not(:disabled) { background: ${C.surface}; border-color: ${C.border}; }
      .lc-inline-date:focus { outline: none; background: ${C.surface}; border-color: ${C.accent}; box-shadow: 0 0 0 1px ${C.accent}; }
      .lc-inline-date:disabled { opacity: 0.6; cursor: not-allowed; }
      /* Empty reads as an invitation rather than as a blank. */
      .lc-inline-date:invalid, .lc-inline-date:not(:focus):placeholder-shown { color: ${C.textMuted}; }

      .lc-meter { height: 6px; border-radius: 999px; background: ${C.divider}; overflow: hidden; }
      /* Filled with a transform rather than a width, so ticking a module off does
         not make the browser re-lay-out the card to animate a 6px bar. */
      .lc-meter span {
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #36B37E, #22A06B);
        transform: scaleX(var(--lc-fill, 0));
        transform-origin: left center;
        transition: transform 400ms ease;
      }

`;
