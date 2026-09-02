import {
  getRadarState,
  getRadarMonitorHistory,
  getRadarMonitorStatus,
  importRadarData,
  deleteRadarCompetitor,
  deleteRadarSource,
  replaceRadarState,
  runRadarMonitor,
  getRadarAiStatus,
  runRadarAiAnalysis,
  listRadarAiAnalyses,
  listRadarAiAlerts,
  updateRadarAiAlert,
  getRadarExecutiveDashboard,
  searchRadar,
  exportRadarExecutiveReport,
  getRadarAlertPreferences,
  updateRadarAlertPreferences,
  getRadarIntegrationsOverview,
  registerRadarIntegration,
  updateRadarIntegration,
  createRadarWebhookSubscription,
  listRadarIntegrationDeliveries,
  retryRadarIntegrationDelivery,
  type RadarState,
  type RadarAiStatus,
  type RadarAiAnalysisRequest,
  type RadarAiAnalysisResponse,
  type RadarAiAnalysis,
  type RadarAiAlert,
  type RadarAiAlertUpdate,
  type GetRadarExecutiveDashboardParams,
  type RadarSearchResponse,
  type ExportRadarExecutiveReportParams,
  type RadarAlertPreferences,
  type RadarAlertPreferencesUpdate,
  type GetRadarIntelligenceParams,
  type RadarIntelligence,
  type RadarIntegrationsOverview,
  type RadarIntegrationRegistration,
  type RadarIntegrationUpdate,
  type RadarWebhookRegistration,
  type RadarIntegrationDelivery,
  type RadarIntegration,
  type RadarWebhookSubscription
} from "@workspace/api-client-react";

export type RadarLocalState = Omit<RadarState, "workspaceId">;

export async function fetchRadarState(): Promise<RadarState> {
  return getRadarState();
}

export async function saveRadarState(state: RadarLocalState): Promise<RadarState> {
  return replaceRadarState(state);
}

export async function importRadarSnapshot(
  payload: Record<string, unknown>,
  sourceFilename?: string,
) {
  return importRadarData({ payload, sourceFilename });
}

export async function fetchRadarMonitorStatus() {
  return getRadarMonitorStatus();
}

export async function fetchRadarMonitorHistory(competitorId?: string) {
  return getRadarMonitorHistory({
    competitor_id: competitorId,
    limit: 100,
  });
}

export async function triggerRadarMonitor(sourceId?: string) {
  return runRadarMonitor(sourceId ? { source_id: sourceId } : undefined);
}

export async function removeRadarSource(sourceId: string) {
  return deleteRadarSource(sourceId);
}

export async function removeRadarCompetitor(competitorId: string) {
  return deleteRadarCompetitor(competitorId);
}

export async function fetchRadarAiStatus(): Promise<RadarAiStatus> {
  return getRadarAiStatus();
}

export async function triggerRadarAiAnalysis(data?: RadarAiAnalysisRequest): Promise<RadarAiAnalysisResponse> {
  return runRadarAiAnalysis(data);
}

export async function fetchRadarAiAnalyses(): Promise<RadarAiAnalysis[]> {
  return listRadarAiAnalyses();
}

export async function fetchRadarAiAlerts(): Promise<RadarAiAlert[]> {
  return listRadarAiAlerts();
}

export async function markRadarAiAlert(id: string, data: RadarAiAlertUpdate): Promise<RadarAiAlert> {
  return updateRadarAiAlert(id, data);
}

export async function fetchRadarExecutiveDashboard(params?: GetRadarExecutiveDashboardParams) {
  return getRadarExecutiveDashboard(params);
}

export async function fetchRadarSearch(q: string): Promise<RadarSearchResponse> {
  return searchRadar({ q });
}

export async function downloadRadarExecutiveReport(params?: ExportRadarExecutiveReportParams) {
  const query = new URLSearchParams();
  if (params?.competitor_id) query.set('competitor_id', params.competitor_id);
  if (params?.source_id) query.set('source_id', params.source_id);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.priority) query.set('priority', params.priority);
  if (params?.event_type) query.set('event_type', params.event_type);
  if (params?.q) query.set('q', params.q);

  const url = `/api/radar/reports/export?${query.toString()}`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `radar-informe-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
}

export async function fetchRadarAlertPreferences(): Promise<RadarAlertPreferences> {
  return getRadarAlertPreferences();
}

export async function saveRadarAlertPreferences(data: RadarAlertPreferencesUpdate): Promise<RadarAlertPreferences> {
  return updateRadarAlertPreferences(data);
}

export async function fetchRadarIntelligence(params?: GetRadarIntelligenceParams): Promise<RadarIntelligence> {
  const { getRadarIntelligence } = await import("@workspace/api-client-react");
  return getRadarIntelligence(params);
}

export async function fetchRadarIntegrationsOverview(): Promise<RadarIntegrationsOverview> {
  return getRadarIntegrationsOverview();
}

export async function addRadarIntegration(data: RadarIntegrationRegistration): Promise<RadarIntegration> {
  return registerRadarIntegration(data);
}

export async function modifyRadarIntegration(id: string, data: RadarIntegrationUpdate): Promise<RadarIntegration> {
  return updateRadarIntegration(id, data);
}

export async function addRadarWebhookSubscription(integrationId: string, data: RadarWebhookRegistration): Promise<RadarWebhookSubscription> {
  return createRadarWebhookSubscription(integrationId, data);
}

export async function fetchRadarIntegrationDeliveries(): Promise<RadarIntegrationDelivery[]> {
  return listRadarIntegrationDeliveries();
}

export async function retryDelivery(id: string): Promise<RadarIntegrationDelivery> {
  return retryRadarIntegrationDelivery(id);
}
