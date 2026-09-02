import { readFile } from "node:fs/promises";
import path from "node:path";

const sourceFile =
  process.env.RADAR_IMPORT_FILE ??
  ".conversation/attached_assets/radar-oh-datos-2026-09-01_1788292666240.json";
const apiUrl =
  process.env.RADAR_API_URL ?? "http://localhost:80/api/radar/import";

const payload = JSON.parse(await readFile(path.resolve(sourceFile), "utf8"));
const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sourceFilename: path.basename(sourceFile),
    payload,
  }),
});

const result: unknown = await response.json();
const resultRecord =
  result && typeof result === "object" && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : {};
if (!response.ok) {
  throw new Error(
    `RadarOH import failed (${response.status}): ${typeof resultRecord.error === "string" ? resultRecord.error : "unknown error"}`,
  );
}

if (typeof resultRecord.importId !== "string") {
  throw new Error("RadarOH import failed: response did not include importId.");
}

console.info(
  JSON.stringify(
    {
      importId: resultRecord.importId,
      validation: resultRecord.validation,
      sourceFile,
    },
    null,
    2,
  ),
);