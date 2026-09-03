import { build } from "esbuild";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";

const output = join(process.cwd(), "test", `.radar-supabase-rehearsal-${process.pid}.mjs`);
await build({
  entryPoints: ["test/supabase-rehearsal.test.ts"],
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

const result = spawnSync(process.execPath, ["--test", output], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    LOG_LEVEL: "silent",
    RADAR_WORKSPACE_ID:
      process.env.RADAR_WORKSPACE_ID ?? "oh-casas",
    RADAR_WORKSPACE_UUID:
      process.env.RADAR_WORKSPACE_UUID ??
      process.env.RADAR_REHEARSAL_WORKSPACE_UUID ??
      "",
  },
});
await rm(output, { force: true });
process.exit(result.status ?? 1);