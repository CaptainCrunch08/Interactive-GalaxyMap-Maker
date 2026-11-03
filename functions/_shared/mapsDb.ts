import type { Env, MapMeta } from "../types";

type MapRow = {
  id: string;
  owner_email: string;
  name: string;
  r2_key: string;
  updated_at: string;
  created_at: string;
};

export function r2KeyFor(ownerEmail: string, mapId: string): string {
  return `maps/${encodeURIComponent(ownerEmail)}/${mapId}.json`;
}

function rowToMeta(row: MapRow): MapMeta {
  return {
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export async function listMaps(
  env: Env,
  ownerEmail: string,
): Promise<MapMeta[]> {
  const res = await env.DB.prepare(
    `SELECT id, owner_email, name, r2_key, updated_at, created_at
     FROM maps WHERE owner_email = ? ORDER BY updated_at DESC`,
  )
    .bind(ownerEmail)
    .all<MapRow>();
  return (res.results ?? []).map(rowToMeta);
}

export async function getMapRow(
  env: Env,
  ownerEmail: string,
  mapId: string,
): Promise<MapRow | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, owner_email, name, r2_key, updated_at, created_at
       FROM maps WHERE id = ? AND owner_email = ?`,
    )
      .bind(mapId, ownerEmail)
      .first<MapRow>()) ?? null
  );
}

export async function upsertMapMeta(
  env: Env,
  args: {
    id: string;
    ownerEmail: string;
    name: string;
    r2Key: string;
    updatedAt: string;
    createdAt: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO maps (id, owner_email, name, r2_key, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       r2_key = excluded.r2_key,
       updated_at = excluded.updated_at
     WHERE maps.owner_email = excluded.owner_email`,
  )
    .bind(
      args.id,
      args.ownerEmail,
      args.name,
      args.r2Key,
      args.updatedAt,
      args.createdAt,
    )
    .run();
}

export async function deleteMapRow(
  env: Env,
  ownerEmail: string,
  mapId: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `DELETE FROM maps WHERE id = ? AND owner_email = ?`,
  )
    .bind(mapId, ownerEmail)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function putMapBlob(
  env: Env,
  key: string,
  body: string,
): Promise<void> {
  await env.MAPS.put(key, body, {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function getMapBlob(
  env: Env,
  key: string,
): Promise<string | null> {
  const obj = await env.MAPS.get(key);
  if (!obj) return null;
  return obj.text();
}

export async function deleteMapBlob(env: Env, key: string): Promise<void> {
  await env.MAPS.delete(key);
}
