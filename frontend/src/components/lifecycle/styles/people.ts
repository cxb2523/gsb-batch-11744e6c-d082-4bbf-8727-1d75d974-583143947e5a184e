import { C, MOTION, RADIUS } from '../tokens';

export const peopleCss = `
      /* ---- people on a stage ---- */
      .lc-people {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 8px 0 4px;
        border: 1px solid transparent;
        border-radius: ${RADIUS.pill}px;
        background: transparent;
        color: ${C.textSubtle};
        font: inherit;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: background-color ${MOTION.fast}, border-color ${MOTION.fast};
      }
      .lc-people:hover:not(:disabled) { background: ${C.surfaceSunken}; border-color: ${C.border}; }
      .lc-people:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-people:disabled { opacity: 0.6; cursor: not-allowed; }
      .lc-people.is-empty { padding: 0 10px; border-style: dashed; border-color: ${C.borderStrong}; color: ${C.textMuted}; }
      .lc-people-name { overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
      /* Overlapped faces, each ringed so the stack still reads as separate people. */
      .lc-faces { display: inline-flex; align-items: center; }
      .lc-faces > * { margin-left: -6px; box-shadow: 0 0 0 2px ${C.surface}; border-radius: 50%; }
      .lc-faces > *:first-child { margin-left: 0; }
      .lc-face-more {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 5px;
        border-radius: ${RADIUS.pill}px;
        background: ${C.surfaceSunken};
        color: ${C.textSubtle};
        font-size: 11px;
        font-weight: 700;
      }

      .lc-menu--wide { min-width: 250px; padding: 0; }
      .lc-menu-search {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 10px;
        border-bottom: 1px solid ${C.divider};
        color: ${C.textMuted};
      }
      .lc-menu-search input {
        flex: 1;
        min-width: 0;
        height: 38px;
        border: none;
        background: transparent;
        color: ${C.text};
        font: inherit;
        font-size: 13px;
        outline: none;
      }
      .lc-menu-list { display: block; max-height: 230px; overflow-y: auto; padding: 4px; }
      .lc-menu--wide .lc-menu-item { width: 100%; height: 36px; }
      .lc-menu-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        border-top: 1px solid ${C.divider};
      }
      .lc-tick {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 17px;
        height: 17px;
        flex-shrink: 0;
        border: 1.5px solid ${C.borderStrong};
        border-radius: 5px;
        color: transparent;
        transition: background-color ${MOTION.fast}, border-color ${MOTION.fast}, color ${MOTION.fast};
      }
      .lc-tick.is-on { background: ${C.accent}; border-color: ${C.accent}; color: #FFFFFF; }

      /* Finish this stage and start the next. Solid green and sized to be seen:
         it is the one action people come to a station card to take. */
      .lc-next-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: #22A06B;
        color: #FFFFFF;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(34, 160, 107, 0.45);
        transition: background-color ${MOTION.fast}, box-shadow ${MOTION.fast}, transform ${MOTION.fast};
      }
      .lc-next-btn:hover:not(:disabled) {
        background: #1F845A;
        box-shadow: 0 4px 12px rgba(31, 132, 90, 0.55);
        transform: scale(1.08);
      }
      .lc-next-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px ${C.focus}; }
      .lc-next-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }

      /* The move itself, shaped like the road: what you are finishing on the left,
         where it takes the project on the right. The app's blue primary, so it reads
         as the one action to take — no caption needed. */
      .lc-advance {
        position: relative;
        overflow: hidden;
        display: inline-flex;
        align-items: stretch;
        max-width: min(100%, 580px);
        height: 40px;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: ${C.accent};
        font: inherit;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(9, 30, 66, 0.12);
        transition: background-color ${MOTION.fast}, box-shadow ${MOTION.fast};
      }
      .lc-advance:hover:not(:disabled) { background: ${C.accentHover}; box-shadow: 0 4px 12px rgba(9, 30, 66, 0.18); }
      .lc-advance:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(76, 154, 255, 0.5); }
      .lc-advance:disabled { opacity: 0.6; cursor: not-allowed; }

      .lc-advance-main {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 0 16px;
        color: #FFFFFF;
        font-size: 13.5px;
        font-weight: 700;
        letter-spacing: -0.1px;
      }
      .lc-advance-tick {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.22);
        color: #FFFFFF;
      }
      .lc-advance-next {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        /* The destination is the point of the button, so the left half gives way first. */
        max-width: 46%;
        flex-shrink: 0;
        padding: 0 16px 0 12px;
        border-left: 1px solid rgba(255, 255, 255, 0.28);
        background: rgba(255, 255, 255, 0.12);
        color: #EAF2FF;
        font-size: 12.5px;
        font-weight: 600;
      }
      .lc-advance-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lc-advance-arrow { flex-shrink: 0; transition: transform ${MOTION.base}; }
      .lc-advance:hover:not(:disabled) .lc-advance-arrow { transform: translateX(3px); }
      /* A checkpoint waiting at the other end gets its pin, like the progress bar. */
      .lc-advance-pin { width: 5px; height: 5px; border-radius: 50%; background: #FFC400; flex-shrink: 0; }

      .lc-ring { transition: stroke-dashoffset 700ms ease; }

      @keyframes lcPop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      @keyframes lcSlide { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }
      @keyframes lcHalo { 0% { transform: scale(1); opacity: 0.5; } 70% { transform: scale(1.5); opacity: 0; } 100% { opacity: 0; } }
      @keyframes lcLane { to { stroke-dashoffset: -24; } }
      @keyframes lcWave {
        0%, 100% { transform: skewY(0deg) scaleX(1); }
        35% { transform: skewY(-3.5deg) scaleX(0.94); }
        70% { transform: skewY(2.5deg) scaleX(1.02); }
      }
      @keyframes lcSpark {
        0% { box-shadow: 0 0 0 0 rgba(255, 171, 0, 0.55), 0 2px 6px rgba(9, 30, 66, 0.18); }
        70% { box-shadow: 0 0 0 14px rgba(255, 171, 0, 0), 0 2px 6px rgba(9, 30, 66, 0.18); }
        100% { box-shadow: 0 0 0 4px rgba(255, 171, 0, 0.18), 0 2px 6px rgba(9, 30, 66, 0.18); }
      }

      .lc-rows { display: flex; flex-direction: column; gap: 6px; }
      .lc-row {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px;
        border-radius: ${RADIUS.md}px;
        transition: background-color ${MOTION.fast};
      }
      .lc-row:hover { background: ${C.surfaceSunken}; }
      .lc-row--dragging { opacity: 0.45; }
      .lc-row[draggable="true"] .lc-grip { cursor: grab; }
      .lc-row-actions { opacity: 0; transition: opacity ${MOTION.fast}; }
      .lc-row:hover .lc-row-actions, .lc-row:focus-within .lc-row-actions { opacity: 1; }
      @media (hover: none) { .lc-row-actions { opacity: 1; } }

      .lc-input {
        width: 100%;
        height: 40px;
        padding: 0 12px;
        border: 1px solid ${C.borderStrong};
        border-radius: ${RADIUS.md}px;
        background: ${C.surface};
        color: ${C.text};
        font: inherit;
        font-size: 14px;
        outline: none;
        transition: border-color ${MOTION.fast}, box-shadow ${MOTION.fast};
      }
      .lc-input::placeholder { color: ${C.textMuted}; }
      .lc-input:hover { border-color: #C1C7D0; }
      .lc-input:focus { border-color: ${C.accent}; box-shadow: 0 0 0 1px ${C.accent}; }
      textarea.lc-input { height: auto; padding: 8px 12px; line-height: 1.5; resize: vertical; }

      .lc-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 40px;
        padding: 0 14px;
        border: 1px solid ${C.border};
        border-radius: ${RADIUS.md}px;
        background: ${C.surface};
        color: ${C.textBody};
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: background-color ${MOTION.fast};
      }
      .lc-btn:hover:not(:disabled) { background: ${C.surfaceSunken}; }
      .lc-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .lc-btn--primary { background: ${C.accent}; border-color: ${C.accent}; color: #FFFFFF; font-weight: 600; }
      .lc-btn--primary:hover:not(:disabled) { background: ${C.accentHover}; }
      .lc-btn--sm { height: 32px; padding: 0 10px; font-size: 13px; }

      .lc-icon-btn {
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border: none;
        border-radius: ${RADIUS.md}px;
        background: transparent;
        color: ${C.textSubtle};
        cursor: pointer;
        transition: background-color ${MOTION.fast}, color ${MOTION.fast};
      }
      .lc-icon-btn:hover:not(:disabled) { background: #EBECF0; color: ${C.text}; }
      .lc-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-icon-btn:disabled { color: ${C.textDisabled}; cursor: not-allowed; }

`;
