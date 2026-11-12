"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CloseIcon, MinusIcon, PlusIcon } from "@/components/common/icons";
import ui from "@/components/common/ui.module.css";
import styles from "./AccountSettings.module.css";

// What is sent: the square in the circle, at most this many pixels a side. The
// server makes it 512 (lib/avatars.ts); sending more lets its resize, the
// better one, do the work.
const outputSide = 1024;
const maxZoom = 4;
const zoomStep = 0.25;

/**
 * The square kept: its middle, in the photo's pixels, and how far in it is
 * zoomed (1: as wide as the photo's shorter side).
 */
type Crop = { x: number; y: number; zoom: number };
type Size = { width: number; height: number };
type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The same crop, kept inside the photo. */
function within(crop: Crop, size: Size): Crop {
  const zoom = clamp(crop.zoom, 1, maxZoom);
  const half = Math.min(size.width, size.height) / zoom / 2;
  return { zoom, x: clamp(crop.x, half, size.width - half), y: clamp(crop.y, half, size.height - half) };
}

const middle = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});
const spread = (points: Point[]) => (points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0);

/**
 * Choosing the part of a photo that becomes the profile picture: the photo in
 * a square, with the circle that is kept marked on it. Drag it (a finger or the
 * mouse) or use the arrow keys to move it; zoom with the slider, its − and +,
 * the mouse wheel, a pinch, or + and − on the keyboard. Save picture sends the
 * square, cut out here (a canvas), so the server only makes it smaller.
 * `onUnreadable` when the browser can't show the photo (HEIC, or TIFF outside
 * Safari): the server, which reads more kinds, then decides.
 */
