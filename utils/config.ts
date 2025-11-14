export type FeatureFlags = {
  useVideoFallback: boolean;
  verifyModelIntegrity: boolean;
  enableAnalytics: boolean;
  showEngineLabel: boolean;
  capFps: number | null; // e.g., 30 caps RAF loop; null = unlimited
  enableAlertWebhook?: boolean;
};

export type AppConfig = {
  modelBasePaths: string[];
  flags: FeatureFlags;
  alerts?: {
    webhookUrl?: string;
    batchEnabled?: boolean;
    batchWindowMs?: number;
    maxRetries?: number;
    retryBackoffMs?: number;
    hmacKey?: string; // Optional; exposed publicly if set
  };
  demoVideoPath?: string;
};

const env = (name: string, def?: string): string | undefined =>
  process.env[name] ?? def;

const parseNumber = (v?: string): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const config: AppConfig = {
  modelBasePaths: [
    '/_next/static/chunks/pages',
    '/models',
    env('NEXT_PUBLIC_MODEL_BASE_PATH'),
  ].filter((x): x is string => Boolean(x)),
  flags: {
    useVideoFallback: env('NEXT_PUBLIC_USE_VIDEO_FALLBACK', 'true') === 'true',
    verifyModelIntegrity:
      env('NEXT_PUBLIC_VERIFY_MODEL_INTEGRITY', 'false') === 'true',
    enableAnalytics: env('NEXT_PUBLIC_ENABLE_ANALYTICS', 'false') === 'true',
    showEngineLabel: env('NEXT_PUBLIC_SHOW_ENGINE_LABEL', 'true') === 'true',
    capFps: parseNumber(env('NEXT_PUBLIC_CAP_FPS')) ?? null,
    enableAlertWebhook:
      env('NEXT_PUBLIC_ALERT_WEBHOOK_ENABLED', 'false') === 'true',
  },
  alerts: {
    webhookUrl: env('NEXT_PUBLIC_ALERT_WEBHOOK'),
    batchEnabled: env('NEXT_PUBLIC_ALERT_BATCH_ENABLED', 'false') === 'true',
    batchWindowMs: parseNumber(env('NEXT_PUBLIC_ALERT_BATCH_WINDOW_MS')) ?? 1500,
    maxRetries: parseNumber(env('NEXT_PUBLIC_ALERT_MAX_RETRIES')) ?? 3,
    retryBackoffMs: parseNumber(env('NEXT_PUBLIC_ALERT_RETRY_BACKOFF_MS')) ?? 1500,
    hmacKey: env('NEXT_PUBLIC_ALERT_HMAC_KEY'),
  },
  demoVideoPath: env('NEXT_PUBLIC_DEMO_VIDEO'),
};
