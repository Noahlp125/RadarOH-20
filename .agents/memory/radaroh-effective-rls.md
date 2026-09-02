---
name: RadarOH effective RLS
description: Why RadarOH transactions reduce database privileges before accessing workspace data.
---

RadarOH database access must execute under a dedicated `NOLOGIN`, `NOBYPASSRLS` role rather than relying only on `FORCE ROW LEVEL SECURITY`.

**Why:** The managed PostgreSQL connection owner can bypass RLS despite table-level force settings. An isolation test proved that a different workspace setting could still read the real workspace until privileges were reduced.

**How to apply:** Keep role initialization idempotent and switch to the restricted role inside every Radar transaction after setting up the workspace row. Any new Radar table must grant CRUD to that role and have workspace RLS.