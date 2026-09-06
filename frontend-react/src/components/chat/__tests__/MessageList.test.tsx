import { describe, expect, it, afterEach } from 'vitest';
import { pillBottomPx } from '../MessageList';

/**
 * The jump-to-bottom pill used to be pinned with a hard-coded `bottom-20`
 * from inside the scrolling transcript, so it drifted into the middle of the
 * screen as you scrolled up and it ignored a composer that had grown. These
 * check the measurement; the anchoring itself is structural (the pill is a
 * sibling of the scroller, not a child of it).
 */

function mountDock(composerHeight: number, padTop: number): HTMLElement {
  const dock = document.createElement('div');
  dock.setAttribute('data-chat-input-dock', '');
  const composer = document.createElement('div');
  dock.appendChild(composer);
  document.body.appendChild(dock);
  // jsdom has no layout, so the rects are the point of the test: the dock's
  // bottom minus the composer's top is the height the pill has to clear.
  dock.getBoundingClientRect = () =>
    ({ top: 600 - composerHeight - padTop, bottom: 600 }) as DOMRect;
  composer.getBoundingClientRect = () =>
    ({ top: 600 - composerHeight, bottom: 600 }) as DOMRect;
  return dock;
}

afterEach(() => {
  document.querySelectorAll('[data-chat-input-dock]').forEach((e) => e.remove());
});

describe('pillBottomPx', () => {
  it('clears the composer, not the transparent padding above it', () => {
    mountDock(88, 32);
    // 88px of composer plus the 12px gap. The 32px of dock padding is not
    // part of it: counting it would float the pill visibly too high.
    expect(pillBottomPx()).toBe(100);
  });

  it('follows a composer that grew', () => {
    mountDock(200, 32);
    expect(pillBottomPx()).toBe(212);
  });

  it('falls back when there is no composer to measure', () => {
    expect(pillBottomPx()).toBe(96);
  });

  it('falls back rather than returning a nonsense offset', () => {
    const dock = mountDock(0, 0);
    dock.getBoundingClientRect = () => ({ top: 0, bottom: 0 }) as DOMRect;
    expect(pillBottomPx()).toBe(96);
  });
});
