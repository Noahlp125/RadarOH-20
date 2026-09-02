import { Router, type IRouter } from "express";
import {
  GetRadarAiStatusResponse,
  ListRadarAiAlertsResponse,
  ListRadarAiAnalysesResponse,
  RunRadarAiAnalysisBody,
  RunRadarAiAnalysisResponse,
  UpdateRadarAiAlertBody,
  UpdateRadarAiAlertResponse,
} from "@workspace/api-zod";
import {
  AiAnalysisNotFoundError,
  getRadarAiStatus,
  listRadarAiAlerts,
  listRadarAiAnalyses,
  NoEvidenceForAnalysisError,
  runRadarAiAnalysis,
  updateRadarAiAlert,
} from "../lib/radar/ai";

const router: IRouter = Router();

router.get("/radar/ai/status", async (_req, res): Promise<void> => {
  const status = await getRadarAiStatus();
  GetRadarAiStatusResponse.parse(status);
  res.json(status);
});

router.post("/radar/ai/analyze", async (req, res): Promise<void> => {
  const body = RunRadarAiAnalysisBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const analysis = await runRadarAiAnalysis({
      trigger: "manual",
      limit: body.data.limit,
      sourceLegacyId: body.data.source_id,
    });
    RunRadarAiAnalysisResponse.parse(analysis);
    res.json(analysis);
  } catch (error) {
    if (error instanceof NoEvidenceForAnalysisError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.get("/radar/ai/analyses", async (_req, res): Promise<void> => {
  const analyses = await listRadarAiAnalyses();
  ListRadarAiAnalysesResponse.parse(analyses);
  res.json(analyses);
});

router.get("/radar/ai/alerts", async (_req, res): Promise<void> => {
  const alerts = await listRadarAiAlerts();
  ListRadarAiAlertsResponse.parse(alerts);
  res.json(alerts);
});

router.patch("/radar/ai/alerts/:id", async (req, res): Promise<void> => {
  const body = UpdateRadarAiAlertBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const alert = await updateRadarAiAlert(req.params.id, body.data.status);
    UpdateRadarAiAlertResponse.parse(alert);
    res.json(alert);
  } catch (error) {
    if (error instanceof AiAnalysisNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
});

export default router;