export function AvatarCrop({ src, onCancel, onSave, onUnreadable }: {
  /** The photo, as an object URL. */
  src: string;
  onCancel: () => void;
  onSave: (picture: File) => void;
  onUnreadable: () => void;
}) {
  const headingId = useId();
  const hintId = useId();
  const image = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const [size, setSize] = useState<Size | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, zoom: 1 });

  // Moves the photo by (dx, dy) and zooms it around (px, py), all in pixels of
  // the square on screen, (px, py) from its middle: the point of the photo
  // under (px, py) stays there as it zooms.
  function adjust({ dx = 0, dy = 0, px = 0, py = 0, zoom = (current: number) => current }: {
    dx?: number; dy?: number; px?: number; py?: number; zoom?: (current: number) => number;
  }) {
    const side = stage.current?.clientWidth;
    if (!size || !side) return;
    setCrop((current) => {
      const base = Math.min(size.width, size.height);
      const next = clamp(zoom(current.zoom), 1, maxZoom);
      // Photo pixels per pixel on screen, before and after.
      const before = base / current.zoom / side;
      const after = base / next / side;
      return within({
        zoom: next,
        x: current.x + px * (before - after) - dx * after,
        y: current.y + py * (before - after) - dy * after,
      }, size);
    });
  }

  // The wheel zooms (React's wheel listeners can't stop the page scrolling).
  const latestAdjust = useRef(adjust);
  useEffect(() => { latestAdjust.current = adjust; });
  useEffect(() => {
    const element = stage.current!;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      latestAdjust.current({
        zoom: (current) => current * Math.exp(-event.deltaY * 0.002),
        px: event.clientX - box.left - box.width / 2,
        py: event.clientY - box.top - box.height / 2,
      });
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  function save() {
    const photo = image.current;
    const context = document.createElement("canvas").getContext("2d");
    if (!photo || !size || !context) return onUnreadable();
    const side = Math.min(size.width, size.height) / crop.zoom;
    const out = Math.max(1, Math.min(outputSide, Math.round(side)));
    context.canvas.width = context.canvas.height = out;
    context.imageSmoothingQuality = "high";
    context.drawImage(photo, crop.x - side / 2, crop.y - side / 2, side, side, 0, 0, out, out);
    // WebP where the browser makes it, PNG (its fallback) elsewhere.
    context.canvas.toBlob((blob) => {
      if (!blob) return onUnreadable();
      onSave(new File([blob], blob.type === "image/webp" ? "picture.webp" : "picture.png", { type: blob.type }));
    }, "image/webp", 0.92);
  }

  // The photo, placed in the square by percentages of it, so it needs no measuring.
  const base = size && Math.min(size.width, size.height);
  const placed: React.CSSProperties = size && base ? {
    width: `${(size.width / base) * crop.zoom * 100}%`,
    height: `${(size.height / base) * crop.zoom * 100}%`,
    left: `${(0.5 - (crop.x / base) * crop.zoom) * 100}%`,
    top: `${(0.5 - (crop.y / base) * crop.zoom) * 100}%`,
  } : { visibility: "hidden" };

  const moveKeys: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

  return (
    <Dialog className={styles.cropDialog} aria-labelledby={headingId} onClose={onCancel}>
      <div className={styles.cropBody}>
        <div className={styles.cropHeader}>
          <h2 id={headingId}>Adjust your picture</h2>
          <button type="button" className={styles.cropClose} aria-label="Close" onClick={onCancel}><CloseIcon /></button>
        </div>
        <div
          ref={stage}
          className={styles.cropStage}
          role="application"
          aria-label="Picture position"
          aria-describedby={hintId}
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            const map = pointers.current;
            if (!map.has(event.pointerId)) return;
            const before = [...map.values()];
            map.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const now = [...map.values()];
            const box = event.currentTarget.getBoundingClientRect();
            const from = middle(before);
            const to = middle(now);
            // One finger moves it; two also zoom, as far as they spread.
            const factor = spread(before) > 0 ? spread(now) / spread(before) : 1;
            adjust({
              dx: to.x - from.x, dy: to.y - from.y, zoom: (current) => current * factor,
              px: from.x - box.left - box.width / 2, py: from.y - box.top - box.height / 2,
            });
          }}
          onPointerUp={(event) => pointers.current.delete(event.pointerId)}
          onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
          onKeyDown={(event) => {
            const move = moveKeys[event.key];
            const step = event.shiftKey ? 40 : 10;
            if (move) adjust({ dx: move.x * step, dy: move.y * step });
            else if (event.key === "+" || event.key === "=") adjust({ zoom: (current) => current + zoomStep });
            else if (event.key === "-" || event.key === "_") adjust({ zoom: (current) => current - zoomStep });
            else return;
            event.preventDefault();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local photo (an object URL), drawn onto a canvas */}
          <img
            ref={image}
            src={src}
            alt=""
            draggable={false}
            style={placed}
            onLoad={(event) => {
              const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
              if (!width || !height) return onUnreadable();
              setSize({ width, height });
              setCrop({ x: width / 2, y: height / 2, zoom: 1 });
            }}
            onError={onUnreadable}
          />
          <span className={styles.cropCircle} aria-hidden="true" />
        </div>
        <p id={hintId} className={styles.cropHint}>
          Drag the photo to move it, and zoom in or out. The circle is what your picture shows.
        </p>
        <div className={styles.zoomRow}>
          <button type="button" className={styles.zoomButton} aria-label="Zoom out" disabled={!size || crop.zoom <= 1}
            onClick={() => adjust({ zoom: (current) => current - zoomStep })}><MinusIcon /></button>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={maxZoom}
            step={0.01}
            value={crop.zoom}
            aria-valuetext={`${Math.round(crop.zoom * 100)}%`}
            disabled={!size}
            onChange={(event) => adjust({ zoom: () => Number(event.target.value) })}
          />
          <button type="button" className={styles.zoomButton} aria-label="Zoom in" disabled={!size || crop.zoom >= maxZoom}
            onClick={() => adjust({ zoom: (current) => current + zoomStep })}><PlusIcon /></button>
        </div>
        <div className={ui.actions}>
          <button type="button" className={`${ui.button} ${ui.primary}`} disabled={!size} onClick={save}>Save picture</button>
          <button type="button" className={ui.button} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </Dialog>
  );
}
