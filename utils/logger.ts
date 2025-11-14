type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const levelFromEnv = (process.env.NEXT_PUBLIC_LOG_LEVEL || 'info') as Level;

const shouldLog = (level: Level) => {
  const order: Level[] = ['debug', 'info', 'warn', 'error', 'silent'];
  return order.indexOf(level) >= order.indexOf(levelFromEnv);
};

export const logger = {
  debug: (...args: unknown[]) => shouldLog('debug') && console.debug(...args),
  info: (...args: unknown[]) => shouldLog('info') && console.info(...args),
  warn: (...args: unknown[]) => shouldLog('warn') && console.warn(...args),
  error: (...args: unknown[]) => shouldLog('error') && console.error(...args),
};
