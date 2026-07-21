import { Router } from "express";

import {
  authFeaturesConfigured,
  getSupabasePublicConfig,
  getVapidConfig,
  pushFeaturesConfigured
} from "../config.js";
import { requireUser } from "../middleware/userAuth.js";
import { getSupabaseAdmin } from "../supabase.js";
import {
  addWatchlistItem,
  ensureUserProfile,
  getNotificationPreferences,
  listWatchlist,
  removePushSubscription,
  removeWatchlistItem,
  savePushSubscription,
  updateNotificationPreferences,
  updateUserProfile
} from "../services/accountService.js";
import { sendTestNotification } from "../services/notificationService.js";

export const accountRouter = Router();

accountRouter.get("/config", (_req, res) => {
  const publicConfig = getSupabasePublicConfig();
  const vapid = getVapidConfig();

  res.json({
    authConfigured: authFeaturesConfigured(),
    pushConfigured: pushFeaturesConfigured(),
    supabaseUrl: publicConfig.url,
    supabaseAnonKey: publicConfig.anonKey,
    vapidPublicKey: vapid.publicKey
  });
});

accountRouter.use(requireUser);

accountRouter.get("/me", async (req, res, next) => {
  try {
    const profile = await ensureUserProfile(getSupabaseAdmin(), req.user);
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        createdAt: req.user.created_at,
        lastSignInAt: req.user.last_sign_in_at
      },
      profile
    });
  } catch (error) {
    next(error);
  }
});

accountRouter.patch("/profile", async (req, res, next) => {
  try {
    const profile = await updateUserProfile(
      getSupabaseAdmin(),
      req.user.id,
      req.body
    );
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

accountRouter.get("/watchlist", async (req, res, next) => {
  try {
    const items = await listWatchlist(getSupabaseAdmin(), req.user.id);
    res.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

accountRouter.post("/watchlist", async (req, res, next) => {
  try {
    const item = await addWatchlistItem(
      getSupabaseAdmin(),
      req.user.id,
      req.body
    );
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

accountRouter.delete("/watchlist/:itemId", async (req, res, next) => {
  try {
    await removeWatchlistItem(
      getSupabaseAdmin(),
      req.user.id,
      req.params.itemId
    );
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

accountRouter.get("/notification-preferences", async (req, res, next) => {
  try {
    const preferences = await getNotificationPreferences(
      getSupabaseAdmin(),
      req.user.id
    );
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

accountRouter.put("/notification-preferences", async (req, res, next) => {
  try {
    const preferences = await updateNotificationPreferences(
      getSupabaseAdmin(),
      req.user.id,
      req.body
    );
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

accountRouter.post("/push-subscription", async (req, res, next) => {
  try {
    const subscription = await savePushSubscription(
      getSupabaseAdmin(),
      req.user.id,
      req.body
    );
    res.status(201).json({ subscription });
  } catch (error) {
    next(error);
  }
});

accountRouter.delete("/push-subscription", async (req, res, next) => {
  try {
    await removePushSubscription(
      getSupabaseAdmin(),
      req.user.id,
      req.body?.endpoint
    );
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

accountRouter.post("/push-test", async (req, res, next) => {
  try {
    const result = await sendTestNotification(
      getSupabaseAdmin(),
      req.user.id
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
