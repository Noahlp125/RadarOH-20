import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";

function authorizedUserIds(): Set<string> {
  return new Set(
    (process.env.RADAR_AUTHORIZED_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function requireRadarAccess(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const allowed = authorizedUserIds();
  if (process.env.NODE_ENV === "production" && allowed.size === 0) {
    res.status(503).json({ error: "La autorización de producción no está configurada" });
    return;
  }
  if (allowed.size > 0 && !allowed.has(userId)) {
    res.status(403).json({ error: "Sin permisos para acceder a RadarOH" });
    return;
  }

  res.locals.radarUserId = userId;
  next();
}