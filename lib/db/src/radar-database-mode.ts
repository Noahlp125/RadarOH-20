export type RadarDatabaseProvider = "replit" | "supabase";

export function getRadarDatabaseProvider(): RadarDatabaseProvider {
  const configured = process.env.RADAR_DATABASE_PROVIDER ?? "replit";
  if (configured !== "replit" && configured !== "supabase") {
    throw new Error(
      "RADAR_DATABASE_PROVIDER must be either replit or supabase.",
    );
  }
  return configured;
}

export function isSupabaseRadarDatabase(): boolean {
  return getRadarDatabaseProvider() === "supabase";
}