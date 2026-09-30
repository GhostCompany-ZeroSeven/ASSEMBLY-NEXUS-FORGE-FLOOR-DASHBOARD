import { href } from '@/app/router';
import type { DashboardConfig } from '@/config/types';
import type { SimulationControls } from '@/adapters/types';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { MISSION_STATUS_META, WORKER_STATE_META } from '@/domain/status';

export type CommandGroup = 'Navigate' | 'Workers' | 'Missions' | 'Simulation' | 'Display' | 'Help';

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** Secondary text, e.g. worker role or mission status. */
  hint?: string;
  keywords?: string;
  /** Human readable shortcut, e.g. "G then F". */
  shortcut?: string;
  run: () => void;
}

/** Two-key "go to" sequences: press G, then the letter. */
export const GO_KEYS: {
  key: string;
  label: string;
  target: () => string;
  flag?: keyof DashboardConfig['features'];
}[] = [
  { key: 'c', label: 'Command Center', target: href.command },
  { key: 'f', label: 'Forge Floor', target: href.floor, flag: 'forgeFloor' },
  { key: 'm', label: 'Missions', target: href.missions },
  { key: 'w', label: 'Workers', target: href.workers },
  { key: 'a', label: 'Approval Gates', target: href.approvals, flag: 'approvals' },
  { key: 'l', label: 'Alerts', target: href.alerts, flag: 'alerts' },
  { key: 'v', label: 'Activity', target: href.activity },
  { key: 's', label: 'Settings', target: href.settings },
];

export interface CommandContext {
  snapshot: DashboardSnapshot;
  config: DashboardConfig;
  navigate: (hash: string) => void;
  sim: { controls: SimulationControls; running: boolean } | null;
  openShortcuts: () => void;
  setTheme: (id: string) => void;
}

export function buildCommands(ctx: CommandContext): Command[] {
  const { snapshot, config, navigate } = ctx;
  const cmds: Command[] = GO_KEYS.filter((g) => !g.flag || config.features[g.flag]).map((g) => ({
    id: `nav:${g.key}`,
    title: `Open ${g.label}`,
    group: 'Navigate',
    shortcut: `G then ${g.key.toUpperCase()}`,
    run: () => navigate(g.target()),
  }));

  for (const w of snapshot.workers) {
    cmds.push({
      id: `worker:${w.id}`,
      title: w.name,
      group: 'Workers',
      hint: `${w.role} · ${WORKER_STATE_META[w.state].label}`,
      keywords: `${w.id} ${w.role} ${w.state} worker`,
      run: () => navigate(href.worker(w.id)),
    });
  }
  for (const m of snapshot.missions) {
    cmds.push({
      id: `mission:${m.id}`,
      title: `${m.id} ${m.title}`,
      group: 'Missions',
      hint: MISSION_STATUS_META[m.status].label,
      keywords: `${m.status} mission`,
      run: () => navigate(href.mission(m.id)),
    });
  }
  if (ctx.sim) {
    const { controls, running } = ctx.sim;
    cmds.push(
      {
        id: 'sim:toggle',
        title: running ? 'Pause demo simulation' : 'Resume demo simulation',
        group: 'Simulation',
        shortcut: 'P',
        keywords: 'pause resume play stop demo',
        run: () => controls.setRunning(!running),
      },
      {
        id: 'sim:step',
        title: 'Advance demo one step',
        group: 'Simulation',
        shortcut: 'N',
        keywords: 'next step demo',
        run: () => controls.step(),
      },
      {
        id: 'sim:reset',
        title: 'Reset demo scenario',
        group: 'Simulation',
        keywords: 'restart demo',
        run: () => controls.reset(),
      },
    );
  }
  for (const t of config.themes) {
    cmds.push({
      id: `theme:${t.id}`,
      title: `Use ${t.label} theme`,
      group: 'Display',
      keywords: 'theme colour color appearance',
      run: () => ctx.setTheme(t.id),
    });
  }
  cmds.push({
    id: 'help:shortcuts',
    title: 'Show keyboard shortcuts',
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
  if (terms.length === 0)
    return cmds.filter((c) => c.group !== 'Missions' && c.group !== 'Workers').slice(0, limit);
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
