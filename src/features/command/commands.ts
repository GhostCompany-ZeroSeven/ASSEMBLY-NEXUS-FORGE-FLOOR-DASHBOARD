import { href, parseHashQuery, parseRoute, withQuery } from '@/app/router';
import type { SearchResult } from '@/features/search/search';
import { resourceUnavailable } from '@/domain/selectors';
import { en, type Messages } from '@/i18n/en';
import { LOCALE_NAMES, SUPPORTED_LOCALES, type Locale } from '@/i18n/locales';
import type { DashboardConfig } from '@/config/types';
import type { SimulationControls } from '@/adapters/types';
import type { DashboardSnapshot } from '@/domain/snapshot';

export type CommandGroup =
  'Navigate' | 'Attention' | 'Diagnostics' | 'Simulation' | 'Display' | 'Help' | 'Result';

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** Secondary text, e.g. worker role or mission status. */
  hint?: string;
  keywords?: string;
  /** Human readable shortcut, e.g. "G then F". */
  shortcut?: string;
  /** Present on search results: what the item is, its status and where it opens. */
  result?: { type: string; status: string; surface: string; context?: string };
  run: () => void;
}

/** Two-key "go to" sequences: press G, then the letter. */
export const GO_KEYS: {
  key: string;
  /** Key into `Messages['nav']` (display text is localized, the key is not). */
  nav:
    'command' | 'floor' | 'missions' | 'workers' | 'approvals' | 'alerts' | 'activity' | 'settings';
  target: () => string;
  flag?: keyof DashboardConfig['features'];
}[] = [
  { key: 'c', nav: 'command', target: href.command },
  { key: 'f', nav: 'floor', target: href.floor, flag: 'forgeFloor' },
  { key: 'm', nav: 'missions', target: href.missions },
  { key: 'w', nav: 'workers', target: href.workers },
  { key: 'a', nav: 'approvals', target: href.approvals, flag: 'approvals' },
  { key: 'l', nav: 'alerts', target: href.alerts, flag: 'alerts' },
  { key: 'v', nav: 'activity', target: href.activity },
  { key: 's', nav: 'settings', target: href.settings },
];

/** Surfaces whose filters live in the URL (see useUrlState). */
const FILTERABLE = new Set(['missions', 'workers', 'approvals', 'alerts', 'floor']);

export interface CommandContext {
  snapshot: DashboardSnapshot;
  config: DashboardConfig;
  navigate: (hash: string) => void;
  sim: { controls: SimulationControls; running: boolean } | null;
  openShortcuts: () => void;
  setTheme: (id: string) => void;
  /** Active UI messages (defaults to English). */
  m?: Messages;
  locale?: Locale;
  setLocale?: (l: Locale) => void;
  /** Current location hash, for page-scoped commands such as "clear filters". */
  hash?: string;
}

/**
 * Palette commands. Every command here is NAVIGATION or PRESENTATION only
 * (open a surface, change language/theme, clear view filters, drive the demo
 * simulation). No command approves, denies, grants authority, dispatches
 * workers or calls a backend operation; see governance.phase4.test.ts.
 */
