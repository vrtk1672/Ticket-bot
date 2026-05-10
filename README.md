# 🎟️ Ticket-Bot

> **Automated seat hunter** — scans the seating map every **30 seconds**, grabs all available seats, holds them for exactly **8 minutes**, then releases and recaptures automatically.

---

## ⚡ Quick Start (after cloning)

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers (one-time)
npx playwright install

# 3. Launch the interactive menu
npm start
```

On **first run** the bot will ask you to paste your ticket-page URL.  
The URL is saved locally and never committed to Git.

---

## 🖥️ Interactive Menu

```
  ████████╗██╗ ██████╗██╗  ██╗███████╗████████╗
  ...
  TICKET BOT v2.0

  🔗 Active URL: https://...

  [1] 🔗  Set ticket page URL
  [2] 🚀  START bot (hunt all seats)
  [3] 🔍  Test Mode — Scan only
  [4] 🧪  Test Mode — Sample 3 seats
  [5] 📋  Show current config
  [6] ❌  Exit
```

---

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────┐
│  WATCHER (every 30 seconds)                              │
│    └─ Scans seating map for available seats              │
│    └─ Filters out seats already held by workers          │
│    └─ Dispatches WORKER sessions for new seats           │
│                                                          │
│  WORKER SESSION (per batch of ≤10 seats)                 │
│    └─ Opens browser → selects seats → clicks Continue    │
│    └─ Holds checkout page open for exactly 8 minutes     │
│    └─ Closes (releases seats) → Watcher recaptures       │
└─────────────────────────────────────────────────────────┘
```

| Setting | Value |
|---|---|
| Scan interval | **30 seconds** |
| Hold duration | **8 minutes** |
| Max seats / session | **10** |
| Payment submitted | **Never** |

---

## 🛑 Stop the Bot

Type `cancel` in the terminal at any time.  
All browser windows close and all seats are released immediately.

---

## ⚙️ Advanced Config (`src/config.js`)

| Field | Description |
|---|---|
| `url` | Ticket page URL (also set via menu) |
| `seats` | `"all"` or an array like `["F7","F8"]` |
| `watcherRefreshIntervalSec` | How often to scan (default: 30) |
| `holdTimerMinutes` | How long each worker holds (default: 8) |
| `maxSeatsPerSession` | Max seats per browser session (default: 10) |
| `testMode` | `true` = safe testing only |
| `testModeBehavior` | `"scan-only"` / `"scan-and-sample"` / `"click-and-deselect-each"` |

---

## 🛡️ Safety Notes

- **No CAPTCHA bypass** — if a CAPTCHA appears, the bot pauses.
- **No queue bypass** — the bot waits in line like a regular user.
- **No payment** — the bot stops at the checkout page; it never submits payment details.
- **Test mode** has a hard limit of 20 seats and enforces ≥300ms delays between clicks.

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| Seat not found | Check `debug/seat-fail-*.png` screenshots |
| Wrong selectors | Run `npm run codegen` to capture selectors manually |
| CAPTCHA appears | Solve it manually; bot will continue after |
