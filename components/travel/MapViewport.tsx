'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import styles from './TravelMap.module.css';

type Point = { x: number; y: number };
type View = Point & { zoom: number };
const INITIAL_VIEW: View = { x: 0, y: 0, zoom: 1 };
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.5;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function MapControl({ label, disabled, onActivate, children }: {
  label: string;
  disabled: boolean;
  onActivate: () => void;
  children: ReactNode;
}) {
  const touchStart = useRef<(Point & { id: number }) | null>(null);
  const activatedByTouch = useRef(false);

  return <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onPointerDown={(event) => {
      activatedByTouch.current = false;
      touchStart.current = event.pointerType === 'touch' && event.isPrimary ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
    }}
    onPointerMove={(event) => {
      if (touchStart.current && distance(touchStart.current, { x: event.clientX, y: event.clientY }) > 10) touchStart.current = null;
    }}
    onPointerCancel={() => { touchStart.current = null; }}
    onPointerUp={(event) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || start.id !== event.pointerId) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
      // Some browsers omit the compatibility click after a map gesture.
      activatedByTouch.current = true;
      onActivate();
    }}
    onClick={(event) => {
      if (!activatedByTouch.current || event.detail === 0) onActivate();
      activatedByTouch.current = false;
    }}
  >{children}</button>;
}

export function MapViewport({ region, viewBox, titleId, children, onInteract }: {
  region: string;
  viewBox: string;
  titleId: string;
  children: ReactNode;
  onInteract: () => void;
}) {
  const [, , width, height] = viewBox.split(' ').map(Number);
  const [view, setView] = useState(INITIAL_VIEW);
  const [dragging, setDragging] = useState(false);
  const currentView = useRef(view);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef({ start: { x: 0, y: 0 }, moved: false });
  const interactRef = useRef(onInteract);
  interactRef.current = onInteract;

  const updateView = (next: View) => {
    const zoom = Math.max(1, Math.min(MAX_ZOOM, next.zoom));
    const bounded = {
      zoom,
      x: Math.max(0, Math.min(width - width / zoom, next.x)),
      y: Math.max(0, Math.min(height - height / zoom, next.y)),
    };
    currentView.current = bounded;
    setView(bounded);
    interactRef.current();
  };

  const mapPoint = (point: Point) => {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix ? new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse()) : point;
  };

  const zoomTo = (zoom: number, anchor?: Point, destination = anchor) => {
    const current = currentView.current;
    const nextZoom = Math.max(1, Math.min(MAX_ZOOM, zoom));
    const origin = anchor ?? { x: current.x + width / current.zoom / 2, y: current.y + height / current.zoom / 2 };
    const target = destination ?? origin;
    updateView({
      zoom: nextZoom,
      x: origin.x - (target.x - current.x) * current.zoom / nextZoom,
      y: origin.y - (target.y - current.y) * current.zoom / nextZoom,
    });
  };

  // React's wheel listener is passive. A local listener allows modifier-wheel
  // zoom to prevent browser zoom while ordinary scrolling passes through.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1);
      zoomTo(currentView.current.zoom * Math.exp(-Math.max(-600, Math.min(600, delta)) * .003), mapPoint({ x: event.clientX, y: event.clientY }));
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
    // Dimensions are fixed for the lifetime of this keyed geography viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 0) gesture.current = { start: point, moved: false };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2) {
      gesture.current.moved = true;
      pointers.current.forEach((_, id) => event.currentTarget.setPointerCapture(id));
      interactRef.current();
    }
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    const previousPoints = Array.from(pointers.current.values());
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2) {
      const nextPoints = Array.from(pointers.current.values());
      const previousDistance = distance(previousPoints[0], previousPoints[1]);
      if (previousDistance > 0) zoomTo(
        currentView.current.zoom * distance(nextPoints[0], nextPoints[1]) / previousDistance,
        mapPoint(midpoint(previousPoints[0], previousPoints[1])),
        mapPoint(midpoint(nextPoints[0], nextPoints[1])),
      );
      return;
    }
    if (currentView.current.zoom === 1 || (!gesture.current.moved && distance(gesture.current.start, point) < 4)) return;
    gesture.current.moved = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    const from = mapPoint(previous);
    const to = mapPoint(point);
    updateView({ ...currentView.current, x: currentView.current.x + from.x - to.x, y: currentView.current.y + from.y - to.y });
  };

  const endPointer = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const current = currentView.current;
    if (event.key === '+' || event.key === '=') zoomTo(current.zoom * ZOOM_STEP);
    else if (event.key === '-' || event.key === '_') zoomTo(current.zoom / ZOOM_STEP);
    else if (event.key === 'Home') updateView(INITIAL_VIEW);
    else if (event.key.startsWith('Arrow') && current.zoom > 1) {
      const stepX = width / current.zoom * .15;
      const stepY = height / current.zoom * .15;
      updateView({ ...current,
        x: current.x + (event.key === 'ArrowRight' ? stepX : event.key === 'ArrowLeft' ? -stepX : 0),
        y: current.y + (event.key === 'ArrowDown' ? stepY : event.key === 'ArrowUp' ? -stepY : 0),
      });
    } else return;
    event.preventDefault();
  };

  return (
    <div className={styles.viewport}>
      <div className={styles.controls} role="group" aria-label="Map controls">
        <output aria-label="Map zoom" aria-live="polite">{Math.round(view.zoom * 100)}%</output>
        <MapControl label="Zoom out" disabled={view.zoom === 1} onActivate={() => zoomTo(currentView.current.zoom / ZOOM_STEP)}>−</MapControl>
        <MapControl label="Zoom in" disabled={view.zoom === MAX_ZOOM} onActivate={() => zoomTo(currentView.current.zoom * ZOOM_STEP)}>+</MapControl>
        <MapControl label="Reset map" disabled={view.zoom === 1} onActivate={() => updateView(INITIAL_VIEW)}>↺</MapControl>
      </div>
      <svg
        ref={svgRef}
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-help`}
        className={`${styles.map} ${styles[region]}`}
        data-travel-map
        data-travel-region={region}
        data-zoomed={view.zoom > 1}
        data-dragging={dragging}
        role="group"
        tabIndex={0}
        viewBox={`${view.x} ${view.y} ${width / view.zoom} ${height / view.zoom}`}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={(event) => { pointers.current.delete(event.pointerId); setDragging(false); }}
        onPointerLeave={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) pointers.current.delete(event.pointerId); }}
        onClickCapture={(event) => {
          if (gesture.current.moved && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
        }}
        onFocusCapture={(event) => {
          const target = event.target as SVGGraphicsElement;
          if (!target.hasAttribute('data-region-code') || !target.matches(':focus-visible') || currentView.current.zoom === 1) return;
          const bounds = target.getBBox();
          const current = currentView.current;
          if (bounds.x >= current.x && bounds.y >= current.y && bounds.x + bounds.width <= current.x + width / current.zoom && bounds.y + bounds.height <= current.y + height / current.zoom) return;
          updateView({ ...current, x: bounds.x + bounds.width / 2 - width / current.zoom / 2, y: bounds.y + bounds.height / 2 - height / current.zoom / 2 });
        }}
        xmlns="http://www.w3.org/2000/svg"
      >{children}</svg>
      <p id={`${titleId}-help`} className={styles.mapHelp}>Use + / − to zoom. Drag or use arrow keys to pan. Home resets. Ctrl/⌘ + scroll or pinch to zoom.</p>
    </div>
  );
}
