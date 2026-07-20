import crypto from "node:crypto";
import { HttpError } from "../utils/errors.js";

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function requireAdmin(req, _res, next) {
  try {
    const configured = process.env.ADMIN_SYNC_SECRET;
    if (!configured) {
      throw new HttpError(503, "ADMIN_SYNC_SECRET is not configured on the server");
    }

    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const supplied = req.headers["x-admin-secret"] || bearer;

    if (!constantTimeEqual(supplied, configured)) {
      throw new HttpError(401, "Invalid or missing admin secret");
    }

    next();
  } catch (error) {
    next(error);
  }
}
