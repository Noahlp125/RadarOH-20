import { build } from "esbuild";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";

if (process.env.RADAR_STAGING_AI_CONFIRM !== "YES") {
  throw new Error("RADAR_STAGING_AI_CONFIRM=YES is required.");
}
if (process.env.RADAR_DATABASE_PROVIDER !== "supabase") {
  throw new Error("RADAR_DATABASE_PROVIDER=supabase is required.");
}
if (!process.env.RADAR_WORKSPACE_UUID) {
  throw new Error("RADAR_WORKSPACE_UUID is required.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("A staging DATABASE_URL is required.");
}

const output = join(process.cwd(), "test", `.radar-staging-ai-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `
      import { pool } from "@workspace/db";
      import { runRadarAiAnalysis } from "./src/lib/radar/ai";
      import { initializeRadarDatabaseSecurity } from "./src/lib/radar/database-security";

      const runs = Math.min(3, Math.max(1, Number(process.env.RADAR_STAGING_AI_RUNS ?? "1")));
      const summaries = [];
      try {
        await initializeRadarDatabaseSecurity();
        for (let run = 1; run <= runs; run += 1) {
          const result = await runRadarAiAnalysis({ trigger: "manual", limit: 5 });
          summaries.push({
            run,
            status: result.status,
            attempt_count: result.attempt_count,
            attempt_error_count: result.attempt_errors.length,
            finding_count: result.findings.length,
            evidence_count: result.source_evidence_count,
          });
        }
        console.log(JSON.stringify({ staging_ai_runs: summaries }));
      } finally {
        await pool.end();
      }
    `,
    resolveDir: process.cwd(),
    sourcefile: "staging-ai-entry.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: output,
  sourcemap: "inline",
  banner: {
    js: `import { createRequire as __createRequire } from "node:module";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { dirname as __pathDirname } from "node:path";
globalThis.require = __createRequire(import.meta.url);
globalThis.__filename = __fileURLToPath(import.meta.url);
globalThis.__dirname = __pathDirname(globalThis.__filename);`,
  },
});

const result = spawnSync(process.execPath, [output], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    LOG_LEVEL: "silent",
  },
});
await rm(output, { force: true });
process.exit(result.status ?? 1);