'use client';

import React from 'react';
import { C, LAYER, MOTION, RADIUS, SHADOW } from './tokens';

/**
 * Interaction states for the standup screen.
 *
 * Hover, focus-visible and responsive layout can't be expressed as inline styles,
 * so they live here as scoped `su-` classes. Everything is prefixed to avoid
 * leaking into the rest of the app.
 */
export function StandupStyles() {
  return (
    <style>{`
      /* Rows are cards: they need air between them, or two tinted ones read as one. */
      .su-rows { display: flex; flex-direction: column; gap: 6px; }

      .su-row {
        position: relative;
        display: block;
        padding: 8px 8px;
        min-height: 44px;
        border-radius: ${RADIUS.md}px;
        cursor: pointer;
        outline: none;
        transition: background-color ${MOTION.fast};
      }
      .su-row:hover { background: ${C.surfaceSunken}; }
      .su-row[draggable="true"] { cursor: grab; }
      .su-row[draggable="true"]:active { cursor: grabbing; }
      .su-row--dragging { opacity: 0.45; }
      .su-row:focus-visible { box-shadow: 0 0 0 2px ${C.focus}; background: ${C.surfaceSunken}; }
      /* Linked rows carry their pair's colour inline; hover must not paint over it. */
      .su-row--linked:hover { background: var(--su-row-bg); }
      /* A single kebab, revealed on hover in the corner the title reserves for it. */
      .su-row-actions {
        position: absolute;
        top: 2px;
        right: 2px;
        display: inline-flex;
        align-items: center;
        border-radius: ${RADIUS.md}px;
        opacity: 0;
        pointer-events: none;
        transition: opacity ${MOTION.fast};
      }
      .su-row:hover .su-row-actions,
      .su-row:focus-within .su-row-actions,
      /* Stay put while the menu is open, even if the pointer leaves the row. */
      .su-row-actions.is-open { opacity: 1; pointer-events: auto; }
      /* Always leave room for the kebab so it never sits on top of the title. */
      .su-row--actions .su-row-title { padding-right: 40px; }
      @media (hover: none) {
        .su-row-actions { opacity: 1; pointer-events: auto; }
      }

      /* Overflow menu opened by the row kebab. */
      .su-menu {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 4px;
        z-index: ${LAYER.popover};
        min-width: 180px;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        background: ${C.surface};
        border: 1px solid ${C.border};
        border-radius: ${RADIUS.md}px;
        box-shadow: ${SHADOW.overlay};
      }
      /* Opens above the kebab when there isn't room below. */
      .su-menu--up { top: auto; bottom: 100%; margin-top: 0; margin-bottom: 4px; }
      .su-menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 34px;
        padding: 0 10px;
        border: none;
        border-radius: ${RADIUS.sm}px;
        background: transparent;
        color: ${C.textBody};
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        text-align: left;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color ${MOTION.fast}, color ${MOTION.fast};
      }
      .su-menu-item:hover { background: ${C.surfaceSunken}; color: ${C.text}; }
      .su-menu-item:focus-visible { outline: none; box-shadow: inset 0 0 0 2px ${C.focus}; }
      .su-menu-item-icon { display: inline-flex; flex-shrink: 0; color: ${C.textSubtle}; }
      .su-menu-item--danger { color: ${C.danger}; }
      .su-menu-item--danger .su-menu-item-icon { color: ${C.danger}; }
      .su-menu-item--danger:hover { background: ${C.dangerSoft}; color: ${C.danger}; }

      .su-icon-btn {
        width: 40px;
        height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border: 1px solid transparent;
        border-radius: ${RADIUS.md}px;
        background: transparent;
        color: ${C.textSubtle};
        cursor: pointer;
        transition: background-color ${MOTION.fast}, color ${MOTION.fast};
      }
      .su-icon-btn:hover:not(:disabled) { background: #EBECF0; color: ${C.text}; }
      .su-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }
      .su-icon-btn:disabled { color: ${C.textDisabled}; cursor: not-allowed; }
      .su-icon-btn--bordered { border-color: ${C.border}; background: ${C.surface}; }

      .su-link-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 32px;
        padding: 0 8px;
        border: none;
        border-radius: ${RADIUS.sm}px;
        background: transparent;
        color: ${C.accent};
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .su-link-btn:hover { background: ${C.accentSoft}; }
      .su-link-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }

      .su-date-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 40px;
        padding: 0 12px;
        border: 1px solid ${C.border};
        border-radius: ${RADIUS.md}px;
        background: ${C.surface};
        color: ${C.text};
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: border-color ${MOTION.fast};
      }
      .su-date-btn:hover { border-color: #C1C7D0; }
      .su-date-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }

      .su-day:hover:not(:disabled):not([aria-selected="true"]) { background: ${C.surfaceSunken} !important; }
      .su-day:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus} !important; }

      .su-rail-item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        padding: 6px 8px;
        border: none;
        border-radius: ${RADIUS.md}px;
        background: transparent;
        font: inherit;
        cursor: pointer;
        position: relative;
        transition: background-color ${MOTION.fast};
      }
      .su-rail-item:hover { background: ${C.surfaceSunken}; }
      .su-rail-item.is-selected { background: ${C.accentSoft}; }
      .su-rail-item:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }

      .su-stat-btn { font: inherit; cursor: pointer; transition: background-color ${MOTION.fast}; }
      .su-stat-btn:hover:not(:disabled) { background: ${C.surfaceSunken} !important; }
      .su-stat-btn:disabled { cursor: default; }
      .su-stat-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.focus}; }

      /* Wraps by the panel's own width (the app sidebar and rail make viewport breakpoints lie). */
      .su-columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
        gap: 16px;
        align-items: start;
      }

      /*
       * Each column is capped to the viewport so only its ticket list scrolls, not the page.
       * The scrollbar stays hidden until the tickets actually run past the bottom of the screen.
       * The offset covers the sticky header, the person header above the columns and the page padding.
       */
      .su-col { max-height: calc(100vh - 240px); }
      .su-col-body { overflow-y: auto; min-height: 0; }
      /* Once the header stops sticking and the columns stack, let them flow with the page again. */
      @media (max-width: 1100px) {
        .su-col { max-height: none; }
        .su-col-body { overflow-y: visible; }
      }

      /* The header sticks only while it fits on one row; the rail sticks below it only beside the panel. */
      .su-header { position: sticky; top: 0; }
      .su-rail { position: sticky; top: 81px; max-height: calc(100vh - 180px); overflow-y: auto; }
      @media (max-width: 1100px) {
        .su-header { position: static; }
        .su-rail { top: 16px; }
      }
      @media (max-width: 960px) {
        .su-rail { position: static; max-height: none; }
      }

      .su-layout {
        display: grid;
        grid-template-columns: 248px minmax(0, 1fr);
        gap: 16px;
        align-items: start;
      }
      @media (max-width: 960px) {
        .su-layout { grid-template-columns: minmax(0, 1fr); }
      }

      .su-panel { animation: suEnter 200ms ease both; }
      @keyframes suEnter {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .su-panel { animation: none; }
        .su-row, .su-icon-btn, .su-rail-item { transition: none; }
      }

      .su-skeleton {
        background: #EBECF0;
        border-radius: ${RADIUS.sm}px;
        animation: pulse 1.5s ease-in-out infinite;
      }

      /* Column add bar: quiet until hovered, like the rest of the row actions. */
      .su-add-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
      .su-composer {
        flex-basis: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        border: 1px solid ${C.border};
        border-radius: ${RADIUS.md}px;
        background: ${C.surface};
        box-shadow: 0 1px 2px rgba(9, 30, 66, 0.08);
        animation: suEnter 150ms ease both;
      }
      .su-input {
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
      .su-input::placeholder { color: ${C.textMuted}; }
      .su-input:hover { border-color: #C1C7D0; }
      .su-input:focus { border-color: ${C.accent}; box-shadow: 0 0 0 1px ${C.accent}; }
      .su-input[aria-invalid="true"] { border-color: ${C.dangerDot}; box-shadow: 0 0 0 1px ${C.dangerDot}; }

      .su-row--static { cursor: default; }
    `}</style>
  );
}
