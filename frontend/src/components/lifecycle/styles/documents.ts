import { C, FONT_MONO, MOTION, RADIUS } from '../tokens';

export const documentsCss = `
      /* ---- a document in the list ---- */
      /* Roomier than a plain row: what is listed is something someone has to find
         again later, so it gets a real hit area and says what it is. */
      .lc-doc {
        align-items: center;
        gap: 12px;
        padding: 8px 10px;
        border: 1px solid transparent;
        border-radius: ${RADIUS.lg}px;
        transition: background-color ${MOTION.fast}, border-color ${MOTION.fast};
      }
      .lc-doc:hover { background: ${C.surfaceSunken}; border-color: ${C.border}; }
      .lc-doc-tile {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        flex-shrink: 0;
        border-radius: 10px;
      }
      /* The extension reads faster than a drawing of a page. */
      .lc-doc-tile--type { font-size: 10px; font-weight: 800; letter-spacing: 0.4px; }
      /* A picture is its own label. */
      .lc-doc-thumb {
        width: 38px;
        height: 38px;
        flex-shrink: 0;
        border-radius: 10px;
        object-fit: cover;
        background: ${C.surfaceSunken};
        border: 1px solid ${C.border};
      }
      .lc-doc-name {
        display: -webkit-box;
        width: 100%;
        padding: 0;
        border: none;
        background: none;
        color: ${C.text};
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
        /* Two lines then an ellipsis, so a long filename never breaks the row. */
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .lc-doc-name:hover { color: ${C.accent}; text-decoration: underline; }
      .lc-doc-name:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; border-radius: 3px; }
      .lc-doc-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 3px;
        font-size: 11px;
        color: ${C.textMuted};
        white-space: nowrap;
        overflow: hidden;
      }
      .lc-doc-date {
        flex-shrink: 0;
        padding: 1px 6px;
        border-radius: 4px;
        background: ${C.surfaceSunken};
        color: ${C.textBody};
        font-size: 11px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .lc-doc:hover .lc-doc-date { background: ${C.surface}; }
      .lc-doc-meta > span { overflow: hidden; text-overflow: ellipsis; }
      .lc-doc-sep { width: 3px; height: 3px; border-radius: 50%; background: #C1C7D0; flex-shrink: 0; }

      /* Rendered Markdown, kept readable rather than styled to death. */
      .lc-prose { font-size: 14px; line-height: 1.65; color: ${C.textBody}; }
      .lc-prose h1, .lc-prose h2, .lc-prose h3 { color: ${C.text}; line-height: 1.3; margin: 1.6em 0 0.5em; }
      .lc-prose h1 { font-size: 24px; }
      .lc-prose h2 { font-size: 19px; }
      .lc-prose h3 { font-size: 16px; }
      .lc-prose > *:first-child { margin-top: 0; }
      .lc-prose p, .lc-prose ul, .lc-prose ol, .lc-prose blockquote { margin: 0 0 1em; }
      .lc-prose ul, .lc-prose ol { padding-left: 1.4em; }
      .lc-prose li { margin-bottom: 0.35em; }
      .lc-prose a { color: ${C.accent}; }
      .lc-prose code {
        padding: 2px 5px;
        border-radius: 4px;
        background: ${C.surfaceSunken};
        font-family: ${FONT_MONO};
        font-size: 0.88em;
      }
      .lc-prose pre { padding: 12px 14px; border-radius: ${RADIUS.lg}px; background: ${C.surfaceSunken}; overflow-x: auto; }
      .lc-prose pre code { padding: 0; background: none; }
      /* A quote reads as one from the tint and the italics, with no side rule. */
      .lc-prose blockquote {
        margin-left: 0;
        padding: 10px 14px;
        border-radius: ${RADIUS.lg}px;
        background: ${C.surfaceSunken};
        color: ${C.textSubtle};
        font-style: italic;
      }
      .lc-prose blockquote > *:last-child { margin-bottom: 0; }
      .lc-prose table { border-collapse: collapse; width: 100%; margin-bottom: 1em; font-size: 13px; }
      .lc-prose th, .lc-prose td { border: 1px solid ${C.border}; padding: 7px 10px; text-align: left; }
      .lc-prose th { background: ${C.surfaceSunken}; font-weight: 600; color: ${C.text}; }
      .lc-prose img { max-width: 100%; border-radius: ${RADIUS.lg}px; }
      .lc-prose hr { border: none; border-top: 1px solid ${C.divider}; margin: 1.6em 0; }

      /* A date on a station card: legible at a glance, not trailing grey text. */
      .lc-date {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 22px;
        padding: 0 8px;
        border-radius: ${RADIUS.sm}px;
        background: ${C.surfaceSunken};
        color: ${C.textBody};
        font-size: 11.5px;
        font-weight: 600;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .lc-date time { font-weight: 700; }
      .lc-date.is-late { background: ${C.dangerSoft}; color: ${C.danger}; }
      .lc-station.is-current .lc-date { background: rgba(255, 255, 255, 0.75); }

      /* How far a module has got, and the way into the work behind it. */
      .lc-progress {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 3px 8px;
        border: 1px solid transparent;
        border-radius: ${RADIUS.pill}px;
        background: transparent;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
        transition: background-color ${MOTION.fast}, border-color ${MOTION.fast};
      }
      .lc-progress .lc-meter { width: 56px; }
      .lc-progress:hover { background: ${C.surface}; border-color: ${C.border}; }
      .lc-progress:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }

      .lc-tally {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 24px;
        padding: 0 9px;
        border: 1px solid ${C.border};
        border-radius: ${RADIUS.pill}px;
        background: ${C.surface};
        color: ${C.textSubtle};
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
        transition: border-color ${MOTION.fast}, color ${MOTION.fast};
      }
      .lc-tally span { display: inline-flex; align-items: center; gap: 3px; }
      .lc-tally:hover { border-color: ${C.accent}; color: ${C.accent}; }
      .lc-tally:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }

      .lc-panels { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 16px; align-items: start; }
      @media (max-width: 1000px) { .lc-panels { grid-template-columns: minmax(0, 1fr); } }

      .lc-enter { animation: lcEnter 180ms ease both; }
      @keyframes lcEnter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) {
        .lc-enter, .lc-stage, .lc-node { animation: none; }
        .lc-node.is-current::after, .lc-road-lane.is-active, .lc-node.is-milestone.is-done, .lc-flag-cloth, .lc-seg.is-current::after { animation: none; }
        .lc-seg, .lc-meter span, .lc-ghost-btn, .lc-state-opt, .lc-check { transition: none; }
        .lc-stage, .lc-row, .lc-btn, .lc-icon-btn, .lc-road-fill, .lc-ring { transition: none; }
        .lc-menu, .lc-advance, .lc-next-btn, .lc-state-trigger, .lc-advance-arrow, .lc-dock, .lc-tab { animation: none; transition: none; }
        .lc-next-btn:hover:not(:disabled) { transform: none; }
        .lc-advance:hover:not(:disabled) { transform: none; }
        .lc-advance:hover:not(:disabled) .lc-advance-sweep { animation: none; }
        .lc-stage:hover { transform: none; }
      }

      .lc-skeleton { background: #EBECF0; border-radius: ${RADIUS.sm}px; animation: pulse 1.5s ease-in-out infinite; }
`;
