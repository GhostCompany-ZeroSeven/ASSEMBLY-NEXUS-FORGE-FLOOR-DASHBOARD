import { restTestAdapter } from '@/test/adapters';
import { AnnAdapter } from './ann/AnnAdapter';
import { MockAnnFeedSource } from './ann/mockFeed';
import { describeAdapterConformance } from '@/test/conformance';
import { testAdapter } from '@/test/fixtures';

describeAdapterConformance('DemoAdapter', () => ({
  adapter: testAdapter(),
  expectedDelivery: 'simulated',
  pendingApprovalId: 'APR-031',
  decidedApprovalId: 'APR-030',
  humanAuthority: 'Founder #0007',
}));

describeAdapterConformance('RestAdapter (in-memory backend)', () => {
  const { adapter } = restTestAdapter();
  return {
    adapter,
    expectedDelivery: 'delivered',
    pendingApprovalId: 'APR-031',
    decidedApprovalId: 'APR-030',
    humanAuthority: 'Founder #0007',
    settle: async () => {
      await adapter.refresh();
    },
  };
});

const FIXED = Date.parse('2026-09-30T12:00:00Z');
describeAdapterConformance('AnnAdapter (read-only, simulated mock feed)', () => ({
  adapter: new AnnAdapter(new MockAnnFeedSource('normal', 'Founder #0007', () => FIXED), {
    humanAuthority: 'Founder #0007',
    now: () => FIXED,
  }),
  expectedDelivery: 'simulated',
  pendingApprovalId: 'ann-apr-031',
  decidedApprovalId: 'ann-apr-030',
  humanAuthority: 'Founder #0007',
  readOnly: true,
}));
