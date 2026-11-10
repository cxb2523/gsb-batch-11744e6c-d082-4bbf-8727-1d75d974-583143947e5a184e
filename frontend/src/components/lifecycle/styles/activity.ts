import { C } from '../tokens';

export const activityCss = `
      /* ---- activity ---- */
      .lc-trail { list-style: none; margin: 0; padding: 0; }
      .lc-trail-day {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        color: ${C.textMuted};
      }
      .lc-trail-group { position: relative; padding: 0 0 4px 26px; }
      /* The hairline the entries hang from, stopping at the last dot. */
      .lc-trail-group::before {
        content: '';
        position: absolute;
        left: 9px;
        top: 6px;
        bottom: 14px;
        width: 1px;
        background: ${C.divider};
      }
      .lc-trail-item { position: relative; padding: 0 0 14px; }
      .lc-trail-item::before {
        content: '';
        position: absolute;
        left: -21px;
        top: 5px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: ${C.surface};
        border: 2px solid ${C.borderStrong};
      }
      .lc-trail-item.is-move::before { border-color: ${C.accent}; }
      .lc-scroll { max-height: 520px; overflow-y: auto; scrollbar-width: thin; }
      .lc-scroll::-webkit-scrollbar { width: 8px; }
      .lc-scroll::-webkit-scrollbar-thumb { background: #DFE1E6; border-radius: 999px; }

`;
