'use client';

import React from 'react';
import { baseCss } from './styles/base';
import { heroCss } from './styles/hero';
import { panelsCss } from './styles/panels';
import { activityCss } from './styles/activity';
import { routeCss } from './styles/route';
import { stateMenuCss } from './styles/stateMenu';
import { peopleCss } from './styles/people';
import { dockCss } from './styles/dock';
import { documentsCss } from './styles/documents';

/**
 * Interaction states for the lifecycle screen: hover, focus and the responsive
 * grid can't be inline styles, so they live here as scoped `lc-` classes. The
 * CSS is split by concern into ./styles/* and concatenated into one <style>.
 */
export function LifecycleStyles() {
  return (
    <style>{[
      baseCss,
      heroCss,
      panelsCss,
      activityCss,
      routeCss,
      stateMenuCss,
      peopleCss,
      dockCss,
      documentsCss,
    ].join('\n')}</style>
  );
}
