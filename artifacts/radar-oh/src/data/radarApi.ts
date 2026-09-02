import {
  getRadarState,
  getRadarMonitorHistory,
  getRadarMonitorStatus,
  importRadarData,
  deleteRadarCompetitor,
  deleteRadarSource,
  replaceRadarState,
  runRadarMonitor,
  type RadarState,
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