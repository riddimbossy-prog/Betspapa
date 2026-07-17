import { getSupabaseAdmin } from "../supabase.js";
import { HttpError } from "../utils/errors.js";

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function requireUser(req, _res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      throw new HttpError(401, "Sign in is required");
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      throw new HttpError(401, "Your session is invalid or has expired");
    }

    req.user = data.user;
    req.accessToken = token;
    next();
  } catch (error) {
    next(error);
  }
}
