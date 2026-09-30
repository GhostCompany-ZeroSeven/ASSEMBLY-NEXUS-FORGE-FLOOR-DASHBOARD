import { lazy, Suspense, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createSurfaces, SURFACE_LOADERS } from './surfaces';
import { SurfaceErrorBoundary, SurfaceLoading } from './SurfaceParts';

describe('route code splitting', () => {
  it('every routed surface has a lazy loader that resolves to a component', async () => {
    for (const load of Object.values(SURFACE_LOADERS)) {
      const mod = await load();
      expect(typeof mod.default).toBe('function');
    }
    expect(Object.keys(createSurfaces()).sort()).toEqual(Object.keys(SURFACE_LOADERS).sort());
  });

  it('shows an accessible loading state', () => {
    render(<SurfaceLoading label="Forge Floor" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Forge Floor…');
  });

  it('recovers from a failed chunk load with Retry (new lazy generation)', async () => {
    let attempts = 0;
    const makeLazy = () =>
      lazy(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('ChunkLoadError');
        return { default: () => <p>Surface loaded</p> };
      });
    function Harness() {
      const [gen, setGen] = useState({ n: 0, C: makeLazy() });
      const C = gen.C;
      return (
        <SurfaceErrorBoundary
          key={gen.n}
          label="Missions"
          onRetry={() => setGen((g) => ({ n: g.n + 1, C: makeLazy() }))}
        >
          <Suspense fallback={<SurfaceLoading label="Missions" />}>
            <C />
          </Suspense>
        </SurfaceErrorBoundary>
      );
    }
    const spy = console.error;
    console.error = () => {}; // React logs caught boundary errors
    try {
      render(<Harness />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load Missions');
      await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
      expect(await screen.findByText('Surface loaded')).toBeInTheDocument();
      expect(attempts).toBe(2);
    } finally {
      console.error = spy;
    }
  });
});
