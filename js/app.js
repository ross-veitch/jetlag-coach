(function () {
  const data = window.JETLAG_DATA;
  const trip = data.trips[0];

  const CITIES = [
    { id: "singapore", name: "Singapore", abbr: "SGT", tz: "Asia/Singapore", code: "SIN" },
    { id: "dubai", name: "Dubai", abbr: "GST", tz: "Asia/Dubai", code: "DXB" },
    { id: "miami", name: "Miami", abbr: "EST", tz: "America/New_York", code: "MIA" },
  ];

  const LS_LEFT = "jetlag-tz-left";
  const LS_RIGHT = "jetlag-tz-right";

  // Simulated now via ?now=ISO (for testing); else real clock
  function parseSimNow() {
    const q = new URLSearchParams(location.search).get("now");
    if (!q) return null;
    const t = Date.parse(q);
    return Number.isFinite(t) ? t : null;
  }
  let simNow = parseSimNow();
  function nowMs() {
    return simNow != null ? simNow : Date.now();
  }

  function cityById(id) {
    return CITIES.find((c) => c.id === id) || CITIES[0];
  }

  function itineraryZoneAt(ms) {
    const segs = trip.zoneSegments;
    let cur = segs[0];
    for (const s of segs) {
      if (ms >= Date.parse(s.from)) cur = s;
    }
    // map segment to city
    const byTz = CITIES.find((c) => c.tz === cur.tz);
    return {
      id: byTz ? byTz.id : "auto",
      name: cur.label,
      abbr: cur.abbr,
      tz: cur.tz,
      place: cur.label,
    };
  }

  function resolveSide(side, ms) {
    if (side === "auto") return itineraryZoneAt(ms);
    return cityById(side);
  }

  let leftChoice = localStorage.getItem(LS_LEFT) || "singapore";
  let rightChoice = localStorage.getItem(LS_RIGHT) || "auto";
  if (!CITIES.some((c) => c.id === leftChoice)) leftChoice = "singapore";
  if (rightChoice !== "auto" && !CITIES.some((c) => c.id === rightChoice)) rightChoice = "auto";

  function localHourToMs(day, hourFloat) {
    const h = Math.floor(hourFloat);
    let m = Math.round((hourFloat - h) * 60);
    let hh = h;
    let carry = 0;
    if (m === 60) { m = 0; hh += 1; }
    if (hh >= 24) { carry = Math.floor(hh / 24); hh = hh % 24; }
    const utcOffHours = 8 - day.off;
    const sign = utcOffHours >= 0 ? "+" : "-";
    const absOff = Math.abs(utcOffHours);
    const offStr = sign + String(Math.floor(absOff)).padStart(2, "0") + ":00";
    const d = new Date(day.date + "T00:00:00" + offStr);
    d.setTime(d.getTime() + carry * 86400000 + hh * 3600000 + m * 60000);
    return d.getTime();
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
    return Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  }

  function hourLabel(ms, timeZone) {
    const p = partsInTz(ms, timeZone);
    return p.hour + ":" + p.minute;
  }

  function dayLabel(ms, timeZone) {
    const p = partsInTz(ms, timeZone);
    return p.weekday + " " + p.day + " " + p.month;
  }

  function fmtDur(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    if (m === 0) return h + "h";
    return h + "h " + String(m).padStart(2, "0") + "m";
  }

  function parseRoute(label) {
    // "EK315 SIN→DXB" → { id: EK315, from: SIN, to: DXB }
    const m = /^(\S+)\s+(\S+)→(\S+)/.exec(label || "");
    if (!m) return { id: label || "Flight", from: "", to: "" };
    return { id: m[1], from: m[2], to: m[3] };
  }

  function buildAbsolute(trip) {
    const blocks = [];
    let idSeq = 0;
    for (const day of trip.days) {
      for (const b of day.blocks) {
        if (b.t === "flight") continue; // flights rendered from data.flights
        if (b.t === "awake") continue;
        const startMs = localHourToMs(day, b.a);
        const endMs = localHourToMs(day, b.b);
        if (endMs <= startMs) continue;
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
        });
      }
    }

    const flights = (data.flights || []).map((f, i) => {
      const startMs = Date.parse(f.dep);
      const endMs = Date.parse(f.arr);
      const route = parseRoute(f.label);
      // find overlapping tip from a day that mentions this flight
      const dayHit = trip.days.find((d) => (d.tip || "").includes(route.id) || (d.title || "").includes(route.id));
      return {
        id: "f" + (i + 1),
        t: "flight",
        startMs,
        endMs,
        flightId: route.id,
        from: route.from,
        to: route.to,
        label: f.label,
        detail: f.detail,
        dayTitle: dayHit ? dayHit.title : f.label,
        focus: dayHit ? dayHit.focus : "",
        dayTip: dayHit ? dayHit.tip : f.detail,
        dayMel: dayHit ? dayHit.mel : "",
        dayCbt: dayHit ? dayHit.cbt : "",
        note: f.detail,
      };
    });

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

    return { blocks, flights, startMs, endMs, zoneMarkers };
  }

  const abs = buildAbsolute(trip);

  const PX = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--px-per-hour")) || 48;

  function yOf(ms) {
    return ((ms - abs.startMs) / 3600000) * PX();
  }

  const els = {
    scroll: document.getElementById("timeline-scroll"),
    timeline: document.getElementById("timeline"),
    body: document.getElementById("timeline-body"),
    lhs: document.getElementById("axis-lhs"),
    rhs: document.getElementById("axis-rhs"),
    spine: document.getElementById("spine"),
    legend: document.getElementById("legend"),
    nowLine: document.getElementById("now-line"),
    nowBadge: document.getElementById("now-badge"),
    fab: document.getElementById("fab-now"),
    sheet: document.getElementById("sheet"),
    sheetBd: document.getElementById("sheet-backdrop"),
    sheetContent: document.getElementById("sheet-content"),
    panel: document.getElementById("panel"),
    notifBtn: document.getElementById("btn-notif"),
    infoBtn: document.getElementById("btn-info"),
    banner: document.getElementById("out-banner"),
    lhsHead: document.getElementById("lhs-head"),
    rhsHead: document.getElementById("rhs-head"),
    tzLeft: document.getElementById("tz-left"),
    tzRight: document.getElementById("tz-right"),
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function blockIcon(type) {
    const map = {
      seek: "☀️",
      avoid: "🕶️",
      sleep: "😴",
      nap: "💤",
      caff: "☕",
      ncaff: "🚫☕",
      mel: "💊",
      meal: "🍽",
      flight: "✈",
    };
    return map[type] || "•";
  }

  function fillTzSelects() {
    const leftOpts = CITIES.map(
      (c) => `<option value="${c.id}">${c.name} (${c.abbr})</option>`
    ).join("");
    const rightOpts =
      `<option value="auto">Current location (auto)</option>` + leftOpts;
    els.tzLeft.innerHTML = leftOpts;
    els.tzRight.innerHTML = rightOpts;
    els.tzLeft.value = leftChoice;
    els.tzRight.value = rightChoice;
  }

  function updateHeadLabels() {
    const n = nowMs();
    const L = resolveSide(leftChoice, n);
    const R = resolveSide(rightChoice, n);
    els.lhsHead.textContent = L.abbr;
    els.lhsHead.title = L.name + " (" + L.abbr + ")";
    if (rightChoice === "auto") {
      els.rhsHead.textContent = R.abbr;
      els.rhsHead.title = "Auto · current location: " + R.name + " (" + R.abbr + ")";
    } else {
      els.rhsHead.textContent = R.abbr;
      els.rhsHead.title = R.name + " (" + R.abbr + ")";
    }
  }

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

  function clearSpineKeepGuides() {
    const guides = els.spine.querySelector(".lane-guides");
    els.spine.innerHTML = "";
    if (guides) els.spine.appendChild(guides);
    else {
      const g = document.createElement("div");
      g.className = "lane-guides";
      g.setAttribute("aria-hidden", "true");
      g.innerHTML = '<div class="lg sleep"></div><div class="lg light"></div><div class="lg marks"></div>';
      els.spine.appendChild(g);
    }
    els.lhs.innerHTML = "";
    els.rhs.innerHTML = "";
  }

  function flightCovers(msStart, msEnd) {
    return abs.flights.some((f) => msStart < f.endMs && msEnd > f.startMs);
  }

  function render() {
    const height = yOf(abs.endMs);
    els.timeline.style.height = height + "px";
    els.body.style.height = height + "px";
    els.spine.style.height = height + "px";
    els.lhs.style.height = height + "px";
    els.rhs.style.height = height + "px";

    clearSpineKeepGuides();

    // Airport zone by IATA for canonical dep/arr locals
    const airportTz = { SIN: "Asia/Singapore", DXB: "Asia/Dubai", MIA: "America/New_York" };
    const airportAbbr = { SIN: "SGT", DXB: "GST", MIA: "EST" };

    // Flights first (full-width bands)
    for (const f of abs.flights) {
      const top = yOf(f.startMs);
      const h = Math.max(yOf(f.endMs) - top, 72);
      const leftDep = resolveSide(leftChoice, f.startMs);
      const leftArr = resolveSide(leftChoice, f.endMs);
      const rightDep = resolveSide(rightChoice, f.startMs);
      const rightArr = resolveSide(rightChoice, f.endMs);
      const depAirport = hourLabel(f.startMs, airportTz[f.from] || leftDep.tz) + " " + (airportAbbr[f.from] || "");
      const arrAirport = hourLabel(f.endMs, airportTz[f.to] || rightArr.tz) + " " + (airportAbbr[f.to] || "");
      const depL = hourLabel(f.startMs, leftDep.tz) + " " + leftDep.abbr;
      const depR = hourLabel(f.startMs, rightDep.tz) + " " + rightDep.abbr;
      const arrL = hourLabel(f.endMs, leftArr.tz) + " " + leftArr.abbr;
      const arrR = hourLabel(f.endMs, rightArr.tz) + " " + rightArr.abbr;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "flight-band";
      el.style.top = top + "px";
      el.style.height = h + "px";
      el.dataset.id = f.id;
      el.innerHTML = `
        <div class="fb-head">
          <div class="fb-title">
            <span class="fb-plane" aria-hidden="true">✈</span>
            <span class="fb-num">${escapeHtml(f.flightId)}</span>
            <span class="fb-route">${escapeHtml(f.from)}→${escapeHtml(f.to)}</span>
            <span class="fb-dur">${escapeHtml(fmtDur(f.endMs - f.startMs))}</span>
          </div>
          <div class="fb-times">
            <div><strong>Dep ${escapeHtml(f.from)}</strong> ${escapeHtml(depAirport)}</div>
            <div class="fb-cols">${escapeHtml(depL)} · ${escapeHtml(depR)}</div>
            <div><strong>Arr ${escapeHtml(f.to)}</strong> ${escapeHtml(arrAirport)}</div>
            <div class="fb-cols">${escapeHtml(arrL)} · ${escapeHtml(arrR)}</div>
          </div>
        </div>
        <div class="fb-body">
          <div class="fb-hint">${escapeHtml((f.detail || "").slice(0, 120))}${(f.detail || "").length > 120 ? "…" : ""}</div>
        </div>`;
      el.addEventListener("click", () => openDetail(f));
      els.spine.appendChild(el);
    }

    // Plan blocks by lane
    const laneClass = {
      sleep: "lane-sleep",
      nap: "lane-nap",
      seek: "lane-seek",
      avoid: "lane-avoid",
      caff: "lane-caff",
      ncaff: "lane-ncaff",
      mel: "lane-mel marker",
      meal: "lane-meal marker",
    };

    for (const b of abs.blocks) {
      const top = yOf(b.startMs);
      let h = Math.max(yOf(b.endMs) - top, b.t === "mel" || b.t === "meal" ? 28 : 16);
      if (b.t === "mel" || b.t === "meal") h = Math.max(h, 28);

      const meta = data.blockTypes[b.t] || { label: b.t, short: b.t };
      const el = document.createElement("button");
      el.type = "button";
      const onFlight = flightCovers(b.startMs, b.endMs) && (b.t === "sleep" || b.t === "nap");
      el.className = "block " + (laneClass[b.t] || "") + (onFlight ? " on-flight" : "");
      el.style.top = top + "px";
      if (b.t !== "mel" && b.t !== "meal") el.style.height = h + "px";
      else el.style.top = top + "px";
      el.dataset.id = b.id;

      let lbl = meta.short || meta.label;
      let sub = "";
      const ico = `<span class="ico" aria-hidden="true">${blockIcon(b.t)}</span>`;
      if (b.t === "mel") {
        el.innerHTML = ico + `<span class="lbl">Mel</span>`;
      } else if (b.t === "meal") {
        el.innerHTML = ico + `<span class="lbl">Meal</span>`;
      } else if (b.t === "caff" || b.t === "ncaff") {
        el.innerHTML = ico + `<span class="lbl">${escapeHtml(b.t === "caff" ? "OK" : "Off")}</span>`;
      } else {
        const durH = (b.endMs - b.startMs) / 3600000;
        if (b.note) sub = b.note;
        else if (durH >= 1) sub = (Math.round(durH * 10) / 10) + "h";
        el.innerHTML =
          ico +
          `<span class="lbl">${escapeHtml(lbl)}</span>` +
          (sub && h >= 40 ? `<span class="sub">${escapeHtml(sub)}</span>` : "");
      }
      el.addEventListener("click", () => openDetail(b));
      els.spine.appendChild(el);
    }

    // Nudge mel/meal markers that would stack on top of each other
    const markers = [...els.spine.querySelectorAll(".block.marker")].sort(
      (a, b) => parseFloat(a.style.top) - parseFloat(b.style.top)
    );
    let lastBottom = -Infinity;
    for (const m of markers) {
      let top = parseFloat(m.style.top) || 0;
      if (top < lastBottom + 4) top = lastBottom + 4;
      m.style.top = top + "px";
      lastBottom = top + Math.max(m.offsetHeight || 34, 34);
    }

    // Day markers + ticks every 2h on left-zone hour boundaries
    const step = 15 * 60 * 1000;
    for (let ms = abs.startMs; ms <= abs.endMs + 1; ms += step) {
      const L = resolveSide(leftChoice, ms);
      const R = resolveSide(rightChoice, ms);
      const lp = partsInTz(ms, L.tz);
      const minute = parseInt(lp.minute, 10);
      if (minute !== 0) continue;
      const hour = parseInt(lp.hour, 10);
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
        dl.textContent = dayLabel(ms, L.tz);
        els.spine.appendChild(dl);
      }

      // hairline every hour (Timeshifter-style)
      const hl = document.createElement("div");
      hl.className = "hour-line";
      hl.style.top = y + "px";
      els.spine.appendChild(hl);

      if (hour % 2 === 0 || isMidnight) {
        const lhsTick = document.createElement("div");
        lhsTick.className = "tick" + (isMidnight ? " major" : "");
        lhsTick.style.top = y + "px";
        lhsTick.innerHTML =
          (isMidnight ? `<span class="day">${escapeHtml(dayLabel(ms, L.tz))}</span>` : "") +
          `<span class="time">${lp.hour}:${lp.minute}</span>`;
        els.lhs.appendChild(lhsTick);

        const rp = partsInTz(ms, R.tz);
        const rhsTick = document.createElement("div");
        const showDay = rp.hour === "00" || isMidnight;
        rhsTick.className = "tick" + (showDay ? " major" : "");
        rhsTick.style.top = y + "px";
        rhsTick.innerHTML =
          (showDay ? `<span class="day">${escapeHtml(dayLabel(ms, R.tz))}</span>` : "") +
          `<span class="time">${rp.hour}:${rp.minute}</span>`;
        els.rhs.appendChild(rhsTick);
      }
    }

    for (const z of abs.zoneMarkers) {
      if (z.ms < abs.startMs || z.ms > abs.endMs) continue;
      const el = document.createElement("div");
      el.className = "zone-marker";
      el.style.top = yOf(z.ms) + "px";
      el.innerHTML = `<span>🕐 ${escapeHtml(z.label.replace("Zone → ", ""))}</span>`;
      els.spine.appendChild(el);
    }

    updateHeadLabels();
    updateNow();
  }

  function updateNow() {
    const now = nowMs();
    const L = resolveSide(leftChoice, now);
    const R = resolveSide(rightChoice, now);
    updateHeadLabels();

    const inWindow = now >= abs.startMs && now <= abs.endMs;
    els.nowLine.hidden = false;
    // Clamp visually to timeline range for the line position
    const clampMs = Math.min(Math.max(now, abs.startMs), abs.endMs);
    els.nowLine.style.top = yOf(clampMs) + "px";
    const tL = hourLabel(now, L.tz) + " " + L.abbr;
    const tR = hourLabel(now, R.tz) + " " + R.abbr;
    els.nowBadge.textContent = inWindow ? "NOW · " + tL : "NOW · " + tL + " (off-plan)";

    if (!inWindow) {
      els.banner.hidden = false;
      els.banner.textContent =
        now < abs.startMs
          ? "Trip starts " + dayLabel(abs.startMs, "Asia/Singapore") + " (SGT) · jump still works"
          : "Trip window ended · jump still works";
    } else {
      els.banner.hidden = true;
    }
  }

  function scrollToNow(smooth) {
    const now = nowMs();
    const targetMs = Math.min(Math.max(now, abs.startMs), abs.endMs);
    const y = yOf(targetMs) - els.scroll.clientHeight * 0.35;
    els.scroll.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
  }

  function prop(k, v) {
    if (!v) return "";
    return `<div class="prop"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`;
  }

  function openDetail(b) {
    const meta = data.blockTypes[b.t] || { label: b.t, color: "#888" };
    const L = resolveSide(leftChoice, b.startMs);
    const R = resolveSide(rightChoice, b.startMs);
    let title = meta.label;
    let extra = "";
    if (b.t === "flight") {
      title = "✈ " + (b.flightId || "Flight") + " " + (b.from || "") + "→" + (b.to || "");
      extra += prop("Duration", fmtDur(b.endMs - b.startMs));
      extra += prop("In-flight plan", b.detail || b.note);
    }
    if (b.t === "mel") extra += prop("Melatonin", b.dayMel || meta.label);
    if (b.dayNap && (b.t === "nap" || b.t === "sleep")) extra += prop("Nap note", b.dayNap);

    els.sheetContent.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      <div class="meta">${escapeHtml(b.dayTitle || "")}</div>
      <div class="body">${escapeHtml(b.note || b.dayTip || b.focus || "")}</div>
      <dl class="props">
        ${prop("Focus", b.focus)}
        ${prop("Do this", b.dayTip)}
        ${prop(L.name + " (" + L.abbr + ")", dayLabel(b.startMs, L.tz) + " " + hourLabel(b.startMs, L.tz) + " → " + hourLabel(b.endMs, L.tz))}
        ${prop(R.name + " (" + R.abbr + ")", dayLabel(b.startMs, R.tz) + " " + hourLabel(b.startMs, R.tz) + " → " + hourLabel(b.endMs, R.tz))}
        ${prop("Est. CBTmin", b.dayCbt)}
        ${extra}
      </dl>`;
    els.sheet.classList.add("open");
    els.sheetBd.classList.add("open");
  }

  function closeSheet() {
    els.sheet.classList.remove("open");
    els.sheetBd.classList.remove("open");
  }

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
      <p>Local reminders (~15 min before key actions) when permission is granted. Uses Notification Triggers if available; otherwise timers via the service worker while the app is open or backgrounded. <strong>True reliable push when fully closed needs a push server — not used here.</strong></p>
      <div class="footer-note">${escapeHtml(data.disclaimer)}</div>`;
    els.panel.classList.add("open");
  }

  function closePanel() {
    els.panel.classList.remove("open");
  }

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
    const all = abs.blocks.concat(abs.flights);
    const res = await window.JetLagNotifs.enable(all);
    syncNotifBtn();
    if (!res.ok) {
      alert("Notification permission not granted (" + res.perm + ").");
      return;
    }
    alert("Scheduled " + res.scheduled + " reminders (" + res.mode + ").");
  }

  function syncNotifBtn() {
    const on = window.JetLagNotifs.isEnabled();
    els.notifBtn.querySelector(".dot").classList.toggle("off", !on);
    els.notifBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function onTzChange() {
    leftChoice = els.tzLeft.value;
    rightChoice = els.tzRight.value;
    localStorage.setItem(LS_LEFT, leftChoice);
    localStorage.setItem(LS_RIGHT, rightChoice);
    render();
    scrollToNow(false);
  }

  els.fab.addEventListener("click", () => scrollToNow(true));
  els.sheetBd.addEventListener("click", closeSheet);
  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  els.infoBtn.addEventListener("click", openPanel);
  document.getElementById("panel-close").addEventListener("click", closePanel);
  els.notifBtn.addEventListener("click", toggleNotifs);
  els.tzLeft.addEventListener("change", onTzChange);
  els.tzRight.addEventListener("change", onTzChange);

  // Service worker + update-on-reload
  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      // Check for updates when app opens
      try { reg.update(); } catch (_) {}
      setInterval(() => { try { reg.update(); } catch (_) {} }, 60 * 60 * 1000);
    }).catch((e) => console.warn("SW failed", e));
  }

  fillTzSelects();
  renderLegend();
  render();
  syncNotifBtn();
  requestAnimationFrame(() => {
    scrollToNow(false);
    setTimeout(() => scrollToNow(false), 120);
  });
  setInterval(updateNow, 60_000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateNow();
      if (window.JetLagNotifs.isEnabled()) {
        window.JetLagNotifs.scheduleAll(abs.blocks.concat(abs.flights));
      }
    }
  });

  window.__jetlag = { abs, trip, scrollToNow, yOf, nowMs, setSimNow: (iso) => { simNow = Date.parse(iso); updateNow(); } };
})();
