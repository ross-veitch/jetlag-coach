(function () {
  const ORIGIN_TZ = "Asia/Singapore";
  const data = window.JETLAG_DATA;
  const trip = data.trips[0];

  // —— Time helpers ——
  function parseLocalHoursOnDate(dateStr, hourFloat, iana) {
    // Build a Date for `dateStr` at hourFloat in the given IANA zone.
    const h = Math.floor(hourFloat);
    const m = Math.round((hourFloat - h) * 60);
    // Use a formatter trick: construct as UTC then shift — better: use temporal-like offset from known off
    // We pass off as well via day object; prefer explicit offset hours from SGT when available.
    return { h, m };
  }

  /** Convert day-local hour float to epoch ms using day's off (SGT = local + off). */
  function localHourToMs(day, hourFloat) {
    const h = Math.floor(hourFloat);
    let m = Math.round((hourFloat - h) * 60);
    let hh = h;
    let carry = 0;
    if (m === 60) { m = 0; hh += 1; }
    if (hh >= 24) { carry = Math.floor(hh / 24); hh = hh % 24; }
    // Local wall time as ISO with fixed offset derived from iana abbr via off relative to SGT (UTC+8)
    // UTC offset hours for local = 8 - off
    const utcOffHours = 8 - day.off;
    const sign = utcOffHours >= 0 ? "+" : "-";
    const abs = Math.abs(utcOffHours);
    const offStr = sign + String(Math.floor(abs)).padStart(2, "0") + ":00";
    const d = new Date(day.date + "T00:00:00" + offStr);
    d.setTime(d.getTime() + carry * 86400000 + hh * 3600000 + m * 60000);
    return d.getTime();
  }

  function fmtInTz(ms, timeZone, opts) {
    return new Intl.DateTimeFormat("en-GB", { timeZone, ...opts }).format(new Date(ms));
  }

  function partsInTz(ms, timeZone) {
    const f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    return parts;
  }

  function hourLabel(ms, timeZone) {
    const p = partsInTz(ms, timeZone);
    return p.hour + ":" + p.minute;
  }

  function dayLabel(ms, timeZone) {
    const p = partsInTz(ms, timeZone);
    return p.weekday + " " + p.day + " " + p.month;
  }

  // —— Build absolute timeline ——
  function buildAbsolute(trip) {
    const blocks = [];
    let idSeq = 0;
    for (const day of trip.days) {
      for (const b of day.blocks) {
        const startMs = localHourToMs(day, b.a);
        const endMs = localHourToMs(day, b.b);
        if (endMs <= startMs) continue;
        let flightLabel = null;
        if (b.t === "flight") {
          const fl = (data.flights || []).find((f) => {
            const dep = Date.parse(f.dep);
            return Math.abs(dep - startMs) < 6 * 3600000 || (startMs <= dep && dep <= endMs);
          });
          flightLabel = fl ? fl.label : null;
        }
        blocks.push({
          id: "b" + ++idSeq,
          t: b.t,
          note: b.note,
          startMs,
          endMs,
          dayId: day.id,
          dayTitle: day.title,
          focus: day.focus,
          dayTip: day.tip,
          dayMel: day.mel,
          dayNap: day.nap,
          dayCbt: day.cbt,
          localTz: day.iana,
          localAbbr: day.tz,
          flightLabel,
        });
      }
    }

    const startMs = localHourToMs(trip.days[0], 0);
    const last = trip.days[trip.days.length - 1];
    const endMs = localHourToMs(last, 24);

    const zoneMarkers = (trip.zoneSegments || []).slice(1).map((z) => ({
      ms: Date.parse(z.from),
      label: "Zone → " + z.label + " (" + z.abbr + ")",
      abbr: z.abbr,
      tz: z.tz,
      place: z.label,
    }));

    return { blocks, startMs, endMs, zoneMarkers };
  }

  const abs = buildAbsolute(trip);
  const PX = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--px-per-hour")) || 40;

  function yOf(ms) {
    return ((ms - abs.startMs) / 3600000) * PX();
  }

  // Resolve RHS zone at a given ms
  function rhsZoneAt(ms) {
    const segs = trip.zoneSegments;
    let cur = segs[0];
    for (const s of segs) {
      if (ms >= Date.parse(s.from)) cur = s;
    }
    return cur;
  }

  // —— DOM refs ——
  const els = {
    scroll: document.getElementById("timeline-scroll"),
    timeline: document.getElementById("timeline"),
    body: document.getElementById("timeline-body"),
    lhs: document.getElementById("axis-lhs"),
    rhs: document.getElementById("axis-rhs"),
    spine: document.getElementById("spine"),
    legend: document.getElementById("legend"),
    nowLine: document.getElementById("now-line"),
    fab: document.getElementById("fab-now"),
    sheet: document.getElementById("sheet"),
    sheetBd: document.getElementById("sheet-backdrop"),
    sheetContent: document.getElementById("sheet-content"),
    panel: document.getElementById("panel"),
    notifBtn: document.getElementById("btn-notif"),
    infoBtn: document.getElementById("btn-info"),
    banner: document.getElementById("out-banner"),
    rhsHead: document.getElementById("rhs-head"),
  };

  // —— Legend ——
  function renderLegend() {
    const order = ["seek", "avoid", "sleep", "nap", "caff", "ncaff", "mel", "meal", "flight"];
    els.legend.innerHTML = order
      .map((k) => {
        const m = data.blockTypes[k];
        if (!m) return "";
        return `<span class="legend-chip"><span class="legend-swatch" style="background:${m.color}"></span>${m.label}</span>`;
      })
      .join("");
  }

  // —— Render timeline ——
  function render() {
    const height = yOf(abs.endMs);
    els.timeline.style.height = height + "px";
    els.body.style.height = height + "px";
    els.spine.style.height = height + "px";
    els.lhs.style.height = height + "px";
    els.rhs.style.height = height + "px";

    // Spine track
    els.spine.innerHTML = '<div class="spine-track"></div>';

    // Layer order: flight/awake behind, then sleep/seek/avoid, then caff, then meal/mel on top
    const zOrder = { flight: 1, awake: 1, sleep: 2, nap: 2, seek: 3, avoid: 3, caff: 4, ncaff: 4, meal: 5, mel: 6 };
    const sorted = [...abs.blocks].sort((a, b) => (zOrder[a.t] || 0) - (zOrder[b.t] || 0));

    for (const b of sorted) {
      const top = yOf(b.startMs);
      const h = Math.max(yOf(b.endMs) - top, b.t === "mel" ? 28 : 16);
      const meta = data.blockTypes[b.t] || { label: b.t, short: b.t };
      const el = document.createElement("button");
      el.type = "button";
      el.className = "block t-" + b.t;
      el.style.top = top + "px";
      el.style.height = h + "px";
      el.dataset.id = b.id;
      const durH = (b.endMs - b.startMs) / 3600000;
      let sub = "";
      if (b.t === "flight" && b.flightLabel) sub = b.flightLabel;
      else if (b.note) sub = b.note;
      else if (durH >= 1.2) {
        sub =
          hourLabel(b.startMs, b.localTz) +
          "–" +
          hourLabel(b.endMs, b.localTz) +
          " " +
          b.localAbbr;
      }
      el.innerHTML =
        `<span class="lbl">${escapeHtml(meta.short || meta.label)}</span>` +
        (sub && h >= 28 ? `<span class="sub">${escapeHtml(sub)}</span>` : "");
      el.addEventListener("click", () => openDetail(b));
      els.spine.appendChild(el);
    }

    // Day markers + axis ticks every 2h, major at 0:00
    let t = abs.startMs;
    // Align to next whole hour in SGT for ticks
    const startParts = partsInTz(abs.startMs, ORIGIN_TZ);
    // iterate hourly
    const hourMs = 3600000;
    // Snap to hour boundary in UTC-ish by walking
    for (let ms = abs.startMs; ms <= abs.endMs + 1; ms += hourMs) {
      // Use SGT hour
      const p = partsInTz(ms, ORIGIN_TZ);
      const minute = parseInt(p.minute, 10);
      if (minute !== 0) continue;
      const hour = parseInt(p.hour, 10);
      const y = yOf(ms);
      const isMidnight = hour === 0;

      if (isMidnight) {
        const dm = document.createElement("div");
        dm.className = "day-marker";
        dm.style.top = y + "px";
        els.spine.appendChild(dm);
        const dl = document.createElement("div");
        dl.className = "day-marker-label";
        dl.style.top = y + "px";
        dl.textContent = dayLabel(ms, ORIGIN_TZ);
        els.spine.appendChild(dl);
      }

      if (hour % 2 === 0 || isMidnight) {
        const lhsTick = document.createElement("div");
        lhsTick.className = "tick" + (isMidnight ? " major" : " hour-only");
        lhsTick.style.top = y + "px";
        lhsTick.innerHTML =
          (isMidnight ? `<span class="day">${escapeHtml(dayLabel(ms, ORIGIN_TZ))}</span>` : "") +
          `<span class="time">${p.hour}:${p.minute}</span>`;
        els.lhs.appendChild(lhsTick);

        const rz = rhsZoneAt(ms);
        const rp = partsInTz(ms, rz.tz);
        const rhsTick = document.createElement("div");
        rhsTick.className = "tick" + (isMidnight || rp.hour === "00" ? " major" : " hour-only");
        rhsTick.style.top = y + "px";
        const showDay = rp.hour === "00" || isMidnight;
        rhsTick.innerHTML =
          (showDay ? `<span class="day">${escapeHtml(dayLabel(ms, rz.tz))}</span>` : "") +
          `<span class="time">${rp.hour}:${rp.minute} <small style="opacity:.7">${rz.abbr}</small></span>`;
        els.rhs.appendChild(rhsTick);
      }
    }

    // Zone markers
    for (const z of abs.zoneMarkers) {
      if (z.ms < abs.startMs || z.ms > abs.endMs) continue;
      const el = document.createElement("div");
      el.className = "zone-marker";
      el.style.top = yOf(z.ms) + "px";
      el.innerHTML = `<span>${escapeHtml(z.label)}</span>`;
      els.spine.appendChild(el);
    }

    updateNow();
    updateRhsHead();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateRhsHead() {
    const now = Date.now();
    const z = rhsZoneAt(Math.min(Math.max(now, abs.startMs), abs.endMs));
    els.rhsHead.textContent = z.abbr + " · " + z.label;
  }

  // —— Now line ——
  function updateNow() {
    const now = Date.now();
    const inWindow = now >= abs.startMs && now <= abs.endMs;
    if (!inWindow) {
      els.nowLine.style.display = "none";
      els.banner.hidden = false;
      const when =
        now < abs.startMs
          ? "Trip starts " + dayLabel(abs.startMs, ORIGIN_TZ) + " (SGT)"
          : "Trip window ended " + dayLabel(abs.endMs, ORIGIN_TZ);
      els.banner.textContent = when + " · jump still works · plan is offline-ready";
    } else {
      els.banner.hidden = true;
      els.nowLine.style.display = "block";
      els.nowLine.style.top = yOf(now) + "px";
    }
    updateRhsHead();
  }

  function scrollToNow(smooth) {
    const now = Date.now();
    const targetMs = Math.min(Math.max(now, abs.startMs), abs.endMs);
    const y = yOf(targetMs) - els.scroll.clientHeight * 0.35;
    els.scroll.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
  }

  // —— Detail sheet ——
  function openDetail(b) {
    const meta = data.blockTypes[b.t] || { label: b.t, color: "#888" };
    const startS = dayLabel(b.startMs, ORIGIN_TZ) + " " + hourLabel(b.startMs, ORIGIN_TZ) + " SGT";
    const endS = hourLabel(b.endMs, ORIGIN_TZ) + " SGT";
    const startL = dayLabel(b.startMs, b.localTz) + " " + hourLabel(b.startMs, b.localTz) + " " + b.localAbbr;
    const endL = hourLabel(b.endMs, b.localTz) + " " + b.localAbbr;
    let extra = "";
    if (b.t === "mel") extra += prop("Melatonin", b.dayMel || meta.label);
    if (b.dayNap && (b.t === "nap" || b.t === "sleep")) extra += prop("Nap note", b.dayNap);
    if (b.flightLabel) {
      const fl = (data.flights || []).find((f) => f.label === b.flightLabel);
      extra += prop("Flight", b.flightLabel);
      if (fl) extra += prop("In-flight plan", fl.detail);
    }
    els.sheetContent.innerHTML = `
      <h2 style="display:flex;align-items:center;gap:8px">
        <span class="legend-swatch" style="background:${meta.color};width:14px;height:14px;border-radius:4px"></span>
        ${escapeHtml(meta.label)}
      </h2>
      <div class="meta">${escapeHtml(b.dayTitle)}</div>
      <div class="body">${escapeHtml(b.note || b.dayTip || b.focus || "")}</div>
      <dl class="props">
        ${prop("Focus", b.focus)}
        ${prop("Do this", b.dayTip)}
        ${prop("Origin (SGT)", startS + " → " + endS)}
        ${prop("Local (" + b.localAbbr + ")", startL + " → " + endL)}
        ${prop("Est. CBTmin", b.dayCbt)}
        ${extra}
      </dl>
    `;
    els.sheet.classList.add("open");
    els.sheetBd.classList.add("open");
  }

  function prop(k, v) {
    if (!v) return "";
    return `<div class="prop"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`;
  }

  function closeSheet() {
    els.sheet.classList.remove("open");
    els.sheetBd.classList.remove("open");
  }

  // —— Info panel ——
  function openPanel() {
    const flights = (data.flights || [])
      .map((f) => `<li><strong>${escapeHtml(f.label)}</strong> — ${escapeHtml(f.detail)}</li>`)
      .join("");
    const training = (data.training || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("");
    const s = data.strategy || {};
    document.getElementById("panel-body").innerHTML = `
      <h2>${escapeHtml(trip.name)}</h2>
      <p><strong>${escapeHtml(s.headline || "")}</strong> — ${escapeHtml(s.summary || "")}</p>
      <h3>Traveller</h3>
      <p>${escapeHtml(data.traveller)} · Baseline ${escapeHtml(s.baseline || "")} · CBTmin ${escapeHtml(s.cbtmin || "")}</p>
      <p>Melatonin: ${escapeHtml(s.melatonin || "")}<br>Caffeine: ${escapeHtml(s.caffeineCutoff || "")}<br>Hotels: ${escapeHtml(s.hotels || "")}</p>
      <h3>In-flight sleep</h3>
      <ul>${flights}</ul>
      <h3>Training adjustments</h3>
      <ul>${training}</ul>
      <h3>Notifications</h3>
      <p>Local reminders (~15 min before key actions) when permission is granted. Uses Notification Triggers (<code>TimestampTrigger</code>) if your browser supports them; otherwise timers via the service worker while the app is open or backgrounded. <strong>True reliable push when the app is fully closed needs a push server — this app does not use one.</strong></p>
      <div class="footer-note">${escapeHtml(data.disclaimer)}</div>
    `;
    els.panel.classList.add("open");
  }

  function closePanel() {
    els.panel.classList.remove("open");
  }

  // —— Notifications button ——
  async function toggleNotifs() {
    if (!window.JetLagNotifs.supportsNotifications()) {
      alert("Notifications are not supported in this browser.");
      return;
    }
    if (window.JetLagNotifs.isEnabled()) {
      window.JetLagNotifs.disable();
      syncNotifBtn();
      return;
    }
    const res = await window.JetLagNotifs.enable(abs.blocks);
    syncNotifBtn();
    if (!res.ok) {
      alert("Notification permission not granted (" + res.perm + ").");
      return;
    }
    const trigger = res.supportsTrigger ? "TimestampTrigger available" : "timers + service worker only";
    alert("Scheduled " + res.scheduled + " reminders (" + res.mode + "). " + trigger + ".");
  }

  function syncNotifBtn() {
    const on = window.JetLagNotifs.isEnabled();
    els.notifBtn.querySelector(".dot").classList.toggle("off", !on);
    els.notifBtn.setAttribute("aria-pressed", on ? "true" : "false");
    els.notifBtn.title = on ? "Reminders on — tap to disable" : "Enable local reminders";
  }

  // —— Events ——
  els.fab.addEventListener("click", () => scrollToNow(true));
  els.sheetBd.addEventListener("click", closeSheet);
  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  els.infoBtn.addEventListener("click", openPanel);
  document.getElementById("panel-close").addEventListener("click", closePanel);
  els.notifBtn.addEventListener("click", toggleNotifs);

  // SW register
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW failed", e));
  }

  // Boot
  renderLegend();
  render();
  syncNotifBtn();
  // Auto-scroll to now after layout
  requestAnimationFrame(() => {
    scrollToNow(false);
    setTimeout(() => scrollToNow(false), 100);
  });
  setInterval(updateNow, 30000);

  // Reschedule on visibility if enabled
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && window.JetLagNotifs.isEnabled()) {
      window.JetLagNotifs.scheduleAll(abs.blocks);
      updateNow();
    }
  });

  // Expose for debug
  window.__jetlag = { abs, trip, scrollToNow, yOf };
})();