export function buildCommands(ctx: CommandContext): Command[] {
  const { config, navigate } = ctx;
  const m = ctx.m ?? en;
  const p = m.palette;
  const cmds: Command[] = GO_KEYS.filter((g) => !g.flag || config.features[g.flag]).map((g) => ({
    id: `nav:${g.key}`,
    title: p.open(m.nav[g.nav]),
    group: 'Navigate',
    shortcut: p.thenKey(g.key.toUpperCase()),
    keywords: `${en.nav[g.nav]} go open`,
    run: () => navigate(g.target()),
  }));

  // Founder attention: open gates first (navigation only; deciding stays on the gate card).
  if (config.features.approvals) {
    cmds.push({
      id: 'attention:founder',
      title: p.founderAttention,
      group: 'Attention',
      keywords: 'founder decide approval gate waiting attention',
      run: () => navigate(withQuery(href.approvals(), { view: 'open' })),
    });
  }
  // Resources the latest sync could not load: jump to where it shows.
  const UNAVAILABLE_TARGET = {
    missions: href.missions,
    workers: href.workers,
    approvals: href.approvals,
    alerts: href.alerts,
  } as const;
  for (const r of ['missions', 'workers', 'approvals', 'alerts'] as const) {
    if (!resourceUnavailable(ctx.snapshot, r)) continue;
    cmds.push({
      id: `attention:unavailable:${r}`,
      title: p.unavailable(m.nav[r]),
      group: 'Attention',
      keywords: 'unavailable partial error data problem',
      run: () => navigate(UNAVAILABLE_TARGET[r]()),
    });
  }
  cmds.push({
    id: 'diag:transport',
    title: p.transport,
    group: 'Diagnostics',
    keywords: 'transport stream sse poll backend connection diagnostics freshness',
    run: () => navigate(withQuery(href.settings(), { focus: 'transport' })),
  });
  // Clear view filters on the current list page (URL view state only).
  if (ctx.hash) {
    const route = parseRoute(ctx.hash);
    const query = parseHashQuery(ctx.hash);
    if (FILTERABLE.has(route.name) && Object.keys(query).some((k) => k !== 'focus')) {
      const path = ctx.hash.split('?')[0]!;
      cmds.push({
        id: 'view:clear-filters',
        title: p.clearFilters,
        group: 'Display',
        keywords: 'clear reset filters search sort',
        run: () => navigate(path),
      });
    }
  }

  if (ctx.sim) {
    const { controls, running } = ctx.sim;
    cmds.push(
      {
        id: 'sim:toggle',
        title: running ? p.pause : p.resume,
        group: 'Simulation',
        shortcut: 'P',
        keywords: 'pause resume play stop demo',
        run: () => controls.setRunning(!running),
      },
      {
        id: 'sim:step',
        title: p.step,
        group: 'Simulation',
        shortcut: 'N',
        keywords: 'next step demo',
        run: () => controls.step(),
      },
      {
        id: 'sim:reset',
        title: p.reset,
        group: 'Simulation',
        keywords: 'restart demo',
        run: () => controls.reset(),
      },
    );
  }
  if (ctx.setLocale) {
    for (const l of SUPPORTED_LOCALES) {
      if (l === ctx.locale) continue;
      const setLocale = ctx.setLocale;
      cmds.push({
        id: `locale:${l}`,
        title: p.language(LOCALE_NAMES[l]),
        group: 'Display',
        keywords: 'language idioma locale english español spanish',
        run: () => setLocale(l),
      });
    }
  }
  for (const t of config.themes) {
    cmds.push({
      id: `theme:${t.id}`,
      title: p.theme(t.label),
      group: 'Display',
      keywords: 'theme colour color appearance',
      run: () => ctx.setTheme(t.id),
    });
  }
  cmds.push({
    id: 'help:shortcuts',
    title: p.shortcuts,
    group: 'Help',
    shortcut: '?',
    keywords: 'keys keyboard help',
    run: ctx.openShortcuts,
  });
  return cmds;
}

/** Every whitespace-separated term must match; title-prefix matches rank first. */
export function filterCommands(cmds: readonly Command[], query: string, limit = 50): Command[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return cmds.slice(0, limit);
  const scored = cmds
    .map((c) => {
      const title = c.title.toLowerCase();
      const hay = `${title} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return null;
      const score = title.startsWith(terms[0]!) ? 0 : title.includes(terms[0]!) ? 1 : 2;
      return { c, score };
    })
    .filter((x): x is { c: Command; score: number } => x !== null)
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((x) => x.c);
}

/** Keyboard events we must not hijack: typing in fields, or browser/OS chords. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Turn a search result into a palette entry that navigates to its surface (and does nothing else). */
export function resultToCommand(
  r: SearchResult,
  navigate: (hash: string) => void,
  m: Messages = en,
): Command {
  return {
    id: `result:${r.type}:${r.id}`,
    title: r.title,
    group: 'Result',
    result: {
      type: m.search.type[r.type],
      status: r.status,
      surface: r.surface,
      context: r.context,
    },
    run: () => navigate(r.href),
  };
}
