import { HttpError } from "../utils/errors.js";
import { throwIfSupabaseError } from "./supabaseHelpers.js";

const WATCHLIST_TYPES = new Set([
  "team",
  "league",
  "fixture",
  "prediction",
  "engine"
]);

function cleanText(value, max = 180) {
  return String(value || "").trim().slice(0, max);
}

function cleanMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 12000) {
    throw new HttpError(400, "Watchlist metadata is too large");
  }
  return value;
}

export function defaultNotificationPreferences(userId) {
  return {
    user_id: userId,
    enabled: true,
    papa_pick_alerts: true,
    banker_alerts: true,
    result_alerts: true,
    favorite_team_alerts: true,
    kickoff_minutes: 30,
    quiet_start: "23:00",
    quiet_end: "07:00",
    timezone: "UTC"
  };
}

export async function ensureUserProfile(supabase, user) {
  const metadata = user.user_metadata || {};
  const row = {
    id: user.id,
    email: user.email || null,
    display_name:
      cleanText(metadata.full_name || metadata.name || metadata.display_name, 100) ||
      cleanText(String(user.email || "").split("@")[0], 100) ||
      "BetsPapa User",
    avatar_url: cleanText(metadata.avatar_url || metadata.picture, 800) || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();

  throwIfSupabaseError(error, "Unable to prepare your BetsPapa profile");
  return data;
}

export async function updateUserProfile(supabase, userId, body) {
  const row = {
    id: userId,
    display_name: cleanText(body?.displayName, 100),
    avatar_url: cleanText(body?.avatarUrl, 800) || null,
    updated_at: new Date().toISOString()
  };

  if (!row.display_name) {
    throw new HttpError(400, "Display name is required");
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();

  throwIfSupabaseError(error, "Unable to update your profile");
  return data;
}

export async function listWatchlist(supabase, userId) {
  const { data, error } = await supabase
    .from("user_watchlist")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "Unable to load your watchlist");
  return data || [];
}

export async function addWatchlistItem(supabase, userId, body) {
  const itemType = cleanText(body?.itemType, 30).toLowerCase();
  if (!WATCHLIST_TYPES.has(itemType)) {
    throw new HttpError(400, "Unsupported watchlist type");
  }

  const itemKey = cleanText(body?.itemKey, 180);
  const label = cleanText(body?.label, 180);
  if (!itemKey || !label) {
    throw new HttpError(400, "Watchlist item key and label are required");
  }

  const row = {
    user_id: userId,
    item_type: itemType,
    item_key: itemKey,
    label,
    metadata: cleanMetadata(body?.metadata),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("user_watchlist")
    .upsert(row, { onConflict: "user_id,item_type,item_key" })
    .select("*")
    .single();

  throwIfSupabaseError(error, "Unable to save this watchlist item");
  return data;
}

export async function removeWatchlistItem(supabase, userId, itemId) {
  const { error } = await supabase
    .from("user_watchlist")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);

  throwIfSupabaseError(error, "Unable to remove this watchlist item");
}

export async function getNotificationPreferences(supabase, userId) {
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  throwIfSupabaseError(error, "Unable to load notification preferences");

  if (data) return data;

  const defaults = defaultNotificationPreferences(userId);
  const { data: created, error: createError } = await supabase
    .from("user_notification_preferences")
    .insert(defaults)
    .select("*")
    .single();

  throwIfSupabaseError(createError, "Unable to create notification preferences");
  return created;
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function validTime(value, fallback) {
  const text = cleanText(value, 5);
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

export async function updateNotificationPreferences(supabase, userId, body) {
  const current = await getNotificationPreferences(supabase, userId);
  const kickoffMinutes = Math.max(
    5,
    Math.min(Number(body?.kickoffMinutes ?? current.kickoff_minutes) || 30, 180)
  );

  const row = {
    user_id: userId,
    enabled: bool(body?.enabled, current.enabled),
    papa_pick_alerts: bool(body?.papaPickAlerts, current.papa_pick_alerts),
    banker_alerts: bool(body?.bankerAlerts, current.banker_alerts),
    result_alerts: bool(body?.resultAlerts, current.result_alerts),
    favorite_team_alerts: bool(
      body?.favoriteTeamAlerts,
      current.favorite_team_alerts
    ),
    kickoff_minutes: kickoffMinutes,
    quiet_start: validTime(body?.quietStart, current.quiet_start || "23:00"),
    quiet_end: validTime(body?.quietEnd, current.quiet_end || "07:00"),
    timezone: cleanText(body?.timezone, 80) || current.timezone || "UTC",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("user_notification_preferences")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();

  throwIfSupabaseError(error, "Unable to save notification preferences");
  return data;
}

export async function savePushSubscription(supabase, userId, body) {
  const endpoint = cleanText(body?.endpoint, 3000);
  const p256dh = cleanText(body?.keys?.p256dh, 1000);
  const auth = cleanText(body?.keys?.auth, 1000);

  if (!endpoint || !p256dh || !auth) {
    throw new HttpError(400, "A complete browser push subscription is required");
  }

  const row = {
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: cleanText(body?.userAgent, 500),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" })
    .select("id,user_id,endpoint,created_at,updated_at")
    .single();

  throwIfSupabaseError(error, "Unable to save push subscription");
  return data;
}

export async function removePushSubscription(supabase, userId, endpoint) {
  const cleanEndpoint = cleanText(endpoint, 3000);
  if (!cleanEndpoint) return;

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", cleanEndpoint);

  throwIfSupabaseError(error, "Unable to remove push subscription");
}
