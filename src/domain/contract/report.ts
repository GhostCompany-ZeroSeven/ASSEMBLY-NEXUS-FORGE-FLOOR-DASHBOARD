import type { ConformanceReport } from './runner';
import { RULES } from './rules';

/**
 * Plain-text (Markdown) rendering of a conformance run, for review and CI
 * artifacts. It states the profile's kind and provenance first so a mock run
 * can never be read as the Assembly Nexus contract. No aggregate score.
 */
export function renderReportMarkdown(r: ConformanceReport): string {
  const kind =
    r.profile.kind === 'MOCK'
      ? 'MOCK profile (this repository’s mock backend). It is not the Assembly Nexus contract, not production, and not Founder approved.'
      : r.profile.kind === 'REAL_ANN_PLACEHOLDER'
        ? 'Assembly Nexus PLACEHOLDER profile: every property is UNKNOWN until the Founder approves a contract. Not Founder approved.'
        : `${r.profile.kind} profile. Not Founder approved.`;
  const lines = [
    `# Contract conformance: ${r.profile.id}`,
    '',
    kind,
    '',
    `- Profile provenance: ${r.profile.provenance}`,
    `- Target: ${r.target ? `${r.target.id} (${r.target.kind})` : 'none (nothing executed)'}`,
    `- Event coverage may be EXACT under this profile: ${r.historyAssuredByProfile ? 'yes' : 'no'}`,
    '',
    'Results describe THIS RUN only. A PASS is an observation, not a guarantee, not authority,',
    'not certification and not Founder approval. UNKNOWN is never counted as PASS.',
    '',
    '| Rule | Kind | Requirement | Profile states | Result | Observed | Agreement with profile |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...r.outcomes.map((o) => {
      const def = RULES[o.ruleId];
      const clause = `${o.profileClause.guarantee}${o.profileClause.capability ? ` / ${o.profileClause.capability}` : ''}`;
      const observed = `${o.observed}${o.capability ? ` (capability: ${o.capability})` : ''}`;
      return `| ${o.ruleId} | ${def.kind} | ${def.requirement} | ${clause} | ${o.result} | ${observed} | ${o.profileConsistency} |`;
    }),
    '',
    '## Evidence',
    '',
    ...r.outcomes.flatMap((o) => [
      `### ${o.ruleId}: ${o.result}`,
      '',
      ...o.evidence.map((e) => `- ${e}`),
      ...(o.treatments
        ? ['', ...Object.entries(o.treatments).map(([k, v]) => `- ${k}: ${v}`)]
        : []),
      '',
    ]),
  ];
  return lines.join('\n');
}
