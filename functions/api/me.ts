import type { Env } from "../types";
import { requireUserEmail } from "../_shared/auth";
import { handleError, json } from "../_shared/http";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const email = await requireUserEmail(context.request, context.env);
    return json({ email });
  } catch (err) {
    return handleError(err);
  }
};
