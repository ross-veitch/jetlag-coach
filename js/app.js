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
  const CARD_MIN = 56;
  const CARD_GAP = 10;

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
        if (b.t === "flight") continue;
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
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--px-per-hour")) || 68;

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
      case "flight": return (b.flightId || "Flight") + " " + (b.from || "") + "→" + (b.to || "");
      default: return (data.blockTypes[b.t] || {}).label || b.t;
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
    els.lhsHead.parentElement.title = "Left column: " + L.name + " (" + L.abbr + ") — tap to change";
    if (rightChoice === "auto") {
      els.rhsHead.textContent = R.abbr;
      els.rhsHead.parentElement.title =
        "Right column auto · " + R.name + " (" + R.abbr + ") — tap to change";
    } else {
      els.rhsHead.textContent = R.abbr;
      els.rhsHead.parentElement.title = "Right column: " + R.name + " (" + R.abbr + ") — tap to change";
    }
  }

  function clearSpine() {
    els.spine.innerHTML = "";
    els.lhs.innerHTML = "";
    els.rhs.innerHTML = "";
  }

  function packCards(items) {
    // items: { startMs, el, naturalTop }
    items.sort((a, b) => a.naturalTop - b.naturalTop || a.startMs - b.startMs);
    let lastBottom = -Infinity;
    for (const it of items) {
      let top = it.naturalTop;
      if (top < lastBottom + CARD_GAP) top = lastBottom + CARD_GAP;
      it.el.style.top = Math.round(top) + "px";
      const h = Math.max(it.el.getBoundingClientRect().height || CARD_MIN, CARD_MIN);
      it.el.style.minHeight = CARD_MIN + "px";
      lastBottom = top + h;
    }
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
      label.innerHTML = 'Up next <button type="button" id="up-next-toggle" aria-expanded="true">Hide</button>';
      document.getElementById("up-next-toggle").addEventListener("click", (e) => {
        e.stopPropagation();
        const box = document.getElementById("up-next");
        const collapsed = box.classList.toggle("collapsed");
        e.currentTarget.textContent = collapsed ? "Show" : "Hide";
        e.currentTarget.setAttribute("aria-expanded", collapsed ? "false" : "true");
      });
    }

    if (!upcoming.length) {
      els.upNextList.innerHTML = `<li class="up-next-empty">No upcoming actions in the trip window.</li>`;
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
        const y = yOf(b.startMs) - 80;
        els.scroll.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
        openDetail(b);
      });
      els.upNextList.appendChild(li);
    }
  }

  function render() {
    const height = yOf(abs.endMs);
    els.timeline.style.height = height + "px";
    els.body.style.height = height + "px";
    els.spine.style.height = height + "px";
    els.lhs.style.height = height + "px";
    els.rhs.style.height = height + "px";

    clearSpine();

    const airportTz = { SIN: "Asia/Singapore", DXB: "Asia/Dubai", MIA: "America/New_York" };
    const airportAbbr = { SIN: "SGT", DXB: "GST", MIA: "EST" };

    // Hour grid + day markers
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
        const showDay = rp.hour === "00";
        rhsTick.className = "tick" + (showDay ? " major" : "");
        rhsTick.style.top = y + "px";
        // Compact RHS: time only (day lives on left + spine marker)
        rhsTick.innerHTML = `<span class="time">${rp.hour}:${rp.minute}</span>`;
        els.rhs.appendChild(rhsTick);
      }
    }

    // Duration bands (sleep / light) — carve out flight ranges so flight text stays readable
    function segmentsMinusFlights(startMs, endMs) {
      let segs = [[startMs, endMs]];
      for (const f of abs.flights) {
        const next = [];
        for (const [s, e] of segs) {
          if (f.endMs <= s || f.startMs >= e) { next.push([s, e]); continue; }
          if (f.startMs > s) next.push([s, Math.min(f.startMs, e)]);
          if (f.endMs < e) next.push([Math.max(f.endMs, s), e]);
        }
        segs = next.filter(([s, e]) => e - s >= 20 * 60000);
      }
      return segs;
    }

    for (const b of abs.blocks) {
      if (!["sleep", "nap", "seek", "avoid"].includes(b.t)) continue;
      const label =
        b.t === "seek" ? "Get bright light" :
        b.t === "avoid" ? "Wear sunglasses" :
        b.t === "nap" ? "Nap" : "Sleep";
      const segs = segmentsMinusFlights(b.startMs, b.endMs);
      segs.forEach((seg, idx) => {
        const top = yOf(seg[0]);
        const h = Math.max(yOf(seg[1]) - top, 28);
        const band = document.createElement("div");
        band.className = "band " + b.t;
        band.style.top = top + "px";
        band.style.height = h + "px";
        if (h >= 44) {
          const fake = { ...b, startMs: seg[0], endMs: seg[1] };
          band.innerHTML =
            `<span class="band-label">${escapeHtml(label)}` +
            `<span class="band-sub">${escapeHtml(rangeText(fake))}</span></span>`;
        }
        band.style.pointerEvents = "auto";
        band.style.cursor = "pointer";
        band.setAttribute("role", "button");
        band.tabIndex = 0;
        band.addEventListener("click", () => openDetail(b));
        els.spine.appendChild(band);
      });
    }

    // Flights
    for (const f of abs.flights) {
      const top = yOf(f.startMs);
      const h = Math.max(yOf(f.endMs) - top, 110);
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
            <span class="fb-route">${escapeHtml(f.from)} → ${escapeHtml(f.to)}</span>
            <span class="fb-dur">${escapeHtml(fmtDur(f.endMs - f.startMs))}</span>
          </div>
          <div class="fb-times">
            <div><strong>Departs ${escapeHtml(f.from)}</strong> ${escapeHtml(depAirport)}</div>
            <div class="fb-cols">${escapeHtml(depL)} · ${escapeHtml(depR)}</div>
            <div><strong>Arrives ${escapeHtml(f.to)}</strong> ${escapeHtml(arrAirport)}</div>
            <div class="fb-cols">${escapeHtml(arrL)} · ${escapeHtml(arrR)}</div>
          </div>
        </div>
        <div class="fb-hint">${escapeHtml(f.detail || "")}</div>`;
      el.addEventListener("click", () => openDetail(f));
      els.spine.appendChild(el);
    }

    // Advice cards: discrete actions only (bands already cover sleep/light)
    const cardBlocks = abs.blocks.filter((b) =>
      b.t === "mel" || b.t === "meal" || b.t === "ncaff" || b.t === "nap"
    );
    const packed = [];
    for (const b of cardBlocks) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "advice-card type-" + b.t;
      el.dataset.id = b.id;
      el.innerHTML =
        `<span class="ico" aria-hidden="true">${blockIcon(b.t)}</span>` +
        `<span class="copy"><div class="title">${escapeHtml(plainTitle(b))}</div>` +
        `<div class="times">${escapeHtml(rangeText(b))}</div></span>`;
      el.addEventListener("click", () => openDetail(b));
      els.spine.appendChild(el);
      packed.push({ startMs: b.startMs, el, naturalTop: yOf(b.startMs) });
    }

    // Force layout then pack
    void els.spine.offsetHeight;
    packCards(packed);

    for (const z of abs.zoneMarkers) {
      if (z.ms < abs.startMs || z.ms > abs.endMs) continue;
      const el = document.createElement("div");
      el.className = "zone-marker";
      el.style.top = yOf(z.ms) + "px";
      el.innerHTML = `<span>🕐 Now on ${escapeHtml(z.place)} time (${escapeHtml(z.abbr)})</span>`;
      els.spine.appendChild(el);
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
    els.nowLine.style.top = yOf(clampMs) + "px";
    const tL = hourLabel(now, L.tz) + " " + L.abbr;
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
    renderUpNext();
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
      <p class="footer-note" style="margin-top:16px;font-size:0.875rem;color:var(--text-dim)">${escapeHtml(data.disclaimer)}</p>`;
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
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      try { reg.update(); } catch (_) {}
      setInterval(() => { try { reg.update(); } catch (_) {} }, 60 * 60 * 1000);
    }).catch((e) => console.warn("SW failed", e));
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

  window.__jetlag = { abs, trip, scrollToNow, yOf, nowMs, setSimNow: (iso) => { simNow = Date.parse(iso); updateNow(); } };
})();
