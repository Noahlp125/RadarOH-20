---
name: Drizzle RLS policy reconciliation
description: Environment quirk affecting existing PostgreSQL policy expressions.
---

Drizzle schema push may create or retain policy objects without reconciling their USING and WITH CHECK expressions.

**Why:** Typed policy definitions alone did not repair already-created policies in this workspace, leaving reduced-role inserts blocked and new tables without forced RLS.

**How to apply:** Keep policy grantees environment-neutral (`PUBLIC`) in both Drizzle and the initializer; table privileges still restrict access to the per-environment reduced role. Normalize expressions/FORCE RLS and verify reduced-role writes.