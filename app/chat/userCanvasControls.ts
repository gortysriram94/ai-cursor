// app/chat/useCanvasControls.ts
// Ported from OpenSwarm's useCanvasControls.ts
// Adds: inertia/momentum panning, cursor-centered zoom, cubic ease-out animation,
// spring-back boundaries, pointer capture drag, fit-to-view, fit-to-cards.

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.0;
const ZOOM_IN_FACTOR = 1.1;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
const FIT_PADDING = 180;
const FRICTION = 0.92;
const MIN_VELOCITY = 0.5;
const BOUNDARY_MARGIN = 600;

interface CanvasState { panX: number; panY: number; zoom: number; }

export interface ContentBounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function useCanvasControls(contentBounds?: ContentBounds) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef  = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<CanvasState>({ panX: 0, panY: 0, zoom: 1 });
  const [isPanning, setIsPanning]   = useState(false);
  const [spaceHeld, setSpaceHeld]   = useState(false);

  const stateRef         = useRef(state);
  stateRef.current       = state;
  const spaceRef         = useRef(false);
  const panStartRef      = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const velHistoryRef    = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const animFrameRef     = useRef<number | null>(null);
  const inertiaFrameRef  = useRef<number | null>(null);
  const contentBoundsRef = useRef(contentBounds);
  contentBoundsRef.current = contentBounds;

  // ── Animation helpers ─────────────────────────────────────────────────────
  const cancelAnimation = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
  }, []);

  const cancelInertia = useCallback(() => {
    if (inertiaFrameRef.current) { cancelAnimationFrame(inertiaFrameRef.current); inertiaFrameRef.current = null; }
  }, []);

  const animateToRef = useRef<((t: CanvasState, dur?: number) => void) | null>(null);

  // Cubic ease-out animation — same as OpenSwarm
  const animateTo = useCallback((target: CanvasState, duration = 320) => {
    cancelAnimation();
    const start = { ...stateRef.current };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setState({
        panX: start.panX + (target.panX - start.panX) * ease,
        panY: start.panY + (target.panY - start.panY) * ease,
        zoom: start.zoom + (target.zoom - start.zoom) * ease,
      });
      if (t < 1) animFrameRef.current = requestAnimationFrame(step);
      else animFrameRef.current = null;
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, [cancelAnimation]);
  animateToRef.current = animateTo;

  // Spring back if panned completely off content
  const springBackIfNeeded = useCallback(() => {
    const bounds = contentBoundsRef.current;
    const vp = viewportRef.current;
    if (!bounds || !vp) return;
    const cur = stateRef.current;
    const vpW = vp.clientWidth, vpH = vp.clientHeight;
    const vpLeft = -cur.panX / cur.zoom, vpTop = -cur.panY / cur.zoom;
    const vpRight = vpLeft + vpW / cur.zoom, vpBottom = vpTop + vpH / cur.zoom;
    const bL = bounds.minX - BOUNDARY_MARGIN, bT = bounds.minY - BOUNDARY_MARGIN;
    const bR = bounds.maxX + BOUNDARY_MARGIN, bB = bounds.maxY + BOUNDARY_MARGIN;
    let nx = cur.panX, ny = cur.panY;
    if (vpRight < bL)  nx = -(bL - vpW / cur.zoom) * cur.zoom;
    else if (vpLeft > bR) nx = -bR * cur.zoom;
    if (vpBottom < bT) ny = -(bT - vpH / cur.zoom) * cur.zoom;
    else if (vpTop > bB)  ny = -bB * cur.zoom;
    if (nx !== cur.panX || ny !== cur.panY) animateToRef.current?.({ panX: nx, panY: ny, zoom: cur.zoom }, 250);
  }, []);

  // Momentum / inertia after fast pan release
  const startInertia = useCallback((vx: number, vy: number) => {
    cancelInertia();
    let velX = vx, velY = vy;
    const step = () => {
      velX *= FRICTION; velY *= FRICTION;
      if (Math.abs(velX) < MIN_VELOCITY && Math.abs(velY) < MIN_VELOCITY) {
        inertiaFrameRef.current = null;
        springBackIfNeeded();
        return;
      }
      setState(prev => ({ ...prev, panX: prev.panX + velX, panY: prev.panY + velY }));
      inertiaFrameRef.current = requestAnimationFrame(step);
    };
    inertiaFrameRef.current = requestAnimationFrame(step);
  }, [cancelInertia, springBackIfNeeded]);

  // ── Wheel: pinch→zoom centered on cursor, scroll→pan ─────────────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const isPinch = e.ctrlKey || e.metaKey;
      // Let scrollable children handle scroll unless at boundary
      if (!isPinch) {
        let target = e.target as HTMLElement | null;
        while (target && target !== el) {
          const oy = getComputedStyle(target).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && target.scrollHeight > target.clientHeight) {
            const dy = e.deltaY;
            const atBot = dy > 0 && target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
            const atTop = dy < 0 && target.scrollTop <= 1;
            if (!atBot && !atTop) return; // let child scroll
          }
          target = target.parentElement;
        }
      }
      e.preventDefault();
      cancelInertia();
      if (isPinch) {
        // Zoom centered on cursor position
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        setState(prev => {
          const factor = Math.pow(2, -dy * 0.004);
          const newZoom = clamp(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM);
          const ratio = newZoom / prev.zoom;
          return { panX: cx - (cx - prev.panX) * ratio, panY: cy - (cy - prev.panY) * ratio, zoom: newZoom };
        });
      } else {
        // Two-finger scroll → pan
        const dx = e.deltaMode === 1 ? e.deltaX * 40 : e.deltaX;
        const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        setState(prev => ({ ...prev, panX: prev.panX - dx, panY: prev.panY - dy }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [cancelInertia]);

  // ── Pan mouse handlers ────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    cancelAnimation(); cancelInertia();
    setIsPanning(true);
    velHistoryRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: stateRef.current.panX, panY: stateRef.current.panY };
  }, [cancelAnimation, cancelInertia]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const s = panStartRef.current; if (!s) return;
    const now = performance.now();
    velHistoryRef.current.push({ x: e.clientX, y: e.clientY, t: now });
    if (velHistoryRef.current.length > 5) velHistoryRef.current.shift();
    setState(prev => ({ ...prev, panX: s.panX + (e.clientX - s.x), panY: s.panY + (e.clientY - s.y) }));
  }, []);

  const handleMouseUp = useCallback(() => {
    const wasPanning = !!panStartRef.current;
    panStartRef.current = null;
    setIsPanning(false);
    if (!wasPanning) return;
    const history = velHistoryRef.current;
    if (history.length >= 2) {
      const oldest = history[0], newest = history[history.length - 1];
      const dt = newest.t - oldest.t;
      if (dt > 0 && dt < 200) {
        const vx = (newest.x - oldest.x) / (dt / 16.67);
        const vy = (newest.y - oldest.y) / (dt / 16.67);
        if (Math.abs(vx) > MIN_VELOCITY || Math.abs(vy) > MIN_VELOCITY) {
          startInertia(vx, vy); return;
        }
      }
    }
    velHistoryRef.current = [];
    springBackIfNeeded();
  }, [startInertia, springBackIfNeeded]);

  // Clean up if mouse leaves window
  useEffect(() => {
    const up = () => { if (panStartRef.current) { panStartRef.current = null; setIsPanning(false); } };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  useEffect(() => () => { cancelAnimation(); cancelInertia(); }, [cancelAnimation, cancelInertia]);

  // ── Keyboard: space, ⌘+/−/0 ──────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code === 'Space' && !e.repeat && !(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) {
        e.preventDefault(); spaceRef.current = true; setSpaceHeld(true);
      }
      if ((e.ctrlKey || e.metaKey) && !e.repeat) {
        if (e.key === '0') { e.preventDefault(); animateToRef.current?.({ panX: 0, panY: 0, zoom: 1 }); }
        if (e.key === '=' || e.key === '+') { e.preventDefault(); actions.zoomIn(); }
        if (e.key === '-') { e.preventDefault(); actions.zoomOut(); }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') { spaceRef.current = false; setSpaceHeld(false); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []); // eslint-disable-line

  // ── Zoom actions ──────────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    const prev = stateRef.current;
    const newZoom = clamp(prev.zoom * ZOOM_IN_FACTOR, MIN_ZOOM, MAX_ZOOM);
    const el = viewportRef.current;
    if (!el) { animateTo({ ...prev, zoom: newZoom }, 150); return; }
    const r = el.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    const ratio = newZoom / prev.zoom;
    animateTo({ panX: cx - (cx - prev.panX) * ratio, panY: cy - (cy - prev.panY) * ratio, zoom: newZoom }, 150);
  }, [animateTo]);

  const zoomOut = useCallback(() => {
    const prev = stateRef.current;
    const newZoom = clamp(prev.zoom * ZOOM_OUT_FACTOR, MIN_ZOOM, MAX_ZOOM);
    const el = viewportRef.current;
    if (!el) { animateTo({ ...prev, zoom: newZoom }, 150); return; }
    const r = el.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    const ratio = newZoom / prev.zoom;
    animateTo({ panX: cx - (cx - prev.panX) * ratio, panY: cy - (cy - prev.panY) * ratio, zoom: newZoom }, 150);
  }, [animateTo]);

  const resetZoom = useCallback(() => animateTo({ panX: 0, panY: 0, zoom: 1 }), [animateTo]);

  // Fit all nodes into viewport
  const fitToView = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const content = contentRef.current;
    if (!content || content.children.length === 0) { animateTo({ panX: 0, panY: 0, zoom: 1 }); return; }
    const vRect = vp.getBoundingClientRect();
    const prev = stateRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < content.children.length; i++) {
      const r = content.children[i].getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const sx = (r.left - vRect.left - prev.panX) / prev.zoom;
      const sy = (r.top - vRect.top - prev.panY) / prev.zoom;
      minX = Math.min(minX, sx); minY = Math.min(minY, sy);
      maxX = Math.max(maxX, sx + r.width / prev.zoom);
      maxY = Math.max(maxY, sy + r.height / prev.zoom);
    }
    if (!isFinite(minX)) { animateTo({ panX: 0, panY: 0, zoom: 1 }); return; }
    const cW = maxX - minX, cH = maxY - minY;
    const newZoom = clamp(Math.min((vRect.width - FIT_PADDING * 2) / cW, (vRect.height - FIT_PADDING * 2) / cH), MIN_ZOOM, MAX_ZOOM);
    animateTo({
      panX: (vRect.width - cW * newZoom) / 2 - minX * newZoom,
      panY: (vRect.height - cH * newZoom) / 2 - minY * newZoom,
      zoom: newZoom,
    });
  }, [animateTo]);

  // Fit to explicit card rects (used when fitting to a single new card)
  const fitToCards = useCallback((rects: Array<{ x: number; y: number; w: number; h: number }>, maxZoom = 1.2) => {
    const vp = viewportRef.current; if (!vp || rects.length === 0) return;
    const vRect = vp.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rects) {
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    }
    const cW = maxX - minX, cH = maxY - minY;
    const newZoom = clamp(Math.min((vRect.width - FIT_PADDING * 2) / cW, (vRect.height - FIT_PADDING * 2) / cH), MIN_ZOOM, maxZoom);
    animateTo({
      panX: (vRect.width - cW * newZoom) / 2 - minX * newZoom,
      panY: FIT_PADDING * 0.5 - minY * newZoom,
      zoom: newZoom,
    });
  }, [animateTo]);

  const handlers = useMemo(() => ({ onMouseDown: handleMouseDown, onMouseMove: handleMouseMove, onMouseUp: handleMouseUp }), [handleMouseDown, handleMouseMove, handleMouseUp]);
  const actions  = useMemo(() => ({ zoomIn, zoomOut, resetZoom, fitToView, fitToCards, animateTo, setState }), [zoomIn, zoomOut, resetZoom, fitToView, fitToCards, animateTo]);

  return { ...state, isPanning, spaceHeld, spaceRef, viewportRef, contentRef, handlers, actions };
}

export type CanvasActions = ReturnType<typeof useCanvasControls>['actions'];