import { C, MOTION, RADIUS, SHADOW } from '../tokens';

export const stateMenuCss = `
      /* ---- the state menu on a card ---- */
      .lc-menu-wrap { position: relative; display: inline-flex; }
      .lc-state-trigger {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 22px;
        padding: 0 7px;
        border: none;
        border-radius: ${RADIUS.pill}px;
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: filter ${MOTION.fast};
      }
      .lc-state-trigger:hover:not(:disabled) { filter: brightness(0.95); }
      .lc-state-trigger:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-state-trigger:disabled { opacity: 0.6; cursor: not-allowed; }
      .lc-menu {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 50;
        min-width: 168px;
        display: flex;
        flex-direction: column;
        padding: 4px;
        border: 1px solid ${C.border};
        border-radius: ${RADIUS.lg}px;
        background: ${C.surface};
        box-shadow: ${SHADOW.overlay};
        animation: lcEnter 120ms ease both;
      }
      .lc-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 32px;
        padding: 0 8px;
        border: none;
        border-radius: ${RADIUS.md}px;
        background: transparent;
        color: ${C.textBody};
        font: inherit;
        font-size: 13px;
        text-align: left;
        cursor: pointer;
      }
      .lc-menu-item:hover { background: ${C.surfaceSunken}; color: ${C.text}; }
      .lc-menu-item:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-menu-item[aria-checked="true"] { color: ${C.text}; font-weight: 600; }

`;
