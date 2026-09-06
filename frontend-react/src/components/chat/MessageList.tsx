import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChat } from '@/stores/chat';
import { MessageItem } from './MessageItem';
import { StreamingIndicator } from './StreamingIndicator';

/** Breathing room between the pill and the top of the composer. */
const PILL_GAP_PX = 12;
/** Where the pill sits when there is no composer to measure. */
const PILL_FALLBACK_PX = 96;

/**
 * How far above the bottom of the chat area the jump-to-bottom pill belongs.
 *
 * The composer is not a fixed height: it grows with a multi-line draft, an
 * error notice and the greeting, which is why the cowork panel measures it
 * too instead of clearing a hard-coded 88px. We measure the composer's own
 * box, not the dock around it, because the dock carries transparent padding
 * on top that would push the pill visibly too high.
 */
export function pillBottomPx(): number {
  const dock = document.querySelector('[data-chat-input-dock]') as HTMLElement | null;
  const composer = (dock?.firstElementChild as HTMLElement | null) ?? dock;
  if (!dock || !composer) return PILL_FALLBACK_PX;
  const dockBottom = dock.getBoundingClientRect().bottom;
  const composerTop = composer.getBoundingClientRect().top;
  const height = dockBottom - composerTop;
  if (!Number.isFinite(height) || height <= 0) return PILL_FALLBACK_PX;
  return height + PILL_GAP_PX;
}

export function MessageList() {
  const messages = useChat((s) => s.messages);
  const status = useChat((s) => s.streamStatus);
  const agentPhase = useChat((s) => s.agentPhase);
  const agentTool = useChat((s) => s.agentTool);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const prevLenRef = useRef(messages.length);
  const [pillBottom, setPillBottom] = useState(PILL_FALLBACK_PX);

  // Re-measure whenever the composer changes size. Without this the pill is
  // parked at whatever the composer measured on mount, which is wrong the
  // moment the draft wraps to a second line.
  useLayoutEffect(() => {
    const dock = document.querySelector('[data-chat-input-dock]');
    setPillBottom(pillBottomPx());
    if (!dock) return;
    const ro = new ResizeObserver(() => setPillBottom(pillBottomPx()));
    ro.observe(dock);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      if (atBottom) setNewCount(0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const prevLen = prevLenRef.current;
    const delta = messages.length - prevLen;
    // Reading back through a long chat pins the view: an assistant reply
    // that lands while you are up there is announced by the pill, not by
    // yanking the scroll. Your OWN message is the exception. You pressed
    // Send a moment ago, so a chat that does not move looks like a chat
    // that did not take it, and "1 new" about a message you just typed
    // reads as a bug.
    const sentByUser = delta > 0 && messages[messages.length - 1]?.role === 'user';
    if (delta > 0 && !isAtBottomRef.current && !sentByUser) {
      setNewCount((n) => n + delta);
    }
    if (el && (isAtBottomRef.current || sentByUser)) {
      el.scrollTop = el.scrollHeight;
      if (sentByUser) {
        isAtBottomRef.current = true;
        setIsAtBottom(true);
        setNewCount(0);
      }
    }
    prevLenRef.current = messages.length;
  }, [messages, status]);

  const jumpToBottom = () => {
    const el = containerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setNewCount(0);
      setIsAtBottom(true);
      isAtBottomRef.current = true;
    }
  };

  // Virtualization deferred. Add react-virtuoso if profiling shows scroll jank
  // or messages.length > 500 routinely. See spec §4.5.
  return (
    // The pill is a sibling of the scroller, not a child of it. An absolutely
    // positioned child of an `overflow-y-auto` box is laid out against that
    // box's padding box, which scrolls: the pill was pinned 80px above the
    // BOTTOM OF THE TRANSCRIPT, not above the window, so the further you
    // scrolled up the higher it floated — it appeared stranded in the middle
    // of the screen, which is exactly where the content bottom happened to
    // be. This wrapper does not scroll, so `bottom` means what it reads like.
    <div className="relative h-full">
      {/* No `scroll-smooth` on the container: the autoscroll effect sets
          scrollTop on every streamed frame, and CSS smooth scrolling turns
          each of those into an overlapping animation — visible jank on long
          chats. */}
      <div ref={containerRef} className="h-full overflow-y-auto thin-scrollbar">
        <div className="max-w-3xl mx-auto px-6 py-6 pb-48 space-y-6">
          {messages.map((m, i) => (
            // A message arrives, it does not blink into existence. 200ms and two
            // pixels of travel is the whole effect — enough for the eye to see
            // WHERE the new thing came from, short enough that nobody waits for
            // it. Keyed on the message id so only genuinely new rows animate;
            // re-rendering a streamed token must never replay it.
            <div key={m.id} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
              <MessageItem
                message={m}
                streaming={status === 'streaming' && i === messages.length - 1 && m.role === 'assistant'}
              />
            </div>
          ))}
          {(() => {
            const last = messages[messages.length - 1];
            const hasActiveThinking = Boolean(last?.thinking && !last.thinkingComplete);
            return status === 'streaming' && last?.content === '' && !hasActiveThinking ? (
              <StreamingIndicator phase={agentPhase ?? 'thinking'} tool={agentTool} />
            ) : null;
          })()}
        </div>
      </div>
      {!isAtBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          // z-30, above the composer dock's z-20: measured to sit just above
          // it, and never behind it if a measurement is ever off.
          style={{ bottom: pillBottom }}
          className="absolute left-1/2 -translate-x-1/2 z-30 rounded-full bg-brand text-primary-foreground text-xs px-3 py-1.5 shadow-lg hover:bg-brand-hover flex items-center gap-1.5 cursor-pointer border border-brand-hover"
        >
          ↓ {newCount > 0 ? `${newCount} new` : 'Jump to bottom'}
        </button>
      )}
    </div>
  );
}
