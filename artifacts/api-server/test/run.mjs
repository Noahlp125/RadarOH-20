import { build } from "esbuild";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const output = join(tmpdir(), `radar-ai-validation-${process.pid}.test.mjs`);
await build({
  entryPoints: ["test/all.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: output,
  sourcemap: "inline",
});

const result = spawnSync(process.execPath, ["--test", output], {
  stdio: "inherit",
  env: { ...process.env, RADAR_WORKSPACE_ID: process.env.RADAR_WORKSPACE_ID ?? "test-workspace" },
});
process.exit(result.status ?? 1);