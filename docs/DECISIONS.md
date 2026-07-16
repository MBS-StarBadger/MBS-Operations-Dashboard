# Architecture Decision Log

## ADR-001 — Preserve the Existing API During Migration

**Date:** 2026-07-16  
**Status:** Accepted

### Decision

The existing REST API and PostgreSQL database will remain operational while the MBS Operations Dashboard desktop application is developed.

### Reason

This allows the existing web client to continue working and provides a low-risk migration path.

### Consequences

- Existing API endpoints must remain backward compatible.
- Backend refactoring must not change current behavior without testing.
- The desktop and future mobile clients will use the same API.
- Production will not be used for development or testing.
