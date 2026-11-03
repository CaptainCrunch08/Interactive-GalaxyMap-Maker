import type { Campaign } from "../types/campaign";
import type { GalaxySize } from "./generateGalaxy";
import {
  createCloudMap,
  deleteCloudMap,
  getCloudMap,
  listCloudMaps,
  putCloudMap,
  type CloudMapMeta,
} from "./cloudMapsApi";
import { useCampaignStore } from "../store/useCampaignStore";

const SAVE_DEBOUNCE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let syncEnabled = false;
let lastSerialized = new Map<string, string>();

function serializeCampaign(campaign: Campaign): string {
  return JSON.stringify(campaign);
}

/** Load all cloud maps into the zustand store (replaces in-memory maps). */
export async function hydrateMapsFromCloud(): Promise<{
  metas: CloudMapMeta[];
  empty: boolean;
}> {
  const metas = await listCloudMaps();
  if (metas.length === 0) {
    return { metas, empty: true };
  }

  const maps: Record<string, Campaign> = {};
  const mapOrder: string[] = [];
  for (const meta of metas) {
    const detail = await getCloudMap(meta.id);
    maps[meta.id] = detail.campaign;
    mapOrder.push(meta.id);
    lastSerialized.set(meta.id, serializeCampaign(detail.campaign));
  }

  const activeMapId = mapOrder[0]!;
  useCampaignStore.setState({
    maps,
    mapOrder,
    activeMapId,
    campaign: maps[activeMapId]!,
    isDirty: false,
  });

  return { metas, empty: false };
}

/** Upload current local maps to cloud (first-time migration). */
export async function uploadLocalMapsToCloud(): Promise<void> {
  const { maps, mapOrder, activeMapId } = useCampaignStore.getState();
  const order = mapOrder.length > 0 ? mapOrder : Object.keys(maps);
  for (const id of order) {
    const campaign = maps[id];
    if (!campaign) continue;
    await createCloudMap({ id, name: campaign.name, campaign });
    lastSerialized.set(id, serializeCampaign(campaign));
  }
  // Re-hydrate so order/metadata match server.
  await hydrateMapsFromCloud();
  // Prefer previous active map if it still exists.
  const state = useCampaignStore.getState();
  if (state.maps[activeMapId]) {
    useCampaignStore.getState().switchMap(activeMapId);
  }
}

async function flushDirtyMaps(): Promise<void> {
  if (!syncEnabled) return;
  const { maps, mapOrder, activeMapId, campaign } = useCampaignStore.getState();
  const nextMaps = {
    ...maps,
    [activeMapId]: campaign,
  };

  for (const id of mapOrder) {
    const c = nextMaps[id];
    if (!c) continue;
    const serialized = serializeCampaign(c);
    if (lastSerialized.get(id) === serialized) continue;
    await putCloudMap(id, { name: c.name, campaign: c });
    lastSerialized.set(id, serialized);
  }
}

export function scheduleCloudSave(): void {
  if (!syncEnabled) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushDirtyMaps().catch((err) => {
      console.warn("[cloudSync] save failed", err);
    });
  }, SAVE_DEBOUNCE_MS);
}

export function enableCloudSync(): () => void {
  syncEnabled = true;
  const unsub = useCampaignStore.subscribe(() => {
    scheduleCloudSave();
  });
  const onHide = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    void flushDirtyMaps().catch(() => undefined);
  };
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });

  return () => {
    syncEnabled = false;
    unsub();
    window.removeEventListener("pagehide", onHide);
    if (saveTimer) clearTimeout(saveTimer);
  };
}

/** Create map locally then mirror to cloud. */
export async function createMapOnCloud(options?: {
  kind: "empty" | "generated";
  size?: GalaxySize;
}): Promise<void> {
  useCampaignStore.getState().createMap(options);
  const { activeMapId, campaign } = useCampaignStore.getState();
  await createCloudMap({
    id: activeMapId,
    name: campaign.name,
    campaign,
  });
  lastSerialized.set(activeMapId, serializeCampaign(campaign));
}

/** Delete map on cloud then locally. */
export async function deleteMapOnCloud(mapId: string): Promise<void> {
  await deleteCloudMap(mapId);
  lastSerialized.delete(mapId);
  useCampaignStore.getState().deleteMap(mapId);
}
