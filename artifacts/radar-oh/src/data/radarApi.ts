import {
  getRadarState,
  importRadarData,
  replaceRadarState,
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