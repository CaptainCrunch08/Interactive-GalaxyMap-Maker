import type { Env } from "../../types";
import { requireUserEmail } from "../../_shared/auth";
import { handleError, json, readJson } from "../../_shared/http";
import {
  getMapBlob,
  listMaps,
  putMapBlob,
  r2KeyFor,
  upsertMapMeta,
} from "../../_shared/mapsDb";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const email = await requireUserEmail(context.request, context.env);
    const maps = await listMaps(context.env, email);
    return json({ maps });
  } catch (err) {
    return handleError(err);
  }
};

type CreateBody = {
  id?: string;
  name?: string;
  campaign?: unknown;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const email = await requireUserEmail(context.request, context.env);
    const body = await readJson<CreateBody>(context.request);
    const id = body.id?.trim() || crypto.randomUUID();
    const name =
      (typeof body.name === "string" && body.name.trim()) ||
      (body.campaign &&
      typeof body.campaign === "object" &&
      body.campaign !== null &&
      "name" in body.campaign &&
      typeof (body.campaign as { name: unknown }).name === "string"
        ? (body.campaign as { name: string }).name
        : "Untitled Galaxy");
    const now = new Date().toISOString();
    const r2Key = r2KeyFor(email, id);
    const campaignJson = JSON.stringify(body.campaign ?? { version: 1, name });

    await putMapBlob(context.env, r2Key, campaignJson);
    await upsertMapMeta(context.env, {
      id,
      ownerEmail: email,
      name,
      r2Key,
      updatedAt: now,
      createdAt: now,
    });

    // Confirm blob readable (helps catch R2 misconfig early).
    const check = await getMapBlob(context.env, r2Key);
    if (!check) {
      return json({ error: "Failed to store map blob" }, 500);
    }

    return json(
      { id, name, updatedAt: now, createdAt: now },
      201,
    );
  } catch (err) {
    return handleError(err);
  }
};
