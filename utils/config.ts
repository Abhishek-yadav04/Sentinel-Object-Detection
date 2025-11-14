export type FeatureFlags = {
  useVideoFallback: boolean;
  verifyModelIntegrity: boolean;
  enableAnalytics: boolean;
  showEngineLabel: boolean;
  capFps: number | null; // e.g., 30 caps RAF loop; null = unlimited
};

export type AppConfig = {
  modelBasePaths: string[];
  flags: FeatureFlags;
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
  },
};
