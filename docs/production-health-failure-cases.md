# Production health signals

- Healthy Mongo must return 200, no-store, deployment identity and a passing ping (API E2E, unit).
- Missing deployment metadata must be null, not omitted (unit).
- Rejected or stalled database connections/pings must return a bounded 503 without error details (unit; stopped-Mongo smoke).
- Smoke must reject missing health, wrong commit, non-2xx pages and Next error HTML; retry transient cold starts and retain failures in its exit code (Node tests).
- Production smoke must target the successful Production deployment's immutable URL and SHA, not a mutable alias (workflow review).
- Public pages must remain unchanged: no client code, page queries or assets are added (diff review).
