# Jet Lag Coach (PWA)

Installable Progressive Web App for Ross Veitch’s Nov 2026 jet-lag plan
(Singapore → Dubai → Miami → Dubai → Singapore). Static HTML/CSS/JS — no build step.

**Not medical advice.** See the in-app footer / About panel.

## Install (Android Chrome — Oppo Find N5)

1. Copy this folder to the phone, or serve it on your LAN.
2. Open `index.html` via `http://` (not `file://`) so the service worker can register.
3. Chrome menu → **Install app** / **Add to Home screen**.
4. Opens `display: standalone` with icons 192 / 512.

### Local smoke test

```bash
cd /path/to/jetlag-pwa
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## UI

- **Lanes** so blocks never cover each other: Sleep | Light | Marks (caffeine strip + melatonin/meal chips).
- **Flights** are full-width bands with flight number, route, dep/arr in both selected zones, and duration.
- **Timezone dropdowns** (Left / Right): Singapore, Dubai, Miami; Right also has **Current location (auto)**. Choices persist in `localStorage`.
- **Now line** (red) updates every minute; FAB jumps to it.

## UI

- **One continuous vertical timeline** for the whole 11–29 Nov trip (scroll top → bottom).
- **Left:** Singapore (origin) day + time (SGT).
- **Right:** current destination zone (GST / EST / SGT) with clear **zone-change markers**.
- Central colour bands: sleep, light seek/avoid, caffeine, melatonin, meals, naps, flights, stay-awake.
- **Now** line + floating **Jump to now** (auto-scrolls on open).
- Tap a block for detail. Legend under the header.
- Trip content lives in `js/trip-data.js` — add another object to `trips[]` for a future trip.

Optimised for foldable Chrome: narrow ~6.6″ (≈412×915) and unfolded near-square (≈800×900). Dark theme, ≥44px touch targets.

## Notifications (honest limits)

| Mode | When it works |
|------|----------------|
| **Notification permission + page timers** | App open in a tab/window |
| **Service worker `showNotification`** | App open or **backgrounded** (SW still alive) |
| **`TimestampTrigger` (Notification Triggers)** | If Chrome exposes it — scheduled even after tab close *while browser process allows* |
| **True Web Push** | Needs a push service + server keys — **not implemented** (by design) |

Enable via the 🔔 button. Reminders fire ~15 minutes before key actions (light, sleep, melatonin, meals, naps, flights, caffeine cutoff, stay-awake).

**Reliable alerts when the app is fully swiped away / phone rebooted require a push subscription server. This PWA does not create accounts or talk to any push vendor.**

## Files

```
index.html
manifest.webmanifest
sw.js
css/app.css
js/trip-data.js
js/app.js
js/notifications.js
icons/icon-192.png
icons/icon-512.png
icons/apple-touch-icon.png
README.md
```

## Source

Hour-by-hour advice reused from the Cursor Page “Jet lag plan: Singapore → Dubai → Miami → Dubai → Singapore, Nov 2026”. No new medical advice invented.

## Design notes (v4+)

Visual language borrowed from Timeshifter store/press screenshots (capsule lanes, icon-led advice, dual clocks, zone bands, gold “seek light” / navy sleep / outlined avoid). Local reference images live in `ref/` (gitignored). Requirements kept: continuous vertical timeline, timezone dropdowns, prominent flight bands with flight #, red Now line.

## Readability redesign (v10)

Full-width plain-language advice cards (no Mel/OK chips). Sleep/light as tappable duration bands. Timezone pickers live in the sticky SGT/EST headers. Collapsible “Up next” strip. Service worker cache `jetlag-coach-v10`.
