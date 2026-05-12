// app/chat/components/Minimap.tsx
// Ported from OpenSwarm's Minimap.tsx
// SVG overview of all canvas nodes + draggable viewport indicator.

"use client";
import React, { useRef, useCallback, useMemo } from "react";

const W = 192, H = 128, PAD = 16;

interface Rect { x: number; y: number; w: number; h: number; kind: "browser"|"chat"|"agent"; }

interface Props {
  panX: number; panY: number; zoom: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  nodes: Array<{ x: number; y: number; w: number; h: number; kind: string }>;
  onPan: (panX: number, panY: number) => void;
}

export default function Minimap({ panX, panY, zoom, viewportRef, nodes, onPan }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const layout = useMemo(() => {
    const vp = viewportRef.current;
    const vpW = vp?.clientWidth ?? 1200;
    const vpH = vp?.clientHeight ?? 800;

    const safeZoom = zoom > 0 ? zoom : 1;
    const vpRect = { x: -panX / safeZoom, y: -panY / safeZoom, width: vpW / safeZoom, height: vpH / safeZoom };

    let minX = vpRect.x, minY = vpRect.y;
    let maxX = vpRect.x + vpRect.width, maxY = vpRect.y + vpRect.height;
    for (const n of nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    }

    const contentW = maxX - minX || 1, contentH = maxY - minY || 1;
    const avW = W - PAD * 2, avH = H - PAD * 2;
    const scale = Math.min(avW / contentW, avH / contentH);
    const offsetX = PAD + (avW - contentW * scale) / 2 - minX * scale;
    const offsetY = PAD + (avH - contentH * scale) / 2 - minY * scale;

    return { scale, offsetX, offsetY, vpRect, minX, minY, maxX, maxY };
  }, [panX, panY, zoom, nodes, viewportRef]);

  const toMini = (cx: number, cy: number) => ({
    x: cx * layout.scale + layout.offsetX,
    y: cy * layout.scale + layout.offsetY,
  });

  const fromMini = useCallback((mx: number, my: number) => {
    const vp = viewportRef.current; if (!vp) return;
    const vpW = vp.clientWidth, vpH = vp.clientHeight;
    const canvasX = (mx - layout.offsetX) / layout.scale;
    const canvasY = (my - layout.offsetY) / layout.scale;
    onPan(-(canvasX - vpW / zoom / 2) * zoom, -(canvasY - vpH / zoom / 2) * zoom);
  }, [layout, onPan, viewportRef, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault(); dragging.current = true;
    const rect = svgRef.current!.getBoundingClientRect();
    fromMini(e.clientX - rect.left, e.clientY - rect.top);
  }, [fromMini]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const rect = svgRef.current!.getBoundingClientRect();
    fromMini(e.clientX - rect.left, e.clientY - rect.top);
  }, [fromMini]);

  const stopDrag = useCallback(() => { dragging.current = false; }, []);

  const COLOR: Record<string, string> = {
    browser: "rgba(99,179,237,.6)",
    chat:    "rgba(154,230,180,.6)",
    agent:   "rgba(252,129,74,.6)",
  };

  // Viewport rect in minimap coords
  const vpTL = toMini(layout.vpRect.x, layout.vpRect.y);
  const vpW2 = layout.vpRect.width * layout.scale;
  const vpH2 = layout.vpRect.height * layout.scale;

  return (
    <svg ref={svgRef} width={W} height={H}
      style={{ cursor: "crosshair", display: "block", userSelect: "none" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}>
      {/* Background */}
      <rect width={W} height={H} fill="var(--surface)" />

      {/* Node rects */}
      {nodes.map((n, i) => {
        const tl = toMini(n.x, n.y);
        return (
          <rect key={i}
            x={tl.x} y={tl.y}
            width={Math.max(2, n.w * layout.scale)}
            height={Math.max(2, n.h * layout.scale)}
            fill={COLOR[n.kind] ?? "rgba(200,200,200,.4)"}
            rx={2}
          />
        );
      })}

      {/* Viewport indicator */}
      <rect
        x={vpTL.x} y={vpTL.y}
        width={Math.max(4, vpW2)} height={Math.max(4, vpH2)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeDasharray="3 2"
        rx={2}
        opacity={0.8}
      />

      {/* Border */}
      <rect width={W} height={H} fill="none" stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}