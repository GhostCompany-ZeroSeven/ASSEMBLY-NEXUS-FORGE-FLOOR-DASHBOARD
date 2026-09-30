import type { Messages } from '@/i18n/en';

/** Call every message with sample arguments and collect the produced strings. */
export function allStrings(m: Messages): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') {
      const args = Array.from({ length: (v as () => unknown).length }, (_, i) =>
        i === 0 ? 2 : 'X',
      );
      const r = (v as (...a: unknown[]) => unknown)(...args);
      const r1 = (v as (...a: unknown[]) => unknown)(...args.map((a) => (a === 2 ? 1 : a)));
      if (typeof r === 'string') out.push(r);
      if (typeof r1 === 'string') out.push(r1);
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(m);
  return out;
}
