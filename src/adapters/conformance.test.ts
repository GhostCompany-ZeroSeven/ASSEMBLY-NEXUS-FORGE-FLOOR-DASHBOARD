import { restTestAdapter } from '@/test/adapters';
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
