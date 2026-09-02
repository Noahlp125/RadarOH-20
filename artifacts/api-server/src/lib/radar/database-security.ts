import { pool } from "@workspace/db";
import { createHash } from "node:crypto";

let radarDatabaseRole = "radar_app";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function getRadarDatabaseRole() {
  return radarDatabaseRole;
}

export async function initializeRadarDatabaseSecurity(): Promise<void> {
  const identity = await pool.query<{ current_user: string }>("select current_user");
  const currentUser = identity.rows[0]?.current_user;
  if (!currentUser) throw new Error("Unable to determine the PostgreSQL user");
  radarDatabaseRole = `radar_app_${createHash("sha256").update(currentUser).digest("hex").slice(0, 12)}`;
  const role = quoteIdentifier(radarDatabaseRole);
  const user = quoteIdentifier(currentUser);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${radarDatabaseRole}') THEN
        CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END
    $$;

    GRANT ${role} TO ${user};
    GRANT USAGE ON SCHEMA public TO ${role};

    DO $$
    DECLARE radar_table record;
    DECLARE radar_policy record;
    DECLARE tenant_column text;
    BEGIN
      FOR radar_table IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'radar_%'
      LOOP
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO ${role}',
          radar_table.schemaname,
          radar_table.tablename
        );
        EXECUTE format(
          'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
          radar_table.schemaname,
          radar_table.tablename
        );
        EXECUTE format(
          'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
          radar_table.schemaname,
          radar_table.tablename
        );
        tenant_column := CASE
          WHEN radar_table.tablename = 'radar_workspaces' THEN 'id'
          ELSE 'workspace_id'
        END;
        FOR radar_policy IN
          SELECT policyname
          FROM pg_policies
          WHERE schemaname = radar_table.schemaname
            AND tablename = radar_table.tablename
        LOOP
          EXECUTE format(
            'ALTER POLICY %I ON %I.%I TO ${role} USING (%I = current_setting(''app.workspace_id'', true)) WITH CHECK (%I = current_setting(''app.workspace_id'', true))',
            radar_policy.policyname,
            radar_table.schemaname,
            radar_table.tablename,
            tenant_column,
            tenant_column
          );
        END LOOP;
      END LOOP;
    END
    $$;
  `);
}