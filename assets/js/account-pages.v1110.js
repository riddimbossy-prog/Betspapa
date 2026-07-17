(() => {
  "use strict";

  const page = document.body.dataset.accountPage || "account";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function message(text, type = "") {
    const node = $("#accountMessage");
    if (!node) return;
    node.textContent = text;
    node.className = `account-message ${type}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function requireApi() {
    if (!window.BetsPapaAccount) {
      throw new Error("BetsPapa account tools did not load");
    }
    return window.BetsPapaAccount;
  }

  async function requireUserOrShow() {
    const api = await requireApi();
    const user = await api.signedInUser();
    if (!user) {
      $("#signedOutGate")?.removeAttribute("hidden");
      $("#signedInContent")?.setAttribute("hidden", "");
      return null;
    }
    $("#signedOutGate")?.setAttribute("hidden", "");
    $("#signedInContent")?.removeAttribute("hidden");
    return user;
  }

  async function loadAccount() {
    const api = await requireApi();
    const user = await api.signedInUser();

    if (!user) {
      $("#authPanel")?.removeAttribute("hidden");
      $("#profilePanel")?.setAttribute("hidden", "");
      return;
    }

    $("#authPanel")?.setAttribute("hidden", "");
    $("#profilePanel")?.removeAttribute("hidden");

    const payload = await api.getMe();
    const profile = payload.profile || {};
    const initial = String(profile.display_name || user.email || "B")[0].toUpperCase();

    $("#profileIdentity").innerHTML = `
      ${profile.avatar_url
        ? `<img src="${escapeHtml(profile.avatar_url)}" alt="">`
        : `<span class="user-avatar-fallback">${escapeHtml(initial)}</span>`}
      <div>
        <strong>${escapeHtml(profile.display_name || "BetsPapa User")}</strong>
        <p>${escapeHtml(user.email || "")}</p>
      </div>`;

    $("#displayName").value = profile.display_name || "";
    $("#avatarUrl").value = profile.avatar_url || "";
    message("Your account is connected.", "success");
  }

  function setupAuthTabs() {
    const tabs = $$(".auth-tabs button");
    const signin = $("#signInFields");
    const signup = $("#signUpFields");

    tabs.forEach((button) => {
      button.addEventListener("click", () => {
        tabs.forEach((tab) => tab.classList.remove("active"));
        button.classList.add("active");
        const signupMode = button.dataset.authTab === "signup";
        signin.hidden = signupMode;
        signup.hidden = !signupMode;
      });
    });
  }

  function setupAccountActions() {
    $("#googleSignIn")?.addEventListener("click", async () => {
      try {
        message("Opening Google sign-in…");
        await window.BetsPapaAccount.signInWithGoogle();
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#emailSignIn")?.addEventListener("click", async () => {
      try {
        const email = $("#signinEmail").value.trim();
        const password = $("#signinPassword").value;
        await window.BetsPapaAccount.signInWithEmail(email, password);
        await loadAccount();
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#emailSignUp")?.addEventListener("click", async () => {
      try {
        const displayName = $("#signupName").value.trim();
        const email = $("#signupEmail").value.trim();
        const password = $("#signupPassword").value;
        const result = await window.BetsPapaAccount.signUpWithEmail(
          email,
          password,
          displayName
        );
        message(
          result.session
            ? "Account created and signed in."
            : "Account created. Check your email to confirm it.",
          "success"
        );
        await loadAccount();
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#forgotPassword")?.addEventListener("click", async () => {
      try {
        const email = $("#signinEmail").value.trim();
        if (!email) throw new Error("Enter your email first");
        await window.BetsPapaAccount.resetPassword(email);
        message("Password reset email sent.", "success");
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#saveProfile")?.addEventListener("click", async () => {
      try {
        await window.BetsPapaAccount.updateProfile(
          $("#displayName").value.trim(),
          $("#avatarUrl").value.trim()
        );
        message("Profile updated.", "success");
        await loadAccount();
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#signOut")?.addEventListener("click", async () => {
      try {
        await window.BetsPapaAccount.signOut();
        location.reload();
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#updatePassword")?.addEventListener("click", async () => {
      try {
        const password = $("#newPassword").value;
        if (password.length < 8) {
          throw new Error("Use at least eight characters");
        }
        await window.BetsPapaAccount.updatePassword(password);
        message("Password updated.", "success");
        $("#newPassword").value = "";
      } catch (error) {
        message(error.message, "error");
      }
    });
  }

  async function loadWatchlist() {
    const user = await requireUserOrShow();
    if (!user) return;

    const payload = await window.BetsPapaAccount.listWatchlist();
    const items = payload.items || [];
    let activeType = "";

    const render = () => {
      const filtered = activeType
        ? items.filter((item) => item.item_type === activeType)
        : items;

      $("#watchCount").textContent = String(filtered.length);
      $("#watchGrid").innerHTML = filtered.length
        ? filtered.map((item) => {
            const metadata = item.metadata || {};
            return `
              <article class="watch-item">
                <small>${escapeHtml(item.item_type.toUpperCase())}</small>
                <strong>${escapeHtml(item.label)}</strong>
                <p>${escapeHtml(
                  metadata.selection ||
                  metadata.league ||
                  metadata.description ||
                  "Saved to your personal BetsPapa watchlist."
                )}</p>
                <div class="watch-item-actions">
                  ${metadata.url
                    ? `<a href="${escapeHtml(metadata.url)}">Open</a>`
                    : ""}
                  <button type="button" data-remove-watch="${escapeHtml(item.id)}">Remove</button>
                </div>
              </article>`;
          }).join("")
        : `<div class="empty-state">Nothing is saved in this watchlist category yet.</div>`;

      $$("[data-remove-watch]").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await window.BetsPapaAccount.removeFromWatchlist(
              button.dataset.removeWatch
            );
            await loadWatchlist();
          } catch (error) {
            message(error.message, "error");
          }
        });
      });
    };

    $$(".watch-toolbar button").forEach((button) => {
      button.addEventListener("click", () => {
        $$(".watch-toolbar button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        activeType = button.dataset.watchType || "";
        render();
      });
    });

    render();
  }

  function setCheckbox(id, value) {
    const input = $(id);
    if (input) input.checked = Boolean(value);
  }

  async function loadSettings() {
    const user = await requireUserOrShow();
    if (!user) return;

    const payload = await window.BetsPapaAccount.getNotificationPreferences();
    const pref = payload.preferences || {};

    setCheckbox("#alertsEnabled", pref.enabled);
    setCheckbox("#papaPickAlerts", pref.papa_pick_alerts);
    setCheckbox("#bankerAlerts", pref.banker_alerts);
    setCheckbox("#resultAlerts", pref.result_alerts);
    setCheckbox("#favoriteTeamAlerts", pref.favorite_team_alerts);

    $("#kickoffMinutes").value = pref.kickoff_minutes || 30;
    $("#quietStart").value = String(pref.quiet_start || "23:00").slice(0,5);
    $("#quietEnd").value = String(pref.quiet_end || "07:00").slice(0,5);
    $("#timezone").value =
      pref.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC";
  }

  function setupSettingsActions() {
    $("#saveSettings")?.addEventListener("click", async () => {
      try {
        await window.BetsPapaAccount.saveNotificationPreferences({
          enabled: $("#alertsEnabled").checked,
          papaPickAlerts: $("#papaPickAlerts").checked,
          bankerAlerts: $("#bankerAlerts").checked,
          resultAlerts: $("#resultAlerts").checked,
          favoriteTeamAlerts: $("#favoriteTeamAlerts").checked,
          kickoffMinutes: Number($("#kickoffMinutes").value),
          quietStart: $("#quietStart").value,
          quietEnd: $("#quietEnd").value,
          timezone:
            $("#timezone").value.trim() ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC"
        });
        message("Notification settings saved.", "success");
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#enablePush")?.addEventListener("click", async () => {
      try {
        await window.BetsPapaAccount.enablePush();
        message("Push notifications enabled on this device.", "success");
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#disablePush")?.addEventListener("click", async () => {
      try {
        await window.BetsPapaAccount.disablePush();
        message("Push notifications disabled on this device.", "success");
      } catch (error) {
        message(error.message, "error");
      }
    });

    $("#testPush")?.addEventListener("click", async () => {
      try {
        const result = await window.BetsPapaAccount.sendTestPush();
        message(
          result.sent
            ? "Test notification sent."
            : result.message || "No active subscription was found.",
          result.sent ? "success" : ""
        );
      } catch (error) {
        message(error.message, "error");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      if (page === "account") {
        setupAuthTabs();
        setupAccountActions();
        await loadAccount();
      } else if (page === "watchlist") {
        await loadWatchlist();
      } else if (page === "settings") {
        setupSettingsActions();
        await loadSettings();
      }
    } catch (error) {
      message(
        `${error.message}. Run the v1.11 Supabase migration and check Render settings.`,
        "error"
      );
    }
  }, { once: true });
})();
