/**
 * Best-effort local reminders for Jet Lag Coach.
 * - Requests Notification permission
 * - Schedules via service worker messages while app is open/backgrounded
 * - Uses TimestampTrigger (Notification Triggers API) when available
 * Honest limits: reliable delivery when fully closed needs a push server (not used here).
 */
(function () {
  const KEY_ACTIONS = new Set(["seek", "avoid", "sleep", "nap", "mel", "meal", "flight", "awake", "ncaff"]);
  const LEAD_MS = 15 * 60 * 1000;
  const STORAGE_KEY = "jetlag-notif-enabled";

  function supportsNotifications() {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  function supportsTimestampTrigger() {
    return typeof TimestampTrigger !== "undefined" && "showTrigger" in Notification.prototype;
  }

  async function ensurePermission() {
    if (!supportsNotifications()) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return await Notification.requestPermission();
  }

  function buildReminders(absoluteBlocks) {
    const now = Date.now();
    const out = [];
    for (const b of absoluteBlocks) {
      if (!KEY_ACTIONS.has(b.t)) continue;
      // Skip continuous background bands that aren't "start of action" useful
      if (b.t === "caff") continue;
      const start = b.startMs;
      const fireAt = start - LEAD_MS;
      if (fireAt < now - 60_000) continue; // already past
      const typeMeta = (window.JETLAG_DATA.blockTypes || {})[b.t] || { label: b.t };
      let title = typeMeta.label || b.t;
      let body = b.note || b.dayTip || b.focus || "";
      if (b.t === "mel" && b.dayMel) body = b.dayMel + (body ? " — " + body : "");
      if (b.t === "ncaff") {
        title = "Caffeine cutoff";
        body = "No more caffeine from now until sleep.";
      }
      if (b.t === "flight") {
        title = "Flight soon: " + (b.flightLabel || "departure");
        body = b.note || b.dayTip || body;
      }
      out.push({
        id: b.id,
        fireAt,
        start,
        title: "Jet Lag Coach · " + title,
        body: body || "Upcoming action on your timeline",
        tag: "jetlag-" + b.id,
        data: { blockId: b.id, type: b.t },
      });
    }
    // de-dupe by tag keeping earliest
    const map = new Map();
    for (const r of out) {
      if (!map.has(r.tag) || map.get(r.tag).fireAt > r.fireAt) map.set(r.tag, r);
    }
    return [...map.values()].sort((a, b) => a.fireAt - b.fireAt);
  }

  let timerHandles = [];
  let triggerIds = [];

  function clearLocalTimers() {
    for (const h of timerHandles) clearTimeout(h);
    timerHandles = [];
  }

  async function cancelTriggered() {
    if (!supportsTimestampTrigger()) return;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      // Cancel by showing with same tag is not enough; use getNotifications if available
      if (regs[0]) {
        const notes = await regs[0].getNotifications({ includeTriggered: true }).catch(() => []);
        for (const n of notes) {
          if (n.tag && n.tag.startsWith("jetlag-")) n.close();
        }
      }
    } catch (_) {}
    triggerIds = [];
  }

  async function scheduleAll(absoluteBlocks) {
    const enabled = localStorage.getItem(STORAGE_KEY) === "1";
    if (!enabled) return { scheduled: 0, mode: "off" };

    const perm = await ensurePermission();
    if (perm !== "granted") return { scheduled: 0, mode: perm };

    const reminders = buildReminders(absoluteBlocks);
    clearLocalTimers();
    await cancelTriggered();

    const reg = await navigator.serviceWorker.ready;
    let mode = "timer";
    let count = 0;

    if (supportsTimestampTrigger()) {
      mode = "timestamp-trigger";
      for (const r of reminders.slice(0, 48)) {
        // Chrome limits pending triggered notifications
        try {
          await reg.showNotification(r.title, {
            body: r.body,
            tag: r.tag,
            icon: "./icons/icon-192.png",
            badge: "./icons/icon-192.png",
            data: r.data,
            showTrigger: new TimestampTrigger(r.fireAt),
          });
          count++;
          triggerIds.push(r.tag);
        } catch (err) {
          // fall through to timer for this one
          mode = "mixed";
          const delay = Math.max(0, r.fireAt - Date.now());
          if (delay < 2147483647) {
            const h = setTimeout(() => {
              reg.showNotification(r.title, {
                body: r.body,
                tag: r.tag,
                icon: "./icons/icon-192.png",
                data: r.data,
              });
            }, delay);
            timerHandles.push(h);
            count++;
          }
        }
      }
    } else {
      mode = "timer+sw";
      for (const r of reminders) {
        const delay = Math.max(0, r.fireAt - Date.now());
        if (delay >= 2147483647) continue; // setTimeout 32-bit cap ~24.8d
        const h = setTimeout(() => {
          // Prefer SW so it can show when page is backgrounded (same origin SW)
          reg.showNotification(r.title, {
            body: r.body,
            tag: r.tag,
            icon: "./icons/icon-192.png",
            badge: "./icons/icon-192.png",
            data: r.data,
          }).catch(() => {
            if (Notification.permission === "granted") {
              new Notification(r.title, { body: r.body, tag: r.tag, icon: "./icons/icon-192.png" });
            }
          });
        }, delay);
        timerHandles.push(h);
        count++;
      }
      // Also ask SW to keep a mirror list for periodic checks while alive
      if (reg.active) {
        reg.active.postMessage({ type: "SET_REMINDERS", reminders });
      }
    }

    return { scheduled: count, mode, supportsTrigger: supportsTimestampTrigger() };
  }

  async function enable(absoluteBlocks) {
    localStorage.setItem(STORAGE_KEY, "1");
    const perm = await ensurePermission();
    if (perm !== "granted") {
      localStorage.setItem(STORAGE_KEY, "0");
      return { ok: false, perm };
    }
    const result = await scheduleAll(absoluteBlocks);
    return { ok: true, ...result };
  }

  function disable() {
    localStorage.setItem(STORAGE_KEY, "0");
    clearLocalTimers();
    cancelTriggered();
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.active) reg.active.postMessage({ type: "CLEAR_REMINDERS" });
    });
  }

  function isEnabled() {
    return localStorage.getItem(STORAGE_KEY) === "1";
  }

  window.JetLagNotifs = {
    supportsNotifications,
    supportsTimestampTrigger,
    ensurePermission,
    scheduleAll,
    enable,
    disable,
    isEnabled,
    buildReminders,
  };
})();
