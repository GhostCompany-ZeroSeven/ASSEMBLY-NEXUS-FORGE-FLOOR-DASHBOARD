import { useLayoutEffect, useRef } from 'react';
import type { HierarchyLayout } from '@/config/types';
import {
  composeOffsets,
  fitGlyph,
  glyphTarget,
  segmentLine,
  type GlyphKind,
  type Ink,
} from './brandGeometry';

/**
 * The identity hierarchy as a composed typographic mark. Every line stays
 * real text in reading order (one list item per line); geometry is applied
 * after layout from measurements of the rendered text in the viewer's fonts:
 * controlled symbols are sized from their measured ink, and lines are offset
 * with margins from measured character positions. No whitespace is inserted.
 */
export function BrandHierarchy({
  lines,
  layout,
  label,
  large = false,
}: {
  lines: readonly string[];
  layout?: HierarchyLayout;
  label: string;
  large?: boolean;
}) {
  const ref = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const ol = ref.current;
    // Layout measurement needs a real rendering engine (not jsdom).
    if (!ol || !('fonts' in document)) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) applyGeometry(ol, lines, layout);
    };
    run();
    void document.fonts.ready.then(run);
    document.fonts.addEventListener('loadingdone', run);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener('loadingdone', run);
    };
  }, [lines, layout]);

  return (
    <ol
      ref={ref}
      className={large ? 'hierarchy hierarchy--large' : 'hierarchy'}
      aria-label={label}
      data-composed={layout ? 'true' : undefined}
    >
      {lines.map((line) => (
        <li key={line}>
          {segmentLine(line).map((s, i) =>
            s.glyph ? (
              <span key={i} className="brand-glyph" data-glyph={s.glyph}>
                {s.text}
              </span>
            ) : (
              s.text
            ),
          )}
        </li>
      ))}
    </ol>
  );
}

const PROBE = 100;

function applyGeometry(
  ol: HTMLOListElement,
  lines: readonly string[],
  layout: HierarchyLayout | undefined,
) {
  const items = [...ol.children] as HTMLElement[];
  if (items.length !== lines.length) return;

  // 1. Glyph sizes, from canvas ink metrics in each line's own font.
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) {
    for (const li of items) {
      const cs = getComputedStyle(li);
      const px = parseFloat(cs.fontSize);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${PROBE}px ${cs.fontFamily}`;
      const ink = (s: string): Ink => {
        const t = ctx.measureText(s);
        return {
          width: t.actualBoundingBoxLeft + t.actualBoundingBoxRight,
          height: t.actualBoundingBoxAscent + t.actualBoundingBoxDescent,
          ascent: t.actualBoundingBoxAscent,
          descent: t.actualBoundingBoxDescent,
        };
      };
      const metrics = { xHeight: ink('x').ascent, capHeight: ink('H').ascent };
      for (const span of li.querySelectorAll<HTMLElement>('.brand-glyph')) {
        const kind = span.dataset.glyph as GlyphKind;
        const fit = fitGlyph(ink(span.textContent ?? ''), glyphTarget(kind, metrics), metrics);
        span.style.fontSize = `${fit.scale}em`;
        span.style.verticalAlign = `${(fit.raise * px) / PROBE}px`;
      }
    }
  }

  // 2. Line offsets, from measured character positions.
  if (!layout) return;
  for (const li of items) li.style.marginLeft = '0px';
  const boxes = items.map((li) => li.getBoundingClientRect());
  if (boxes.some((b) => b.width === 0)) return;
  const offsets = composeOffsets(lines, layout, {
    widths: boxes.map((b) => b.width),
    x: (line, index) => charLeft(items[line]!, index) - boxes[line]!.left,
    em: parseFloat(getComputedStyle(ol).fontSize),
  });
  items.forEach((li, i) => (li.style.marginLeft = `${offsets[i]}px`));
}

/** Left edge of the character at `index` of an element's text content. */
function charLeft(el: HTMLElement, index: number): number {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let rest = index;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = (n as Text).length;
    if (rest < len) {
      const r = document.createRange();
      r.setStart(n, rest);
      r.setEnd(n, rest + 1);
      return r.getBoundingClientRect().left;
    }
    rest -= len;
  }
  return el.getBoundingClientRect().right;
}
