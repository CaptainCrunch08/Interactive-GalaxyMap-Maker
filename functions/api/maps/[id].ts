import type { Env } from "../../types";
import { requireUserEmail } from "../../_shared/auth";
import { handleError, json, noContent, readJson } from "../../_shared/http";
import {
  deleteMapBlob,
  deleteMapRow,
  getMapBlob,
  getMapRow,
  putMapBlob,
  r2KeyFor,
  upsertMapMeta,
} from "../../_shared/mapsDb";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const email = await requireUserEmail(context.request, context.env);
    const mapId = context.params.id;
    if (typeof mapId !== "string" || !mapId) {
      return json({ error: "Missing map id" }, 400);
    }
    const row = await getMapRow(context.env, email, mapId);
    if (!row) return json({ error: "Not found" }, 404);
    const blob = await getMapBlob(context.env, row.r2_key);
    if (!blob) return json({ error: "Map data missing" }, 404);
    let campaign: unknown;
    try {
      campaign = JSON.parse(blob);
    } catch {
      return json({ error: "Corrupt map data" }, 500);
    }
    return json({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      campaign,
    });
  } catch (err) {
    return handleError(err);
  }
};

type PutBody = {
  name?: string;
  campaign?: unknown;
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const email = await requireUserEmail(context.request, context.env);
    const mapId = context.params.id;
    if (typeof mapId !== "string" || !mapId) {
      return json({ error: "Missing map id" }, 400);
    }
    const body = await readJson<PutBody>(context.request);
    if (body.campaign === undefined) {
      return json({ error: "campaign is required" }, 400);
    }

    const existing = await getMapRow(context.env, email, mapId);
    const now = new Date().toISOString();
    const nameFromCampaign =
      body.campaign &&
      typeof body.campaign === "object" &&
      body.campaign !== null &&
      "name" in body.campaign &&
      typeof (body.campaign as { name: unknown }).name === "string"
        ? (body.campaign as { name: string }).name
        : undefined;
    const name =
      (typeof body.name === "string" && body.name.trim()) ||
      nameFromCampaign ||
      existing?.name ||
      "Untitled Galaxy";
    const r2Key = existing?.r2_key ?? r2KeyFor(email, mapId);
    const createdAt = existing?.created_at ?? now;

    await putMapBlob(context.env, r2Key, JSON.stringify(body.campaign));
    await upsertMapMeta(context.env, {
      id: mapId,
      ownerEmail: email,
      name,
      r2Key,
      updatedAt: now,
      createdAt,
    });

    return json({ id: mapId, name, updatedAt: now, createdAt });
  } catch (err) {
    return handleError(err);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const email = await requireUserEmail(context.request, context.env);
    const mapId = context.params.id;
    if (typeof mapId !== "string" || !mapId) {
      return json({ error: "Missing map id" }, 400);
    }
    const row = await getMapRow(context.env, email, mapId);
    if (!row) return json({ error: "Not found" }, 404);
    await deleteMapRow(context.env, email, mapId);
    await deleteMapBlob(context.env, row.r2_key);
    return noContent();
  } catch (err) {
    return handleError(err);
  }
};
