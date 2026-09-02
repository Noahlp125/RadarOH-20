---
name: RadarOH effective RLS
description: Why RadarOH transactions reduce database privileges before accessing workspace data.
---

RadarOH database access must execute under a dedicated `NOLOGIN`, `NOBYPASSRLS` role rather than relying only on `FORCE ROW LEVEL SECURITY`. Derive a stable restricted role per PostgreSQL connection owner instead of sharing one global role across environments.

**Why:** The managed PostgreSQL connection owner can bypass RLS despite table-level force settings. A global restricted role can also be owned by a different development or production database user, making `SET ROLE` fail even though its grants are otherwise correct.

**How to apply:** Keep per-owner role initialization idempotent, grant that role to the current connection owner, and switch inside every Radar transaction after setting up the workspace row. New Radar tables require workspace RLS and CRUD grants.