const API_BASES = [
  window.BETSPAPA_API_URL,
  "https://api.betspapa.com",
  "https://betspapa.onrender.com"
].filter((value, index, list) => value && list.indexOf(value) === index);

let activeBase = null;
let configPromise = null;
let clientPromise = null;

async function api(path, options = {}) {
  let lastError;

  for (const base of API_BASES) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {})
        },
        cache: "no-store"
      });

      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }

      if (!response.ok) {
        throw new Error(payload.message || payload.error || payload.raw || "Request failed");
      }

      activeBase = base;
      return payload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("BetsPapa account API is unavailable");
}

async function loadConfig() {
  if (!configPromise) {
    configPromise = api("/api/account/config");
  }
  return configPromise;
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = await loadConfig();
      if (!config.authConfigured) {
        throw new Error(
          "Accounts are not configured yet. Add SUPABASE_ANON_KEY in Render."
        );
      }

      const module = await import(
        "https://esm.sh/@supabase/supabase-js@2.57.4"
      );

      return module.createClient(
        config.supabaseUrl,
        config.supabaseAnonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    })();
  }
  return clientPromise;
}

async function session() {
  const client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function authenticatedApi(path, options = {}) {
  const currentSession = await session();
  if (!currentSession?.access_token) {
    throw new Error("Sign in is required");
  }

  return api(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${currentSession.access_token}`,
      ...(options.headers || {})
    }
  });
}

async function signInWithEmail(email, password) {
  const client = await getClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

async function signUpWithEmail(email, password, displayName) {
  const client = await getClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        full_name: displayName
      },
      emailRedirectTo: `${location.origin}/account.html`
    }
  });
  if (error) throw error;
  return data;
}

async function signInWithGoogle() {
  const client = await getClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${location.origin}/account.html`
    }
  });
  if (error) throw error;
  return data;
}

async function resetPassword(email) {
  const client = await getClient();
  const { data, error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/account.html?mode=reset`
  });
  if (error) throw error;
  return data;
}

async function updatePassword(password) {
  const client = await getClient();
  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

async function signOut() {
  const client = await getClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

async function getMe() {
  return authenticatedApi("/api/account/me");
}

async function updateProfile(displayName, avatarUrl) {
  return authenticatedApi("/api/account/profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName, avatarUrl })
  });
}

async function listWatchlist() {
  return authenticatedApi("/api/account/watchlist");
}

async function addToWatchlist(item) {
  return authenticatedApi("/api/account/watchlist", {
    method: "POST",
    body: JSON.stringify(item)
  });
}

async function removeFromWatchlist(itemId) {
  return authenticatedApi(`/api/account/watchlist/${encodeURIComponent(itemId)}`, {
    method: "DELETE"
  });
}

async function getNotificationPreferences() {
  return authenticatedApi("/api/account/notification-preferences");
}

async function saveNotificationPreferences(preferences) {
  return authenticatedApi("/api/account/notification-preferences", {
    method: "PUT",
    body: JSON.stringify(preferences)
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

async function enablePush() {
  const config = await loadConfig();
  if (!config.pushConfigured || !config.vapidPublicKey) {
    throw new Error("Push alerts are not configured on the server yet");
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("This browser does not support web push notifications");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
    });
  }

  const json = subscription.toJSON();
  await authenticatedApi("/api/account/push-subscription", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent
    })
  });

  return subscription;
}

async function disablePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await authenticatedApi("/api/account/push-subscription", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });

  await subscription.unsubscribe();
}

async function sendTestPush() {
  return authenticatedApi("/api/account/push-test", {
    method: "POST"
  });
}

async function signedInUser() {
  const currentSession = await session();
  return currentSession?.user || null;
}

function redirectToAccount(next = location.href) {
  const url = new URL("/account.html", location.origin);
  url.searchParams.set("next", next);
  location.href = url.toString();
}

async function updateAccountLabels() {
  let user = null;
  try {
    user = await signedInUser();
  } catch {
    user = null;
  }

  document.querySelectorAll("[data-account-label]").forEach((node) => {
    node.textContent = user
      ? user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "Account"
      : "Sign In";
  });

  document.documentElement.dataset.authenticated = user ? "true" : "false";
  window.dispatchEvent(
    new CustomEvent("betspapa:auth", { detail: { user } })
  );
}

const apiObject = {
  api,
  loadConfig,
  getClient,
  session,
  signedInUser,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  resetPassword,
  updatePassword,
  signOut,
  getMe,
  updateProfile,
  listWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getNotificationPreferences,
  saveNotificationPreferences,
  enablePush,
  disablePush,
  sendTestPush,
  redirectToAccount,
  updateAccountLabels
};

window.BetsPapaAccount = apiObject;

document.addEventListener("DOMContentLoaded", updateAccountLabels, { once: true });
