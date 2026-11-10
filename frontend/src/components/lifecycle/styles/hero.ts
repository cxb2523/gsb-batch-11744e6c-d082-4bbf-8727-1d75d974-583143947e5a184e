import { C, MOTION, focusRing } from '../tokens';

export const heroCss = `
      /* ---- the hero ---- */
      /* A white surface card, the same language as every other panel on the screen
         (and the rest of GRID). It states where the project stands; it does not try
         to be a different, darker product sitting on top of the app. */
      .lc-hero {
        position: relative;
        padding: 22px 24px;
        border-radius: 14px;
        color: ${C.text};
        background: ${C.surface};
        border: 1px solid #E6E9F0;
        box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 10px 28px -18px rgba(16, 24, 40, 0.35);
      }
      .lc-hero-top { display: flex; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
      .lc-hero-eyebrow {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        color: ${C.textMuted};
      }
      .lc-hero-title { margin: 6px 0 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.2; color: ${C.text}; }
      .lc-hero-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin: 8px 0 0;
        font-size: 13px;
        color: ${C.textSubtle};
      }
      .lc-hero-dot { width: 3px; height: 3px; border-radius: 50%; background: ${C.textDisabled}; }
      .lc-hero-tag {
        display: inline-flex;
        align-items: center;
        height: 19px;
        padding: 0 8px;
        border-radius: 5px;
        border: 1px solid ${C.accentSoftBorder};
        background: ${C.accentSoft};
        color: ${C.accent};
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
      }
      .lc-hero-momentum { margin: 10px 0 0; font-size: 13px; color: ${C.textMuted}; }
      .lc-hero-score { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-left: auto; }
      .lc-hero-percent { font-size: 34px; font-weight: 700; line-height: 1; letter-spacing: -1px; font-variant-numeric: tabular-nums; color: ${C.text}; }
      .lc-hero-percent span { font-size: 16px; font-weight: 600; margin-left: 2px; color: ${C.textMuted}; }
      .lc-hero-left { font-size: 12px; color: ${C.textSubtle}; }

      /* Edit Stages: a quiet secondary button, same as buttons elsewhere on the screen. */
      .lc-ghost-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 12px;
        border: 1px solid ${C.border};
        border-radius: 8px;
        background: ${C.surface};
        color: ${C.textBody};
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color ${MOTION.fast}, border-color ${MOTION.fast};
      }
      .lc-ghost-btn:hover:not(:disabled) { background: ${C.surfaceSunken}; border-color: ${C.borderStrong}; }
      .lc-ghost-btn:focus-visible { outline: none; box-shadow: ${focusRing}; }
      .lc-ghost-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      /* One segment per stage: the shape of the whole run, and a way to jump to it. */
      .lc-hero-bar { display: flex; gap: 3px; margin: 20px 0 0; }
      .lc-seg {
        position: relative;
        flex: 1;
        min-width: 0;
        height: 8px;
        padding: 0;
        border: none;
        border-radius: 999px;
        cursor: pointer;
        transition: transform ${MOTION.fast}, filter ${MOTION.fast};
      }
      .lc-seg:hover { transform: scaleY(1.45); filter: brightness(1.05); }
      .lc-seg:focus-visible { outline: none; box-shadow: ${focusRing}; }
      .lc-seg.is-selected { transform: scaleY(1.45); }
      .lc-seg.is-current::after {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 999px;
        border: 1.5px solid ${C.accent};
        animation: lcSegPulse 2.2s ease-out infinite;
      }
      /* A checkpoint on the run, marked above its segment. */
      .lc-seg-pin {
        position: absolute;
        top: -9px;
        left: 50%;
        width: 4px;
        height: 4px;
        margin-left: -2px;
        border-radius: 50%;
        background: ${C.warningDot};
      }
      @keyframes lcSegPulse { 0% { opacity: 0.8; } 70% { opacity: 0.1; } 100% { opacity: 0.8; } }

      .lc-hero-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 16px;
        margin: 18px 0 0;
        padding-top: 16px;
        border-top: 1px solid ${C.divider};
      }
      .lc-hero-stat-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: ${C.textMuted};
      }
      .lc-hero-stat-value {
        margin: 3px 0 0;
        font-size: 15px;
        font-weight: 600;
        color: ${C.text};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

`;
