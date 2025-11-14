import "../styles/globals.css";
import type { AppProps } from "next/app";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { logger } from "../utils/logger";

if (process.env.NEXT_PUBLIC_LOG_LEVEL === undefined && typeof window !== 'undefined') {
  // silence verbose logs in production when not set
  (process.env as any).NEXT_PUBLIC_LOG_LEVEL = 'info';
}

export default function App({ Component, pageProps }: AppProps) {
  logger.info('App mounted');
  return (
    <ErrorBoundary>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <Component {...pageProps} />
    </ErrorBoundary>
  );
}
