import { C, LAYER, MOTION, RADIUS } from '../tokens';

export const dockCss = `
      /* ---- the dock on the right ---- */
      /* A sidebar on the app, mirroring the menu on the left: full height, flush to
         the edge, and the route keeps its own column rather than being covered. */
      .lc-dock {
        position: sticky;
        top: 0;
        align-self: start;
        /* The app's top bar is 56px and this sits under it, inside the scroll pane. */
        height: calc(100vh - 56px);
        display: flex;
        flex-direction: column;
        min-width: 0;
        background: ${C.surface};
        border-left: 1px solid #E3E7EF;
        box-shadow: -14px 0 32px -26px rgba(16, 24, 40, 0.5);
        animation: lcDock 200ms ease both;
      }
      .lc-dock-head {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 18px 20px 14px;
        border-bottom: 1px solid ${C.divider};
      }
      .lc-dock-body { flex: 1; overflow-y: auto; padding: 20px; scrollbar-width: thin; }
      .lc-dock-body::-webkit-scrollbar { width: 8px; }
      .lc-dock-body::-webkit-scrollbar-thumb { background: #DFE1E6; border-radius: 999px; }
      @keyframes lcDock { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }

      /* Too narrow to give the dock a column of its own: it covers the page instead.
         Still sticky rather than fixed, so it keeps sitting under the app's top bar
         without this stylesheet having to know how tall that bar is. */
      @media (max-width: 1160px) {
        .lc-backdrop.is-docked { grid-template-columns: minmax(0, 1fr); }
        .lc-page, .lc-dock { grid-area: 1 / 1; }
        .lc-dock {
          justify-self: end;
          width: min(440px, 100%);
          z-index: ${LAYER.popover};
        }
      }

      /* How much a stage has on it, without opening it. */
      /* Streams inside a stage: Build runs Frontend and Backend side by side, each
         with its own remarks and documents. */
      .lc-tabs { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: ${C.surfaceSunken}; }
      .lc-tab {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex: 1;
        height: 32px;
        padding: 0 12px;
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
      .lc-tab:hover { color: ${C.text}; }
      .lc-tab:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-tab[aria-selected="true"] { background: ${C.surface}; color: ${C.text}; box-shadow: 0 1px 2px rgba(9, 30, 66, 0.16); }
      .lc-tab-count {
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: ${RADIUS.pill}px;
        background: ${C.surfaceSunken};
        color: ${C.textSubtle};
        font-size: 11px;
        font-weight: 700;
        line-height: 18px;
        font-variant-numeric: tabular-nums;
      }
      .lc-tab[aria-selected="true"] .lc-tab-count { background: ${C.accentSoft}; color: ${C.accent}; }

      /* A module's name, which is also how you rename it: a line of text until you
         click it, so the list does not look like a form. */
      .lc-rename {
        display: block;
        width: 100%;
        padding: 7px 6px 0 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        text-align: left;
        cursor: text;
        overflow-wrap: anywhere;
      }
      .lc-rename:hover:not(:disabled) { text-decoration-line: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
      .lc-rename:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; border-radius: 4px; }
      .lc-rename:disabled { cursor: not-allowed; }
      .lc-input--sm { height: 32px; font-size: 14px; margin-top: 3px; }

      /* A linked ticket, shown as evidence under the module it belongs to. */
      .lc-ticket-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 320px;
        padding: 2px 9px;
        border: 1px solid ${C.border};
        border-radius: ${RADIUS.pill}px;
        background: ${C.surface};
        font-size: 11.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lc-ticket-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .lc-menu--tickets { min-width: 340px; }
      .lc-menu-item--ticket { height: auto; min-height: 36px; padding: 6px 8px; }

`;
