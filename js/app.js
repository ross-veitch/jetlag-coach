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
  const CARD_GAP = 12;

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
    const m = /^(\S+)\s+(\S+)→(\S+)/.exec(label || "");
    if (!m) return { id: label || "Flight", from: "", to: "" };
    return { id: m[1], from: m[2], to: m[3] };
  }

  function buildAbsolute(trip) {
    const blocks = [];
    let idSeq = 0;
    for (const day of trip.days) {
      for (const b of day.blocks) {
        if (b.t === "flight" || b.t === "awake") continue;
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
      const dayHit = trip.days.find(
        (d) => (d.tip || "").includes(route.id) || (d.title || "").includes(route.id)
      );
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
      label: z.label,
      abbr: z.abbr,
      tz: z.tz,
      place: z.label,
    }));

    return { blocks, flights, startMs, endMs, zoneMarkers };
  }

  const abs = buildAbsolute(trip);

  const PX = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--px-per-hour")) || 56;

  /** Linear (unstretched) y — only used as natural target before packing */
  function naturalY(ms) {
    return ((ms - abs.startMs) / 3600000) * PX();
  }

  /** Anchors for time→layout Y warp, filled by render() */
  let layoutAnchors = []; // { ms, y }
  let layoutHeight = 0;

  function yAt(ms) {
    if (!layoutAnchors.length) return naturalY(ms);
    if (ms <= layoutAnchors[0].ms) {
      return layoutAnchors[0].y + ((ms - layoutAnchors[0].ms) / 3600000) * PX();
    }
    for (let i = 0; i < layoutAnchors.length - 1; i++) {
      const a = layoutAnchors[i];
      const b = layoutAnchors[i + 1];
      if (ms <= b.ms) {
        if (b.ms === a.ms) return a.y;
        const t = (ms - a.ms) / (b.ms - a.ms);
        return a.y + t * (b.y - a.y);
      }
    }
    const last = layoutAnchors[layoutAnchors.length - 1];
    return last.y + ((ms - last.ms) / 3600000) * PX();
  }

  const els = {
    scroll: document.getElementById("timeline-scroll"),
    timeline: document.getElementById("timeline"),
    body: document.getElementById("timeline-body"),
    lhs: document.getElementById("axis-lhs"),
    rhs: document.getElementById("axis-rhs"),
    rail: document.getElementById("rail"),
    spine: document.getElementById("spine"),
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
    upNextList: document.getElementById("up-next-list"),
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
      day: "📅",
      zone: "🕐",
    };
    return map[type] || "•";
  }

  function mealName(b) {
    const tz = b.localTz || resolveSide(leftChoice, b.startMs).tz;
    const hour = parseInt(partsInTz(b.startMs, tz).hour, 10);
    if (hour < 11) return "Breakfast";
    if (hour < 15) return "Lunch";
    if (hour < 17) return "Afternoon snack";
    return "Dinner";
  }

  function melTitle(b) {
    const m = (b.dayMel || "").trim();
    if (!m || /^none/i.test(m)) return "Melatonin — skip today";
    const dose = m.match(/(\d+(?:\.\d+)?\s*–\s*\d+(?:\.\d+)?\s*mg|\d+(?:\.\d+)?\s*mg)/i);
    if (dose) return "Take melatonin " + dose[1].replace(/\s+/g, " ");
    if (/optional/i.test(m)) return "Optional melatonin";
    return "Take melatonin";
  }

  function plainTitle(b) {
    switch (b.t) {
      case "seek": return "Get bright light";
      case "avoid": return "Wear sunglasses";
      case "sleep": return "Sleep";
      case "nap": return "Take a nap";
      case "caff": return "Coffee is OK now";
      case "ncaff": return "Last coffee — stop caffeine";
      case "mel": return melTitle(b);
      case "meal": return mealName(b);
      case "flight":
        return (b.flightId || "Flight") + " " + (b.from || "") + " → " + (b.to || "");
      default:
        return (data.blockTypes[b.t] || {}).label || b.t;
    }
  }

  function rangeText(b) {
    const L = resolveSide(leftChoice, b.startMs);
    const R = resolveSide(rightChoice, b.startMs);
    const L2 = resolveSide(leftChoice, b.endMs);
    const R2 = resolveSide(rightChoice, b.endMs);
    const instant = b.endMs - b.startMs < 25 * 60000 || b.t === "mel" || b.t === "meal";
    const left = instant
      ? hourLabel(b.startMs, L.tz) + " " + L.abbr
      : hourLabel(b.startMs, L.tz) + "–" + hourLabel(b.endMs, L2.tz) + " " + L.abbr;
    const right = instant
      ? hourLabel(b.startMs, R.tz) + " " + R.abbr
      : hourLabel(b.startMs, R.tz) + "–" + hourLabel(b.endMs, R2.tz) + " " + R.abbr;
    if (L.tz === R.tz && L2.tz === R2.tz) return left;
    return left + " · " + right;
  }

  function fillTzSelects() {
    const leftOpts = CITIES.map(
      (c) => `<option value="${c.id}">${c.name} (${c.abbr})</option>`
    ).join("");
    const rightOpts = `<option value="auto">Current location (auto)</option>` + leftOpts;
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
    els.lhsHead.parentElement.title = "Left: " + L.name + " (" + L.abbr + ") — tap to change";
    els.rhsHead.textContent = R.abbr;
    els.rhsHead.parentElement.title =
      (rightChoice === "auto" ? "Auto · " : "") + R.name + " (" + R.abbr + ") — tap to change";
  }

  function clearLayers() {
    els.spine.innerHTML = "";
    els.rail.innerHTML = "";
    els.lhs.innerHTML = "";
    els.rhs.innerHTML = "";
  }

  /** Build sorted text-bearing flow items for the whole trip */
  function buildFlowItems() {
    const items = [];

    // Day dividers on left-zone midnights
    const step = 15 * 60 * 1000;
    for (let ms = abs.startMs; ms <= abs.endMs; ms += step) {
      const L = resolveSide(leftChoice, ms);
      const lp = partsInTz(ms, L.tz);
      if (parseInt(lp.minute, 10) !== 0) continue;
      if (parseInt(lp.hour, 10) !== 0) continue;
      if (ms === abs.startMs) {
        // still show trip start day
      }
      items.push({
        kind: "day",
        ms,
        endMs: ms,
        id: "day-" + ms,
        title: dayLabel(ms, L.tz),
      });
    }

    for (const z of abs.zoneMarkers) {
      if (z.ms < abs.startMs || z.ms > abs.endMs) continue;
      items.push({
        kind: "zone",
        ms: z.ms,
        endMs: z.ms,
        id: "zone-" + z.ms,
        title: "Now on " + z.place + " time (" + z.abbr + ")",
        zone: z,
      });
    }

    for (const b of abs.blocks) {
      if (b.t === "caff") continue; // use ncaff card instead
      items.push({
        kind: "card",
        ms: b.startMs,
        endMs: b.endMs,
        id: b.id,
        block: b,
        title: plainTitle(b),
      });
    }

    for (const f of abs.flights) {
      items.push({
        kind: "flight",
        ms: f.startMs,
        endMs: f.endMs,
        id: f.id,
        block: f,
        title: plainTitle(f),
      });
    }

    const kindOrder = { day: 0, zone: 1, flight: 2, card: 3 };
    items.sort(
      (a, b) =>
        a.ms - b.ms ||
        (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9) ||
        String(a.id).localeCompare(b.id)
    );
    return items;
  }

  function renderFlowElement(item) {
    if (item.kind === "day") {
      const el = document.createElement("div");
      el.className = "flow-item day-row text-el";
      el.dataset.id = item.id;
      el.textContent = item.title;
      return el;
    }
    if (item.kind === "zone") {
      const el = document.createElement("div");
      el.className = "flow-item zone-row text-el";
      el.dataset.id = item.id;
      el.textContent = item.title;
      return el;
    }
    if (item.kind === "flight") {
      const f = item.block;
      const airportTz = { SIN: "Asia/Singapore", DXB: "Asia/Dubai", MIA: "America/New_York" };
      const airportAbbr = { SIN: "SGT", DXB: "GST", MIA: "EST" };
      const depAirport =
        hourLabel(f.startMs, airportTz[f.from] || "UTC") + " " + (airportAbbr[f.from] || "");
      const arrAirport =
        hourLabel(f.endMs, airportTz[f.to] || "UTC") + " " + (airportAbbr[f.to] || "");
      const el = document.createElement("button");
      el.type = "button";
      el.className = "flow-item flight-card text-el";
      el.dataset.id = f.id;
      el.innerHTML =
        `<span class="ico" aria-hidden="true">✈</span>` +
        `<span class="copy">` +
        `<div class="title">${escapeHtml(f.flightId)} ${escapeHtml(f.from)} → ${escapeHtml(f.to)}` +
        `<span class="fb-dur">${escapeHtml(fmtDur(f.endMs - f.startMs))}</span></div>` +
        `<div class="times">Departs ${escapeHtml(f.from)} ${escapeHtml(depAirport)} · Arrives ${escapeHtml(f.to)} ${escapeHtml(arrAirport)}</div>` +
        `<div class="times">${escapeHtml(rangeText(f))}</div>` +
        `<div class="detail">${escapeHtml(f.detail || "")}</div>` +
        `</span>`;
      el.addEventListener("click", () => openDetail(f));
      return el;
    }
    // advice card
    const b = item.block;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "flow-item advice-card type-" + b.t + " text-el";
    el.dataset.id = b.id;
    const title =
      b.t === "seek" || b.t === "avoid" || b.t === "sleep" || b.t === "nap"
        ? plainTitle(b)
        : plainTitle(b);
    el.innerHTML =
      `<span class="ico" aria-hidden="true">${blockIcon(b.t)}</span>` +
      `<span class="copy"><div class="title">${escapeHtml(title)}</div>` +
      `<div class="times">${escapeHtml(rangeText(b))}</div></span>`;
    el.addEventListener("click", () => openDetail(b));
    return el;
  }

  function renderUpNext() {
    const now = nowMs();
    const horizon = now - 10 * 60000;
    const prefer = new Set(["mel", "meal", "ncaff", "nap", "seek", "avoid", "sleep"]);
    const candidates = abs.blocks
      .filter((b) => b.endMs >= horizon && b.t !== "caff")
      .sort((a, c) => a.startMs - c.startMs);

    const upcoming = [];
    for (const b of candidates) {
      if (upcoming.length >= 2) break;
      if (b.startMs < now - 5 * 60000 && (b.t === "sleep" || b.t === "seek" || b.t === "avoid")) continue;
      if (!prefer.has(b.t)) continue;
      upcoming.push(b);
    }
    if (!upcoming.length) {
      for (const b of candidates) {
        if (upcoming.length >= 2) break;
        upcoming.push(b);
      }
    }
    const nextFlight = abs.flights.find((f) => f.startMs >= now - 30 * 60000 && f.endMs >= now);
    if (nextFlight && nextFlight.startMs - now < 8 * 3600000) {
      if (!upcoming.some((u) => u.id === nextFlight.id)) {
        upcoming.unshift(nextFlight);
        if (upcoming.length > 2) upcoming.length = 2;
      }
    }

    const label = document.querySelector(".up-next-label");
    if (label && !label.dataset.ready) {
      label.dataset.ready = "1";
      label.innerHTML =
        'Up next <button type="button" id="up-next-toggle" aria-expanded="true">Hide</button>';
      document.getElementById("up-next-toggle").addEventListener("click", (e) => {
        e.stopPropagation();
        const box = document.getElementById("up-next");
        const collapsed = box.classList.toggle("collapsed");
        e.currentTarget.textContent = collapsed ? "Show" : "Hide";
        e.currentTarget.setAttribute("aria-expanded", collapsed ? "false" : "true");
      });
    }

    if (!upcoming.length) {
      els.upNextList.innerHTML =
        `<li class="up-next-empty">No upcoming actions in the trip window.</li>`;
      return;
    }

    els.upNextList.innerHTML = "";
    for (const b of upcoming.slice(0, 2)) {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="ico" aria-hidden="true">${blockIcon(b.t)}</span>` +
        `<span class="body"><div class="title">${escapeHtml(plainTitle(b))}</div>` +
        `<div class="when">${escapeHtml(rangeText(b))}</div></span>`;
      li.addEventListener("click", () => {
        const y = yAt(b.startMs) - 80;
        els.scroll.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
        openDetail(b);
      });
      els.upNextList.appendChild(li);
    }
  }

  function render() {
    clearLayers();
    const items = buildFlowItems();

    // Create DOM nodes first (off-layout measure via temporary absolute)
    const nodes = items.map((item) => {
      const el = renderFlowElement(item);
      els.spine.appendChild(el);
      return { item, el };
    });

    // Force layout, measure heights, pack without overlap (timeline stretches)
    void els.spine.offsetHeight;
    let cursor = 8;
    layoutAnchors = [];
    for (const node of nodes) {
      const natural = naturalY(node.item.ms);
      const top = Math.max(natural, cursor);
      node.el.style.top = Math.round(top) + "px";
      const h = Math.max(node.el.getBoundingClientRect().height, node.item.kind === "flight" ? 88 : 36);
      node.layoutY = top;
      node.layoutH = h;
      layoutAnchors.push({ ms: node.item.ms, y: top });
      cursor = top + h + CARD_GAP;
    }

    // End anchor so rail/now can extend past last card
    layoutAnchors.push({ ms: abs.endMs, y: Math.max(cursor, naturalY(abs.endMs)) });
    layoutHeight = Math.max(cursor + 24, naturalY(abs.endMs) + 40);

    els.timeline.style.height = layoutHeight + "px";
    els.body.style.height = layoutHeight + "px";
    els.spine.style.height = layoutHeight + "px";
    els.rail.style.height = layoutHeight + "px";
    els.lhs.style.height = layoutHeight + "px";
    els.rhs.style.height = layoutHeight + "px";

    // Silent rail bars (no text)
    const railKinds = [
      ...abs.blocks.filter((b) => ["sleep", "nap", "seek", "avoid"].includes(b.t)),
      ...abs.flights,
    ];
    for (const b of railKinds) {
      const top = yAt(b.startMs);
      const bottom = yAt(b.endMs);
      const h = Math.max(bottom - top, 4);
      const bar = document.createElement("div");
      bar.className = "rail-bar " + b.t;
      bar.style.top = top + "px";
      bar.style.height = h + "px";
      els.rail.appendChild(bar);
    }

    // Gutter hour ticks (skip if they'd collide with previous tick)
    const step = 60 * 60 * 1000;
    let lastLhsY = -Infinity;
    let lastRhsY = -Infinity;
    for (let ms = abs.startMs; ms <= abs.endMs; ms += step) {
      const L = resolveSide(leftChoice, ms);
      const R = resolveSide(rightChoice, ms);
      const lp = partsInTz(ms, L.tz);
      // align to left-zone hour boundaries approximately via stepping 15m then filter
    }
    // More accurate: walk 15m, emit when left minute==0 and hour even
    for (let ms = abs.startMs; ms <= abs.endMs; ms += 15 * 60 * 1000) {
      const L = resolveSide(leftChoice, ms);
      const R = resolveSide(rightChoice, ms);
      const lp = partsInTz(ms, L.tz);
      if (parseInt(lp.minute, 10) !== 0) continue;
      const hour = parseInt(lp.hour, 10);
      if (hour % 2 !== 0 && hour !== 0) continue;
      const y = yAt(ms);
      if (y - lastLhsY >= 18) {
        const tick = document.createElement("div");
        tick.className = "tick" + (hour === 0 ? " major" : "");
        tick.style.top = y + "px";
        tick.innerHTML = `<span class="time">${lp.hour}:${lp.minute}</span>`;
        els.lhs.appendChild(tick);
        lastLhsY = y;
      }
      const rp = partsInTz(ms, R.tz);
      if (y - lastRhsY >= 18) {
        const tick = document.createElement("div");
        tick.className = "tick";
        tick.style.top = y + "px";
        tick.innerHTML = `<span class="time">${rp.hour}:${rp.minute}</span>`;
        els.rhs.appendChild(tick);
        lastRhsY = y;
      }
    }

    updateHeadLabels();
    updateNow();
    renderUpNext();
  }

  function updateNow() {
    const now = nowMs();
    const L = resolveSide(leftChoice, now);
    updateHeadLabels();

    const inWindow = now >= abs.startMs && now <= abs.endMs;
    els.nowLine.hidden = false;
    const clampMs = Math.min(Math.max(now, abs.startMs), abs.endMs);
    els.nowLine.style.top = yAt(clampMs) + "px";
    // Compact badge for gutter only
    els.nowBadge.textContent = "NOW\n" + hourLabel(now, L.tz);
    els.nowBadge.title = inWindow
      ? "Now · " + hourLabel(now, L.tz) + " " + L.abbr
      : "Now · " + hourLabel(now, L.tz) + " " + L.abbr + " (off-plan)";

    if (!inWindow) {
      els.banner.hidden = false;
      els.banner.textContent =
        now < abs.startMs
          ? "Trip starts " + dayLabel(abs.startMs, "Asia/Singapore") + " (SGT) · jump still works"
          : "Trip window ended · jump still works";
    } else {
      els.banner.hidden = true;
    }
    renderUpNext();
  }

  function scrollToNow(smooth) {
    const now = nowMs();
    const targetMs = Math.min(Math.max(now, abs.startMs), abs.endMs);
    const y = yAt(targetMs) - els.scroll.clientHeight * 0.35;
    els.scroll.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
  }

  function prop(k, v) {
    if (!v) return "";
    return `<div class="prop"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`;
  }

  function openDetail(b) {
    const L = resolveSide(leftChoice, b.startMs);
    const R = resolveSide(rightChoice, b.startMs);
    let title = plainTitle(b);
    let extra = "";
    if (b.t === "flight") {
      title = "✈ " + (b.flightId || "Flight") + " " + (b.from || "") + " → " + (b.to || "");
      extra += prop("Duration", fmtDur(b.endMs - b.startMs));
      extra += prop("In-flight plan", b.detail || b.note);
    }
    if (b.t === "mel") extra += prop("Dose note", b.dayMel || "");
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
      </dl>
      <p style="margin-top:16px;font-size:0.875rem;color:var(--text-dim)">${escapeHtml(data.disclaimer)}</p>`;
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

  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        try { reg.update(); } catch (_) {}
        setInterval(() => { try { reg.update(); } catch (_) {} }, 60 * 60 * 1000);
      })
      .catch((e) => console.warn("SW failed", e));
  }

  fillTzSelects();
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

  window.__jetlag = {
    abs,
    trip,
    scrollToNow,
    yAt,
    nowMs,
    setSimNow: (iso) => {
      simNow = Date.parse(iso);
      updateNow();
    },
  };
})();
