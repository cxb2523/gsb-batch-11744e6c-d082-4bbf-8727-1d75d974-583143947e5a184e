import { C, MOTION, RADIUS } from '../tokens';

export const routeCss = `
      /* ---- the route ---- */
      .lc-journey { list-style: none; margin: 0; padding: 0; }
      /* Stations sit either side of the road, so the eye zig-zags down the journey. */
      .lc-station { display: grid; grid-template-columns: minmax(0, 1fr) 60px minmax(0, 1fr); gap: 12px; align-items: start; }
      .lc-station .lc-rail { grid-column: 2; }
      .lc-station--left .lc-station-body { grid-column: 1; grid-row: 1; display: flex; flex-direction: column; align-items: flex-end; }
      .lc-station--right .lc-station-body { grid-column: 3; grid-row: 1; }
      .lc-station-body { padding-bottom: 14px; min-width: 0; }
      .lc-station--finish { grid-template-columns: minmax(0, 1fr) 60px minmax(0, 1fr); }
      .lc-station--finish .lc-station-body { grid-column: 3; grid-row: 1; display: flex; align-items: center; padding-bottom: 0; }

      /* Too narrow to read two columns: everything lines up to the right of the road. */
      @media (max-width: 860px) {
        .lc-station, .lc-station--finish { grid-template-columns: 60px minmax(0, 1fr); }
        .lc-station .lc-rail { grid-column: 1; }
        .lc-station--left .lc-station-body,
        .lc-station--right .lc-station-body,
        .lc-station--finish .lc-station-body { grid-column: 2; align-items: stretch; }
      }

      /* The rail column: a station, then the road stretching to the next one.
         The road is absolute so the card decides the row height, not the SVG. */
      .lc-rail { position: relative; display: flex; justify-content: center; min-height: 40px; }
      .lc-node {
        position: relative;
        z-index: 1;
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 2px solid ${C.border};
        border-radius: 50%;
        background: ${C.surface};
        box-shadow: 0 1px 2px rgba(9, 30, 66, 0.12);
        animation: lcPop 320ms ease both;
        animation-delay: var(--lc-delay, 0ms);
      }
      /* A checkpoint: the station turns into a gold diamond standing in a gate
         across the road, so it reads as somewhere the project has to pass through. */
      .lc-node.is-milestone {
        width: 38px;
        height: 38px;
        border-radius: 9px;
        border-width: 3px;
        transform: rotate(45deg);
        box-shadow: 0 0 0 4px rgba(255, 171, 0, 0.18), 0 2px 6px rgba(9, 30, 66, 0.18);
      }
      .lc-node.is-milestone .lc-node-icon { transform: rotate(-45deg); display: inline-flex; }
      .lc-node.is-milestone.is-done {
        border-color: #FFAB00;
        background: linear-gradient(135deg, #FFC400 0%, #FF991F 100%);
        color: #42320B;
        animation: lcSpark 900ms ease-out both;
      }
      /* The flag stands beside the station and waves gently. */
      /* Planted just clear of the station, pole reaching down to it. */
      .lc-flag { position: absolute; top: -26px; left: calc(50% + 13px); z-index: 3; line-height: 0; pointer-events: none; }
      .lc-flag-cloth { transform-origin: 6px 8px; animation: lcWave 3.2s ease-in-out infinite; }
      .lc-stage.is-milestone { border-color: #FFE2BD; }
      .lc-station-body { position: relative; }
      .lc-node--finish { border-style: dashed; color: ${C.textDisabled}; }
      .lc-node--finish.is-done { border-style: solid; border-color: #22A06B; background: #22A06B; color: #FFFFFF; }
      /* The current station keeps a soft halo going, so the eye lands on it first. */
      .lc-node.is-current::after {
        content: '';
        position: absolute;
        inset: -6px;
        border-radius: 50%;
        border: 2px solid var(--lc-halo, ${C.accent});
        opacity: 0.45;
        animation: lcHalo 2.4s ease-out infinite;
      }

      .lc-road { position: absolute; top: 26px; bottom: -14px; left: 0; width: 60px; overflow: visible; }
      .lc-road-base { fill: none; stroke: ${C.divider}; stroke-width: 8; stroke-linecap: round; }
      /* The painted road is normalised to pathLength="1" on the element, so one
         unit of dash offset is the whole stretch however tall the row is. */
      .lc-road-fill {
        fill: none;
        stroke-width: 8;
        stroke-linecap: round;
        stroke-dasharray: 1 1;
        stroke-dashoffset: 1;
        transition: stroke-dashoffset 600ms ease;
      }
      .lc-road-fill.is-travelled { stroke-dashoffset: 0; }
      .lc-road-fill.is-active { stroke-dashoffset: 0.55; }
      /* Lane markings: still on a finished road, flowing on the one being driven. */
      .lc-road-lane { fill: none; stroke: #FFFFFF; stroke-width: 1.5; stroke-dasharray: 5 7; opacity: 0.85; }
      .lc-road-lane.is-active { animation: lcLane 1.4s linear infinite; }

      .lc-here {
        display: inline-flex;
        align-items: center;
        height: 20px;
        padding: 0 8px;
        margin-bottom: 4px;
        border-radius: ${RADIUS.pill}px;
        background: ${C.accent};
        color: #FFFFFF;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }

      .lc-stage {
        position: relative;
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 14px;
        text-align: left;
        border: 1px solid ${C.border};
        border-radius: ${RADIUS.lg}px;
        background: ${C.surface};
        font: inherit;
        cursor: pointer;
        animation: lcSlide 340ms ease both;
        animation-delay: var(--lc-delay, 0ms);
        transition: box-shadow ${MOTION.fast}, border-color ${MOTION.fast}, transform ${MOTION.fast};
      }
      .lc-stage:hover { border-color: #C1C7D0; box-shadow: 0 4px 10px rgba(9, 30, 66, 0.10); transform: translateY(-1px); }
      .lc-stage.is-selected { box-shadow: 0 0 0 2px ${C.accent}; border-color: ${C.accent}; }
      .lc-station.is-current .lc-stage { background: ${C.accentSoft}; border-color: ${C.accentSoftBorder}; }
      /* The card opens the stage; the controls on it sit above that. Anything that
         opens a list on a card has to lift the whole card, or the stations further
         down the route paint over the list. :has covers every popup on a card, and
         focus-within is the fallback where it is not supported. */
      .lc-stage.is-menu-open,
      .lc-stage:focus-within { z-index: 40; }
      .lc-stage:has(.lc-menu) { z-index: 60; }
      /* Same for a row in a list: its own popup must clear the rows beneath it. */
      .lc-row:focus-within { z-index: 20; }
      .lc-row:has(.lc-menu) { z-index: 40; }
      .lc-stage-open {
        position: absolute;
        inset: 0;
        z-index: 0;
        padding: 0;
        border: none;
        border-radius: inherit;
        background: transparent;
        cursor: pointer;
      }
      .lc-stage-open:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .lc-stage-line { position: relative; z-index: 1; pointer-events: none; }
      .lc-stage-line .lc-menu-wrap, .lc-stage-line .lc-next-btn { pointer-events: auto; }

`;
