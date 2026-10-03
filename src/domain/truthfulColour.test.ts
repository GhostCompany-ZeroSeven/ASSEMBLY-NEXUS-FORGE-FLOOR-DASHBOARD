import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APPROVAL_STATUS_META, healthTone, HEALTH_STATUS_META, RISK_TONE } from './status';

/**
 * Nexus Signature colour truthfulness. Colour may represent a real known
 * state; it must never fabricate one. Lime (`success`) is reserved for
 * data-backed positive outcomes.
 */

const css = (f: string) => readFileSync(`src/styles/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (text: string, selector: string) => {
  const i = text.indexOf(`${selector} {`);
  expect(i, selector).toBeGreaterThanOrEqual(0);
  return text.slice(i, text.indexOf('}', i));
};

describe('health colour: one rule everywhere', () => {
  const base = { status: 'NOMINAL' as const, connection: 'connected' };
  it('lime only for a current, complete, connected, real NOMINAL report', () => {
    expect(healthTone(base)).toBe('success');
  });
  it.each([
    ['simulated', { simulated: true }, 'warning'],
    ['stale', { stale: true }, 'warning'],
    ['partial', { partial: true }, 'warning'],
    ['reconnecting', { connection: 'reconnecting' }, 'warning'],
    ['connection lost', { connection: 'error' }, 'danger'],
  ] as const)('a NOMINAL report that is %s is not lime', (_, extra, tone) => {
    expect(healthTone({ ...base, ...extra })).toBe(tone);
  });
  it('unknown stays neutral, critical stays red, degraded stays amber', () => {
    expect(healthTone({ status: 'UNKNOWN' })).toBe('muted');
    expect(healthTone({ status: 'CRITICAL', simulated: true })).toBe('danger');
    expect(healthTone({ status: 'DEGRADED' })).toBe('warning');
  });
  it('an unrecognised status falls back to neutral, never green', () => {
    expect(healthTone({ status: 'BOGUS' as never })).toBe('muted');
    expect(HEALTH_STATUS_META.UNKNOWN.tone).toBe('muted');
  });
});

describe('approval and risk colour', () => {
  it('only an APPROVED decision is lime; pending is Founder amber; held is review UV', () => {
    const lime = Object.entries(APPROVAL_STATUS_META)
      .filter(([, v]) => v.tone === 'success')
      .map(([k]) => k);
    expect(lime).toEqual(['APPROVED']);
    expect(APPROVAL_STATUS_META.PENDING.tone).toBe('warning');
    expect(APPROVAL_STATUS_META.HELD.tone).toBe('progress');
    expect(APPROVAL_STATUS_META.DENIED.tone).toBe('danger');
  });
  it('risk is an assessment, never lime', () => {
    expect(Object.values(RISK_TONE)).not.toContain('success');
  });
});

describe('Nexus Signature styles keep the truth', () => {
  const features = css('features.css');
  const components = css('components.css');
  const shell = css('shell.css');
  const tokens = css('tokens.css');
  const vf = css('visual-floor.css');

  it('APPROVE is a green ACTION token, distinct from the lime APPROVED state', () => {
    expect(rule(features, '.gate-btn--approve')).toMatch(/--c:\s*var\(--action-approve\)/);
    const approve = /--action-approve:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];
    const success = /--tone-success:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];
    expect(approve).toBeTruthy();
    expect(approve).not.toBe(success);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(approve!.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r! + 60); // visibly green
    expect(g).toBeGreaterThan(b! + 60);
    // The decided state is a FILLED badge; an action is an outlined control.
    expect(features).toMatch(/\.gate\[data-status='APPROVED'\] \.gate__head \.badge/);
  });

  it('HOLD is review UV and DENY is red', () => {
    expect(rule(features, '.gate-btn--hold')).toMatch(/var\(--action-hold\)/);
    expect(tokens).toMatch(/--action-hold:\s*var\(--tone-progress\)/);
    expect(tokens).toMatch(/--action-deny:\s*var\(--tone-danger\)/);
  });

  it('Founder-gated and LIVE never borrow the completion lime', () => {
    expect(rule(components, ".action-class[data-action-class='FOUNDER_GATED_OPERATION']")).toMatch(
      /var\(--tone-founder\)/,
    );
    expect(rule(shell, ".provenance[data-mode='live'] .provenance__mode")).toMatch(
      /var\(--tone-connectivity\)/,
    );
  });

  it('Founder amber is protected', () => {
    expect(tokens).toMatch(/--tone-warning:\s*#fbbf24/);
    expect(tokens).toMatch(/--tone-founder:\s*var\(--tone-warning\)/);
    expect(tokens).toMatch(/--family-founder:\s*#fbbf24/);
  });

  it('Visual Forge Floor HUD headings and selections are not lime', () => {
    expect(rule(vf, '.vf__panel h2')).not.toMatch(/lime/);
    expect(rule(vf, '.vf__preset:has(input:checked)')).not.toMatch(/lime/);
    expect(rule(vf, '.vf__clock')).not.toMatch(/lime/);
  });
});
