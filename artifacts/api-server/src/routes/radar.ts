import { Router, type IRouter, type Response } from "express";
import {
  CreateRadarCompetitorBody,
  CreateRadarKeywordBody,
  CreateRadarSourceBody,
  DeleteRadarCompetitorParams,
  DeleteRadarKeywordParams,
  DeleteRadarSourceParams,
  GetRadarStateResponse,
  ImportRadarDataBody,
  ImportRadarDataResponse,
  ReplaceRadarStateBody,
  ReplaceRadarStateResponse,
  UpdateRadarCompetitorBody,
  UpdateRadarCompetitorParams,
  UpdateRadarCompetitorResponse,
  UpdateRadarKeywordBody,
  UpdateRadarKeywordParams,
  UpdateRadarKeywordResponse,
  UpdateRadarSourceBody,
  UpdateRadarSourceParams,
  UpdateRadarSourceResponse,
  CreateRadarSourceResponse,
  CreateRadarCompetitorResponse,
  CreateRadarKeywordResponse,
  GetRadarMonitorHistoryQueryParams,
  GetRadarMonitorHistoryResponse,
  GetRadarMonitorStatusResponse,
  RunRadarMonitorBody,
  RunRadarMonitorResponse,
} from "@workspace/api-zod";
import {
  createRadarCompetitor,
  createRadarKeyword,
  createRadarSource,
  deleteRadarCompetitor,
  deleteRadarKeyword,
  deleteRadarSource,
  importRadarPayload,
  RadarHistoryConflictError,
  readRadarState,
  replaceRadarState,
  updateRadarCompetitor,
  updateRadarKeyword,
  updateRadarSource,
} from "../lib/radar/repository";
import {
  getRadarMonitorHistory,
  getRadarMonitorStatus,
  MonitorSourceNotFoundError,
  runRadarMonitor,
} from "../lib/radar/monitoring";

const router: IRouter = Router();

function validationError(res: Response, error: unknown) {
  res.status(400).json({ error: error instanceof Error ? error.message : "Datos no válidos." });
}

router.get("/radar/state", async (_req, res): Promise<void> => {
  const state = await readRadarState();
  GetRadarStateResponse.parse(state);
  res.json(state);
});

router.put("/radar/state", async (req, res): Promise<void> => {
  const check = ReplaceRadarStateBody.safeParse(req.body);
  if (!check.success) {
    res.status(400).json({ error: check.error.message });
    return;
  }
  try {
    const state = await replaceRadarState(req.body);
    ReplaceRadarStateResponse.parse(state);
    res.json(state);
  } catch (error) {
    validationError(res, error);
  }
});

router.post("/radar/import", async (req, res): Promise<void> => {
  const check = ImportRadarDataBody.safeParse(req.body);
  if (!check.success) {
    res.status(400).json({ error: check.error.message });
    return;
  }
  try {
    const result = await importRadarPayload(
      req.body.payload,
      typeof req.body.sourceFilename === "string" ? req.body.sourceFilename : undefined,
    );
    ImportRadarDataResponse.parse(result);
    res.status(201).json(result);
  } catch (error) {
    validationError(res, error);
  }
});

router.post("/radar/sources", async (req, res): Promise<void> => {
  const check = CreateRadarSourceBody.safeParse(req.body);
  if (!check.success) {
    res.status(400).json({ error: check.error.message });
    return;
  }
  try {
    const source = await createRadarSource(req.body);
    CreateRadarSourceResponse.parse(source);
    res.status(201).json(source);
  } catch (error) {
    validationError(res, error);
  }
});

router.patch("/radar/sources/:id", async (req, res): Promise<void> => {
  const params = UpdateRadarSourceParams.safeParse(req.params);
  const body = UpdateRadarSourceBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const source = await updateRadarSource(params.data.id, req.body);
    if (!source) {
      res.status(404).json({ error: "Fuente no encontrada." });
      return;
    }
    UpdateRadarSourceResponse.parse(source);
    res.json(source);
  } catch (error) {
    validationError(res, error);
  }
});

router.delete("/radar/sources/:id", async (req, res): Promise<void> => {
  const params = DeleteRadarSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    if (!(await deleteRadarSource(params.data.id))) {
      res.status(404).json({ error: "Fuente no encontrada." });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof RadarHistoryConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.post("/radar/competitors", async (req, res): Promise<void> => {
  const check = CreateRadarCompetitorBody.safeParse(req.body);
  if (!check.success) {
    res.status(400).json({ error: check.error.message });
    return;
  }
  try {
    const competitor = await createRadarCompetitor(req.body);
    CreateRadarCompetitorResponse.parse(competitor);
    res.status(201).json(competitor);
  } catch (error) {
    validationError(res, error);
  }
});

router.patch("/radar/competitors/:id", async (req, res): Promise<void> => {
  const params = UpdateRadarCompetitorParams.safeParse(req.params);
  const body = UpdateRadarCompetitorBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const competitor = await updateRadarCompetitor(params.data.id, req.body);
    if (!competitor) {
      res.status(404).json({ error: "Competidor no encontrado." });
      return;
    }
    UpdateRadarCompetitorResponse.parse(competitor);
    res.json(competitor);
  } catch (error) {
    validationError(res, error);
  }
});

router.delete("/radar/competitors/:id", async (req, res): Promise<void> => {
  const params = DeleteRadarCompetitorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    if (!(await deleteRadarCompetitor(params.data.id))) {
      res.status(404).json({ error: "Competidor no encontrado." });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof RadarHistoryConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.post("/radar/keywords", async (req, res): Promise<void> => {
  const check = CreateRadarKeywordBody.safeParse(req.body);
  if (!check.success) {
    res.status(400).json({ error: check.error.message });
    return;
  }
  try {
    const keyword = await createRadarKeyword(req.body);
    CreateRadarKeywordResponse.parse(keyword);
    res.status(201).json(keyword);
  } catch (error) {
    validationError(res, error);
  }
});

router.patch("/radar/keywords/:id", async (req, res): Promise<void> => {
  const params = UpdateRadarKeywordParams.safeParse(req.params);
  const body = UpdateRadarKeywordBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const keyword = await updateRadarKeyword(params.data.id, req.body);
    if (!keyword) {
      res.status(404).json({ error: "Keyword no encontrada." });
      return;
    }
    UpdateRadarKeywordResponse.parse(keyword);
    res.json(keyword);
  } catch (error) {
    validationError(res, error);
  }
});

router.delete("/radar/keywords/:id", async (req, res): Promise<void> => {
  const params = DeleteRadarKeywordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await deleteRadarKeyword(params.data.id))) {
    res.status(404).json({ error: "Keyword no encontrada." });
    return;
  }
  res.sendStatus(204);
});

router.get("/radar/monitor/status", async (_req, res): Promise<void> => {
  const status = await getRadarMonitorStatus();
  GetRadarMonitorStatusResponse.parse(status);
  res.json(status);
});

router.post("/radar/monitor/run", async (req, res): Promise<void> => {
  const body = RunRadarMonitorBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const result = await runRadarMonitor(body.data.source_id);
    RunRadarMonitorResponse.parse(result);
    res.json(result);
  } catch (error) {
    if (error instanceof MonitorSourceNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    validationError(res, error);
  }
});

router.get("/radar/monitor/history", async (req, res): Promise<void> => {
  const query = GetRadarMonitorHistoryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const history = await getRadarMonitorHistory(
    query.data.competitor_id,
    query.data.limit,
  );
  GetRadarMonitorHistoryResponse.parse(history);
  res.json(history);
});

export default router;