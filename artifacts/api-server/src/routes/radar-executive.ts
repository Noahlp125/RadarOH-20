import { Router, type IRouter } from "express";
import {
  GetRadarAlertPreferencesResponse,
  GetRadarExecutiveDashboardResponse,
  SearchRadarQueryParams,
  SearchRadarResponse,
  UpdateRadarAlertPreferencesBody,
  UpdateRadarAlertPreferencesResponse,
} from "@workspace/api-zod";
import {
  executiveFiltersSchema,
  exportExecutiveCsv,
  getAlertPreferences,
  getExecutiveDashboard,
  recordRadarActivity,
  searchRadar,
  updateAlertPreferences,
} from "../lib/radar/dashboard";

const router: IRouter = Router();

router.get("/radar/executive", async (req, res): Promise<void> => {
  const filters = executiveFiltersSchema.safeParse(req.query);
  if (!filters.success) {
    res.status(400).json({ error: filters.error.message });
    return;
  }
  const dashboard = await getExecutiveDashboard(filters.data);
  GetRadarExecutiveDashboardResponse.parse(dashboard);
  res.json(dashboard);
});

router.get("/radar/search", async (req, res): Promise<void> => {
  const query = SearchRadarQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const results = await searchRadar(query.data.q);
  SearchRadarResponse.parse(results);
  res.json(results);
});

router.get("/radar/reports/export", async (req, res): Promise<void> => {
  const filters = executiveFiltersSchema.safeParse(req.query);
  if (!filters.success) {
    res.status(400).json({ error: filters.error.message });
    return;
  }
  const csv = await exportExecutiveCsv(filters.data);
  await recordRadarActivity("exported", "executive_report", undefined, { format: "csv", filters: filters.data });
  res.setHeader("Content-Disposition", `attachment; filename="radar-oh-informe-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.type("text/csv").send(`\uFEFF${csv}`);
});

router.get("/radar/alert-preferences", async (_req, res): Promise<void> => {
  const preferences = await getAlertPreferences();
  GetRadarAlertPreferencesResponse.parse(preferences);
  res.json(preferences);
});

router.patch("/radar/alert-preferences", async (req, res): Promise<void> => {
  const body = UpdateRadarAlertPreferencesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const preferences = await updateAlertPreferences(body.data);
  UpdateRadarAlertPreferencesResponse.parse(preferences);
  res.json(preferences);
});

export default router;