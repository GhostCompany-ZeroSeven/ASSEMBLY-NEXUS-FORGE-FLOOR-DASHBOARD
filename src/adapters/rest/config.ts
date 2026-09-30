import type { WorkerStateMapping } from '@/domain/status';

/**
 * Bounded configuration for the generic REST adapter.
 *
 * SECURITY BOUNDARY: this adapter runs in the browser. It carries no
 * credentials. There are no auth headers, no tokens, and no URLs with
 * embedded secrets. Authenticated backends must sit behind a same-origin
 * server-side proxy (backend-for-frontend) that holds credentials and
 * authenticates the human operator. See docs/ADAPTERS.md.
 */
export interface RestAdapterConfig {
  /** Absolute http(s) URL, or a same-origin path such as `/api/forge`. */
  baseUrl: string;
  /** Shown in the provenance badge. */
  label?: string;
  /** Resource paths relative to `baseUrl`. Omit optional ones to disable them. */
  endpoints?: Partial<RestEndpoints>;
  /** Poll interval. Clamped to [1000, 300000]. Default 5000. */
  pollIntervalMs?: number;
  /** Per-request timeout. Clamped to [500, 60000]. Default 8000. */
  requestTimeoutMs?: number;
  /** Data older than this shows as STALE. Default 3 × poll interval. */
  staleAfterMs?: number;
  /** Raw backend worker state → normalized state. */
  statusMapping?: WorkerStateMapping;
  /**
   * Cookie policy. `omit` (default) sends no cookies. `same-origin` lets a
   * same-origin proxy use its own session cookie. Cross-origin credentialed
   * requests (`include`) are intentionally not supported.
   */
  credentials?: 'omit' | 'same-origin';
  /**
   * Optional Server-Sent Events stream for push updates. REST polling remains the
   * source of full state and LIVE verification; while the stream is healthy the
   * adapter only re-syncs every `resyncIntervalMs`. If the stream fails
   * `maxRetries` times in a row the adapter falls back to polling and says so.
   */
  stream?: RestStreamConfig;
  /**
   * Contract profile this BUILD declares for the backend (see
   * domain/contract/profiles.ts; today only `mock`). Never read from backend
   * data. Omitted = undeclared: no source guarantee is assumed.
   */
  contractProfile?: string;
}

export interface RestStreamConfig {
  /** Path relative to `baseUrl`, e.g. `/stream`. */
  path: string;
  /** No message or heartbeat for this long → stream is stale. Default 20000, clamped 2s..120s. */
  heartbeatTimeoutMs?: number;
  /** Consecutive failures before falling back to polling. Default 5, clamped 0..20. */
  maxRetries?: number;
  /** Full REST re-sync interval while the stream is healthy. Default 60000, clamped ≥ pollIntervalMs. */
  resyncIntervalMs?: number;
}

export interface RestEndpoints {
  health: string;
  workers: string;
  missions: string;
  approvals: string;
  /** Optional. */
  alerts?: string;
  /** Optional. */
  events?: string;
  /** Optional. `:id` is replaced with the approval id. Enables decisions. */
  decide?: string;
  /** Optional. `:id` is replaced with the alert id. Enables acknowledgement. */
  acknowledge?: string;
}

export const DEFAULT_ENDPOINTS: RestEndpoints = {
  health: '/health',
  workers: '/workers',
  missions: '/missions',
  approvals: '/approvals',
  alerts: '/alerts',
  events: '/events',
};

export interface ResolvedRestConfig {
  baseUrl: string;
  label: string;
  endpoints: RestEndpoints;
  pollIntervalMs: number;
  requestTimeoutMs: number;
  staleAfterMs: number;
  statusMapping?: WorkerStateMapping;
  credentials: 'omit' | 'same-origin';
  stream?: Required<RestStreamConfig>;
  contractProfile?: string;
}

export class RestConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestConfigError';
  }
}

const SECRET_PARAM =
  /(^|[?&])(token|access_token|api[_-]?key|key|secret|password|auth|sig|signature)=/i;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Validate and normalize config. Throws `RestConfigError` for unsafe or
 * invalid values rather than guessing.
 */
export function resolveRestConfig(config: RestAdapterConfig): ResolvedRestConfig {
  if (!config || typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
    throw new RestConfigError('baseUrl is required.');
  }
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const isPath = baseUrl.startsWith('/') && !baseUrl.startsWith('//');
  if (!isPath) {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new RestConfigError(`baseUrl "${baseUrl}" is not a valid URL or same-origin path.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new RestConfigError('baseUrl must use http or https.');
    }
    if (url.username || url.password) {
      throw new RestConfigError('baseUrl must not contain credentials.');
    }
  }
  if (SECRET_PARAM.test(baseUrl)) {
    throw new RestConfigError('baseUrl must not contain secret-looking query parameters.');
  }

  const endpoints: RestEndpoints = { ...DEFAULT_ENDPOINTS, ...(config.endpoints ?? {}) };
  for (const [name, path] of Object.entries(endpoints)) {
    if (path === undefined) continue;
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new RestConfigError(`Endpoint "${name}" must be a path starting with "/".`);
    }
    if (SECRET_PARAM.test(path)) {
      throw new RestConfigError(
        `Endpoint "${name}" must not contain secret-looking query parameters.`,
      );
    }
  }

  const credentials = config.credentials ?? 'omit';
  if (credentials !== 'omit' && credentials !== 'same-origin') {
    throw new RestConfigError('credentials must be "omit" or "same-origin".');
  }

  const pollIntervalMs = clamp(config.pollIntervalMs ?? 5000, 1000, 300_000);
  const requestTimeoutMs = clamp(config.requestTimeoutMs ?? 8000, 500, 60_000);
  const staleAfterMs = Math.max(pollIntervalMs, config.staleAfterMs ?? pollIntervalMs * 3);

  let stream: Required<RestStreamConfig> | undefined;
  if (config.stream) {
    const path = config.stream.path;
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new RestConfigError('stream.path must be a path starting with "/".');
    }
    if (SECRET_PARAM.test(path)) {
      throw new RestConfigError('stream.path must not contain secret-looking query parameters.');
    }
    stream = {
      path,
      heartbeatTimeoutMs: clamp(config.stream.heartbeatTimeoutMs ?? 20_000, 2000, 120_000),
      maxRetries: clamp(Math.floor(config.stream.maxRetries ?? 5), 0, 20),
      resyncIntervalMs: Math.max(pollIntervalMs, config.stream.resyncIntervalMs ?? 60_000),
    };
  }

  const contractProfile = config.contractProfile;
  if (contractProfile !== undefined && !/^[a-z][a-z0-9-]{0,39}$/.test(contractProfile))
    throw new RestConfigError('contractProfile must be a short lowercase profile id.');

  return {
    stream,
    contractProfile,
    baseUrl,
    label: config.label?.trim() || 'Generic REST backend',
    endpoints,
    pollIntervalMs,
    requestTimeoutMs,
    staleAfterMs,
    statusMapping: config.statusMapping,
    credentials,
  };
}

export function endpointUrl(cfg: ResolvedRestConfig, path: string, id?: string): string {
  const p = id === undefined ? path : path.replace(':id', encodeURIComponent(id));
  return `${cfg.baseUrl}${p}`;
}
