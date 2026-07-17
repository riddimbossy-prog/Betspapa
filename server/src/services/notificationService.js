import {
  ENGINE_VERSION,
  getVapidConfig,
  pushFeaturesConfigured
} from "../config.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

function preferenceColumn(eventType) {
  return {
    "papa-picks": "papa_pick_alerts",
    bankers: "banker_alerts",
    results: "result_alerts",
    "favorite-team": "favorite_team_alerts",
    kickoff: "favorite_team_alerts"
  }[eventType] || "enabled";
}

function localMinutes(timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
    return hour * 60 + minute;
  } catch {
    const date = new Date();
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function timeMinutes(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return (Number(hour) || 0) * 60 + (Number(minute) || 0);
}

function insideQuietHours(preference) {
  const now = localMinutes(preference.timezone);
  const start = timeMinutes(preference.quiet_start);
  const end = timeMinutes(preference.quiet_end);

  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

async function loadWebPush() {
  const imported = await import("web-push");
  return imported.default || imported;
}

async function loadRecipients(supabase, eventType) {
  const [subscriptions, preferences] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("push_subscriptions")
        .select("*")
    ),
    fetchAllRows(() =>
      supabase
        .from("user_notification_preferences")
        .select("*")
    )
  ]);

  const preferenceMap = new Map(
    preferences.map((preference) => [preference.user_id, preference])
  );
  const column = preferenceColumn(eventType);

  return subscriptions.filter((subscription) => {
    const preference = preferenceMap.get(subscription.user_id);
    if (!preference || !preference.enabled || !preference[column]) return false;
    return !insideQuietHours(preference);
  });
}

async function eventExists(supabase, eventKey) {
  const { data, error } = await supabase
    .from("notification_events")
    .select("id")
    .eq("event_key", eventKey)
    .maybeSingle();

  throwIfSupabaseError(error, "Unable to check notification event");
  return Boolean(data);
}

async function saveEvent(supabase, event) {
  const { error } = await supabase
    .from("notification_events")
    .insert(event);

  throwIfSupabaseError(error, "Unable to save notification event");
}

function defaultPayload(eventType, date, summary = {}) {
  if (eventType === "bankers") {
    return {
      title: "BetsPapa Bankers are ready",
      body: `${summary.count || "Today's"} strict selections passed Papa's banker rules.`,
      url: `/bankers.html?date=${date}`,
      tag: `bankers-${date}`
    };
  }

  if (eventType === "results") {
    return {
      title: "BetsPapa results updated",
      body: `${summary.wins || 0} wins, ${summary.losses || 0} losses and ${summary.voids || 0} voids were graded.`,
      url: "/results-intelligence.html",
      tag: `results-${date}`
    };
  }

  if (eventType === "kickoff") {
    return {
      title: "A watched match starts soon",
      body: summary.body || "Open BetsPapa to review Papa's latest direction.",
      url: summary.url || "/watchlist.html",
      tag: summary.tag || `kickoff-${date}`
    };
  }

  return {
    title: "Papa's Picks are ready",
    body: `${summary.count || "New"} completed predictions are now available.`,
    url: `/papas-pick.html?date=${date}`,
    tag: `papa-picks-${date}`
  };
}

export async function dispatchNotificationEvent(
  supabase,
  {
    eventType,
    date,
    eventKey,
    summary = {},
    payload = null,
    force = false
  }
) {
  if (!pushFeaturesConfigured()) {
    return {
      configured: false,
      sent: 0,
      failed: 0,
      message: "VAPID keys are not configured"
    };
  }

  const key = String(
    eventKey || `${eventType}:${date}:${ENGINE_VERSION}`
  ).slice(0, 250);

  if (!force && await eventExists(supabase, key)) {
    return {
      configured: true,
      duplicate: true,
      sent: 0,
      failed: 0
    };
  }

  const recipients = await loadRecipients(supabase, eventType);
  if (!recipients.length) {
    await saveEvent(supabase, {
      event_key: key,
      event_type: eventType,
      payload: payload || defaultPayload(eventType, date, summary),
      sent_count: 0,
      failed_count: 0
    });

    return {
      configured: true,
      recipients: 0,
      sent: 0,
      failed: 0
    };
  }

  const webpush = await loadWebPush();
  const vapid = getVapidConfig();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const message = {
    ...defaultPayload(eventType, date, summary),
    ...(payload || {}),
    icon: "/assets/images/icon-maskable-192.png",
    badge: "/assets/images/favicon-64.png",
    timestamp: Date.now()
  };

  let sent = 0;
  let failed = 0;
  const staleEndpoints = [];

  for (const subscription of recipients) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        JSON.stringify(message),
        {
          TTL: 60 * 60,
          urgency: eventType === "kickoff" ? "high" : "normal"
        }
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      if ([404, 410].includes(Number(error?.statusCode))) {
        staleEndpoints.push(subscription.endpoint);
      }
    }
  }

  if (staleEndpoints.length) {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", staleEndpoints);
    throwIfSupabaseError(error, "Unable to remove expired push subscriptions");
  }

  await saveEvent(supabase, {
    event_key: key,
    event_type: eventType,
    payload: message,
    sent_count: sent,
    failed_count: failed
  });

  return {
    configured: true,
    recipients: recipients.length,
    sent,
    failed,
    staleRemoved: staleEndpoints.length
  };
}

export async function sendTestNotification(supabase, userId) {
  if (!pushFeaturesConfigured()) {
    return {
      configured: false,
      sent: 0,
      message: "VAPID keys are not configured"
    };
  }

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);

  throwIfSupabaseError(error, "Unable to load your push subscriptions");

  const webpush = await loadWebPush();
  const vapid = getVapidConfig();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  let sent = 0;
  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        JSON.stringify({
          title: "BetsPapa notifications are working",
          body: "Papa will alert you when your selected updates are ready.",
          url: "/settings.html",
          tag: "betspapa-test",
          icon: "/assets/images/icon-maskable-192.png",
          badge: "/assets/images/favicon-64.png"
        })
      );
      sent += 1;
    } catch {
      // Keep the test best-effort; expired rows are cleaned during normal dispatch.
    }
  }

  return {
    configured: true,
    subscriptions: subscriptions?.length || 0,
    sent
  };
}
