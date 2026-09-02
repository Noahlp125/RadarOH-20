import { Router, type IRouter, type Response } from "express";
import {
  CreateRadarWebhookSubscriptionBody, CreateRadarWebhookSubscriptionResponse, CreateRadarWebhookSubscriptionParams,
  GetRadarIntegrationsOverviewResponse, ListRadarIntegrationDeliveriesResponse,
  RegisterRadarIntegrationBody, RegisterRadarIntegrationResponse, RetryRadarIntegrationDeliveryParams,
  RetryRadarIntegrationDeliveryResponse, UpdateRadarIntegrationBody, UpdateRadarIntegrationParams,
  UpdateRadarIntegrationResponse,
} from "@workspace/api-zod";
import {
  createWebhook, getIntegrationsOverview, listIntegrationDeliveries, registerIntegration,
  retryIntegrationDelivery, updateIntegration,
} from "../lib/radar/integrations";

const router: IRouter = Router();
const invalid = (res: Response, message: string) => res.status(400).json({ error: message });

router.get("/radar/integrations/overview", async (_req, res): Promise<void> => {
  const output = await getIntegrationsOverview(); GetRadarIntegrationsOverviewResponse.parse(output); res.json(output);
});
router.post("/radar/integrations", async (req, res): Promise<void> => {
  const body = RegisterRadarIntegrationBody.safeParse(req.body); if (!body.success) { invalid(res, body.error.message); return; }
  try { const output = await registerIntegration(body.data); RegisterRadarIntegrationResponse.parse(output); res.status(201).json(output); } catch (error) { invalid(res, error instanceof Error ? error.message : "Invalid request"); }
});
router.patch("/radar/integrations/:id", async (req, res): Promise<void> => {
  const params = UpdateRadarIntegrationParams.safeParse(req.params); const body = UpdateRadarIntegrationBody.safeParse(req.body);
  if (!params.success) { invalid(res, params.error.message); return; }
  if (!body.success) { invalid(res, body.error.message); return; }
  try { const output = await updateIntegration(params.data.id, body.data); if (!output) { res.status(404).json({ error: "Integration not found" }); return; } UpdateRadarIntegrationResponse.parse(output); res.json(output); } catch (error) { invalid(res, error instanceof Error ? error.message : "Invalid request"); }
});
router.post("/radar/integrations/:id/webhooks", async (req, res): Promise<void> => {
  const params = CreateRadarWebhookSubscriptionParams.safeParse(req.params); const body = CreateRadarWebhookSubscriptionBody.safeParse(req.body);
  if (!params.success) { invalid(res, params.error.message); return; }
  if (!body.success) { invalid(res, body.error.message); return; }
  try { const output = await createWebhook(params.data.id, body.data); if (!output) { res.status(404).json({ error: "Integration not found" }); return; } CreateRadarWebhookSubscriptionResponse.parse(output); res.status(201).json(output); } catch (error) { invalid(res, error instanceof Error ? error.message : "Invalid request"); }
});
router.get("/radar/integrations/deliveries", async (_req, res): Promise<void> => {
  const output = await listIntegrationDeliveries(); ListRadarIntegrationDeliveriesResponse.parse(output); res.json(output);
});
router.post("/radar/integrations/deliveries/:id/retry", async (req, res): Promise<void> => {
  const params = RetryRadarIntegrationDeliveryParams.safeParse(req.params); if (!params.success) { invalid(res, params.error.message); return; }
  const result = await retryIntegrationDelivery(params.data.id);
  if (result.kind === "missing") { res.status(404).json({ error: "Delivery not found" }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: result.message }); return; }
  RetryRadarIntegrationDeliveryResponse.parse(result.delivery); res.json(result.delivery);
});

export default router;