import { useEffect, useRef } from 'react';
import './nexusField.css';
import {
  cycleT,
  dimmed,
  drawFrame,
  EXIT_FADE_MS,
  drawRest,
  latticeCount,
  litDots,
  makeSprites,
  PALETTE_TOKENS,
  REFERENCE_PALETTE,
  REFERENCE_REST,
  REST_TOKEN,
  type FieldMode,
  type LitDot,
} from './dotField';

const DPR_CAP = 2;

/**
 * Layout containers of the field surface. Only over these (the open space
 * between modules, where the lattice shows) does the circular reticle replace
 * the system cursor; over panels, text and controls the native cursor stays.
 */
const OPEN = ['page--field', 'page__header', 'grid', 'stack', 'situation'];
const isOpenSpace = (t: EventTarget | null, page: Element | null) =>
  t instanceof Element && !!page && page.contains(t) && OPEN.some((c) => t.classList.contains(c));

/**
 * The ambient dot field's canvas. Decorative only: aria-hidden, no pointer
 * events, nothing focusable, behind the page content, reads no dashboard
 * data. It observes the pointer position without ever receiving input.
 *
 * With no pointer over the surface it is a static resting lattice and runs no
 * animation at all (after a short exit fade in FULL mode). While the pointer is over it, each frame lights the dots
 * near the CURRENT pointer position; FULL also advances the 8 s colour cycle
 * (REDUCED / reduced-motion freezes the cycle). State is exposed on data
 * attributes for tests and performance review only.
 *
 * Also owns the approved circular cursor: a small precise reticle that stands
 * in for the system cursor only over the field's open space (see OPEN).
 */
export default function NexusFieldCanvas({ mode }: { mode: Exclude<FieldMode, 'off'> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const reticle = reticleRef.current;
    const page = canvas?.closest('.page--field') ?? null;
    // The reticle follows a fine pointer only; it is moved with a transform,
    // never through React state, and never receives input.
    const showReticle = (x: number, y: number, on: boolean) => {
      if (!reticle) return;
      if (on) reticle.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      reticle.dataset.visible = on ? 'true' : 'false';
      if (page instanceof HTMLElement) page.dataset.reticle = on ? 'on' : 'off';
    };
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const cycling = mode === 'full';
    const root = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) =>
      root.getPropertyValue(name).trim() || fallback;
    const colours = PALETTE_TOKENS.map((t, i) => token(t, REFERENCE_PALETTE[i]!));
    const rest = token(REST_TOKEN, REFERENCE_REST);
    const sprites = makeSprites(colours, dpr);
    const restLayer = document.createElement('canvas');
    const restCtx = restLayer.getContext('2d');

    let w = 0;
    let h = 0;
    let rect = canvas.getBoundingClientRect();
    // The pointer: its current position only. No history, no velocity.
    let pointer: { x: number; y: number } | null = null;
    // Exit fade: the dots lit at the moment the pointer left, dimming in place.
    let exit: { lit: LitDot[]; at: number } | null = null;
    let raf = 0;
    let frames = 0;
    let cost = 0;
    let lastLit = 0;

    const stats = () => {
      canvas.dataset.state = pointer ? 'lit' : exit ? 'fading' : 'rest';
      canvas.dataset.count = String(latticeCount(w, h));
      canvas.dataset.lit = String(lastLit);
      canvas.dataset.frames = String(frames);
      canvas.dataset.costMs = cost.toFixed(3);
      canvas.dataset.dpr = String(dpr);
      canvas.dataset.cycle = cycling ? 'running' : 'frozen';
    };

    const render = () => {
      const t0 = performance.now();
      const t = cycling ? cycleT(performance.now()) : 0;
      let lit: LitDot[] = [];
      if (pointer) lit = litDots(w, h, pointer.x, pointer.y);
      else if (exit) {
        const f = 1 - (performance.now() - exit.at) / EXIT_FADE_MS;
        if (f > 0) lit = dimmed(exit.lit, f);
        else exit = null;
      }
      drawFrame(ctx, restLayer, lit, sprites, colours, t);
      lastLit = lit.length;
      frames++;
      cost += performance.now() - t0;
      canvas.dataset.t = t.toFixed(4);
      stats();
    };

    const frame = () => {
      raf = 0;
      if (document.hidden) return;
      render();
      // Only the colour cycle (while lit) and the exit fade need more frames.
      if ((pointer && cycling) || exit) raf = requestAnimationFrame(frame);
    };
    const schedule = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
    };

    // The field covers only the visible main area: below the sticky top bar
    // (and the horizontal nav on narrow screens), right of the side nav.
    const layout = () => {
      const main = canvas.closest('main')?.getBoundingClientRect();
      const bars = [...document.querySelectorAll<HTMLElement>('.topbar, .sidenav')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > r.height);
      const top = Math.max(0, ...bars.map((r) => r.bottom));
      const left = Math.max(0, main?.left ?? 0);
      w = window.innerWidth - left;
      h = window.innerHeight - top;
      Object.assign(canvas.style, {
        top: `${top}px`,
        left: `${left}px`,
        width: `${w}px`,
        height: `${h}px`,
      });
      rect = canvas.getBoundingClientRect();
      canvas.width = restLayer.width = Math.round(w * dpr);
      canvas.height = restLayer.height = Math.round(h * dpr);
      if (restCtx) drawRest(restCtx, w, h, dpr, rest);
    };

    const leave = () => {
      showReticle(0, 0, false);
      if (!pointer) return;
      // Dim in place, then exactly at rest. Reduced motion: at rest at once.
      exit = cycling ? { lit: litDots(w, h, pointer.x, pointer.y), at: performance.now() } : null;
      pointer = null;
      cancelAnimationFrame(raf);
      raf = 0;
      render();
      schedule();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > w || y > h) return leave();
      showReticle(e.clientX, e.clientY, isOpenSpace(e.target, page));
      pointer = { x, y };
      exit = null;
      schedule();
    };
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) leave(); // left the window
    };
    const onResize = () => {
      layout();
      render();
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        canvas.dataset.paused = 'true';
      } else {
        delete canvas.dataset.paused;
        schedule();
      }
    };

    layout();
    render();
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    window.addEventListener('blur', leave);
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      window.removeEventListener('blur', leave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      showReticle(0, 0, false);
      if (page instanceof HTMLElement) delete page.dataset.reticle;
    };
  }, [mode]);

  return (
    <>
      <canvas ref={ref} className="nx-field" aria-hidden="true" data-field-mode={mode} />
      <div ref={reticleRef} className="nx-reticle" aria-hidden="true" data-visible="false" />
    </>
  );
}
