import { Component, Suspense, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import type { SurfaceName } from './surfaces';

/** Accessible, fixed-height loading state (avoids layout jump). */
export function SurfaceLoading({ label }: { label: string }) {
  return (
    <div className="page surface-loading" role="status" aria-live="polite">
      <span className="surface-loading__bar" aria-hidden="true" />
      Loading {label}…
    </div>
  );
}

/** Marks the rendered surface for tests and tooling once its chunk has loaded. */
export function SurfaceReady({
  name,
  children,
}: {
  name: SurfaceName | 'not-found';
  children: ReactNode;
}) {
  return (
    <div data-surface="ready" data-surface-name={name} className="surface">
      {children}
    </div>
  );
}

interface BoundaryProps {
  label: string;
  onRetry: () => void;
  children: ReactNode;
}

/** Recovers from lazy-chunk failures (offline, deploy replaced chunks) without a blank screen. */
export class SurfaceErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" role="alert">
        <h1 className="page__title">Could not load {this.props.label}</h1>
        <p className="muted">
          The code for this surface did not load. You may be offline, or the dashboard was updated.
          Your data and decisions are unaffected.
        </p>
        <p>
          <button type="button" className="btn" onClick={this.props.onRetry}>
            <Icon name="reset" size={14} /> Retry
          </button>{' '}
          <button type="button" className="btn btn--ghost" onClick={() => window.location.reload()}>
            Reload the dashboard
          </button>
        </p>
      </div>
    );
  }
}

export { Suspense };
