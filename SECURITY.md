# Security Policy

## Reporting a Vulnerability

Please email the maintainers to privately disclose security issues. Provide a minimal reproduction and affected versions. We will acknowledge within 72 hours.

## Hardening Measures in App
- Security headers (CSP, X-Content-Type-Options, Referrer-Policy) are set in `next.config.js`.
- No server-side secrets in client code; environment variables prefixed with `NEXT_PUBLIC_` are considered public.
- Health check at `/api/healthz` for uptime monitoring only; returns no sensitive data.
- Optional PWA caching scopes limited to models/runtime assets.

## Operational Recommendations
- Serve over HTTPS.
- Use a trusted CDN for ONNX assets if externalized.
- Host models under authentication if they contain proprietary IP.
- Periodically update dependencies and run `npm audit`.
