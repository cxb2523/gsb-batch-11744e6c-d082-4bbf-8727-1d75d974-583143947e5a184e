import { C } from '../tokens';

export const baseCss = `
      /* The backdrop: the same flat, light page surface the rest of GRID uses, so the
         white cards on it read as part of the app rather than a separate canvas. */
      .lc-backdrop {
        /* Positioned so visually-hidden labels (position: absolute) resolve against
           this page instead of the document, which otherwise grew tall enough to
           scroll the whole app behind the scroll pane. */
        position: relative;
        min-height: 100%;
        /* Two columns: the route, and the dock against the right edge of the app.
           The second column is what makes the route slide left when a stage opens. */
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        background-color: ${C.page};
      }
      /* Wide enough to read a stage's whole record without scrolling sideways. */
      .lc-backdrop.is-docked { grid-template-columns: minmax(0, 1fr) clamp(430px, 31vw, 560px); }
      .lc-page { max-width: 1280px; margin: 0 auto; padding: 24px; }
      /* The remaining width is narrower once the dock is open, so the two lower
         panels stop competing for it. */
      .lc-backdrop.is-docked .lc-panels { grid-template-columns: minmax(0, 1fr); }

`;
