---
name: Drizzle RLS policy reconciliation
description: Environment quirk affecting existing PostgreSQL policy expressions.
---

Drizzle schema push may create or retain policy objects without reconciling their USING and WITH CHECK expressions.

**Why:** Typed policy definitions alone did not repair already-created policies in this workspace, leaving reduced-role inserts blocked and new tables without forced RLS.

**How to apply:** Keep the Radar database-security initializer responsible for normalizing policy expressions, grants, policy grantees, and FORCE ROW LEVEL SECURITY after schema changes. Policies must target the environment-derived reduced role, not a fixed role name; verify with integration tests that perform reduced-role writes.