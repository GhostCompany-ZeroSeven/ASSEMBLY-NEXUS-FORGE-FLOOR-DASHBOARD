import { waitForSurface } from '@/test/render';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { DEFAULT_MISSION_FILTER } from '@/features/filters/filters';
import { ALERT_SCHEMA, MISSION_SCHEMA } from '@/features/filters/urlSchemas';
import { testAdapter } from '@/test/fixtures';
import { App } from './App';
import { MAX_TEXT, readState, writeQuery } from './urlState';

describe('URL state codecs (pure)', () => {
  it('unknown, malformed and oversized values fall back to defaults', () => {
    const f = readState(
      {
        group: 'evil',
        sort: '__proto__',
        priority: 'CRITICAL', // case matters: not a known value
        worker: '<script>alert(1)</script>',
        q: 'x'.repeat(5000),
      },
      DEFAULT_MISSION_FILTER,
      MISSION_SCHEMA,
    );
    expect(f.group).toBe('all');
    expect(f.sort).toBe('status');
    expect(f.priority).toBe('all');
    expect(f.workerId).toBe('all');
    expect(f.q).toHaveLength(MAX_TEXT);
  });

  it('control characters are stripped from free text', () => {
    const f = readState({ q: 'run\u0000ner\u001b' }, DEFAULT_MISSION_FILTER, MISSION_SCHEMA);
    expect(f.q).toBe('runner');
  });

  it('valid values round-trip; defaults are omitted from the URL', () => {
    const state = { ...DEFAULT_MISSION_FILTER, group: 'blocked' as const, workerId: 'w-ada' };
    const q = writeQuery(state, DEFAULT_MISSION_FILTER, MISSION_SCHEMA);
    expect(q).toEqual({
      q: undefined,
      group: 'blocked',
      priority: undefined,
      worker: 'w-ada',
      sort: undefined,
    });
    const clean = Object.fromEntries(Object.entries(q).filter(([, v]) => v)) as Record<
      string,
      string
    >;
    expect(readState(clean, DEFAULT_MISSION_FILTER, MISSION_SCHEMA)).toEqual(state);
  });

  it('boolean flags accept only 1/0', () => {
    const d = { q: '', severity: 'ALL' as const, humanOnly: false, sort: 'severity' as const };
    expect(readState({ human: '1' }, d, ALERT_SCHEMA).humanOnly).toBe(true);
    expect(readState({ human: 'true' }, d, ALERT_SCHEMA).humanOnly).toBe(false);
  });
});

async function renderAt(hash: string, adapter = testAdapter()) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}

const quick = (name: RegExp) =>
  within(screen.getByRole('radiogroup', { name: /quick filter/ })).getByRole('radio', { name });

describe('URL-persisted filters in the app', () => {
  it('a deep link restores filters and sorting', async () => {
    await renderAt('#/missions?group=blocked&sort=priority&q=migration');
    expect(quick(/^Blocked/)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('searchbox')).toHaveValue('migration');
    expect(screen.getByLabelText('Sort by')).toHaveValue('priority');
  });

  it('invalid parameters render the default view instead of crashing', async () => {
    await renderAt('#/missions?group=%00%00&sort=drop%20table&priority=9');
    expect(quick(/^All/)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Sort by')).toHaveValue('status');
  });

  it('choices update the URL; Back restores the previous view', async () => {
    const user = userEvent.setup();
    await renderAt('#/missions');
    await user.click(quick(/^Blocked/));
    expect(window.location.hash).toBe('#/missions?group=blocked');
    await user.click(quick(/^Queued/));
    expect(window.location.hash).toBe('#/missions?group=queued');
    await act(async () => {
      history.back();
    });
    await waitFor(() => expect(quick(/^Blocked/)).toHaveAttribute('aria-checked', 'true'));
    expect(window.location.hash).toBe('#/missions?group=blocked');
  });

  it('typing replaces the history entry instead of adding one per keystroke', async () => {
    const user = userEvent.setup();
    await renderAt('#/workers');
    const before = history.length;
    await user.type(screen.getByRole('searchbox'), 'ada');
    expect(window.location.hash).toBe('#/workers?q=ada');
    expect(history.length).toBe(before);
  });

  it('URL PARAMETER ≠ BACKEND FACT: an unknown worker id filters to nothing and creates nothing', async () => {
    const adapter = await renderAt('#/missions?worker=w-ghost');
    expect(adapter.getSnapshot().workers.some((w) => w.id === 'w-ghost')).toBe(false);
    expect(screen.getByText('No missions match these filters')).toBeInTheDocument();
    // The select shows the value honestly, not as a real worker.
    expect(
      screen.getByRole('option', { name: 'w-ghost (not in current data)' }),
    ).toBeInTheDocument();
  });
});
