import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { initializeRadarDatabaseSecurity } from "../lib/radar/database-security";

afterAll(async () => {
  await pool.end();
});

describe("RadarOH database isolation", () => {
  it("forces RLS on every RadarOH table", async () => {
    const result = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relkind = 'r' and relname like 'radar_%'
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(10);
    expect(result.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it("does not expose another workspace through RLS", async () => {
    await initializeRadarDatabaseSecurity();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.workspace_id', $1, true)", [
        "00000000-0000-4000-8000-000000000000",
      ]);
      await client.query("set local role radar_app");
      const result = await client.query("select count(*)::int as count from radar_sources");
      expect(result.rows[0].count).toBe(0);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });
});