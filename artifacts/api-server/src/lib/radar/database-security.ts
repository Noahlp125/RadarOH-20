import { pool } from "@workspace/db";

export async function initializeRadarDatabaseSecurity(): Promise<void> {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'radar_app') THEN
        CREATE ROLE radar_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
      ALTER ROLE radar_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END
    $$;

    GRANT USAGE ON SCHEMA public TO radar_app;

    DO $$
    DECLARE radar_table record;
    BEGIN
      FOR radar_table IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'radar_%'
      LOOP
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO radar_app',
          radar_table.schemaname,
          radar_table.tablename
        );
      END LOOP;
    END
    $$;
  `);
}