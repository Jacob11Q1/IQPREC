<div align="center">

# IQPREC

### Intelligence. Precision. Every Gameweek.

The world's first Arabic-first, AI-powered Fantasy Premier League platform.

[![Website](https://img.shields.io/badge/Website-iqprec.com-00D97E?style=flat-square)](https://iqprec.com)
[![Status](https://img.shields.io/badge/Status-In%20Development-F5A623?style=flat-square)](#status)
[![Stack](https://img.shields.io/badge/Stack-HTML%20%2F%20CSS%20%2F%20JS%20%2B%20Node.js-3B8BEB?style=flat-square)](#tech-stack)
[![License](https://img.shields.io/badge/License-Proprietary-E8445A?style=flat-square)](#license)

</div>

---

## Overview

Fantasy Premier League is played by over **11 million managers worldwide**, yet no platform has ever properly served the Arab FPL community in its own language. IQPREC closes that gap.

IQPREC is an AI co-pilot layered on top of official FPL data. It combines real-time player statistics, expert-coded FPL strategy rules, and a proprietary data source no competitor has — **live ownership and captaincy trends from IQPREC's own Arab user base** — to generate recommendations that are sharper, faster, and delivered entirely in Arabic.

> Built from Beit Sahour, Palestine 🇵🇸 — for every Arab manager chasing green arrows.

---

## Core Features

| Feature | Description |
|---|---|
| 🧠 **AI Captain Picker** | Ranks your squad's best captain options with confidence scores and live reasoning |
| ⚽ **AI Lineup Builder** | Optimal starting XI and formation, recalculated every gameweek |
| 🔄 **Transfer Advisor** | In/out suggestions with hit-cost analysis before you pull the trigger |
| 🎯 **Differential Radar** | Surfaces low-ownership, high-upside picks before they explode |
| 🃏 **Chip Strategy Planner** | Tells you exactly when to play Wildcard, Free Hit, Bench Boost, Triple Captain |
| 🌟 **Arab Stars Watch** | Real-time tracker of every Arab player active in the current Premier League season |
| 💬 **AI Chat** | Unlimited, streamed, FPL-only conversation — ask anything, get an answer instantly |
| 🏆 **Competitions** | Referral-powered prize competitions — real cash, paid out every milestone |
| 👥 **Community Hub** | Mini-league spy, regional leaderboards, head-to-head tracking |

---

## Pricing

One plan. Every feature included. No tiers, no upsells, no paywalled "premium" insights.

<div align="center">

| | Monthly | Season Pass |
|:---:|:---:|:---:|
| **Price** | $14.99/mo | $109.99 |
| **Coverage** | Billed monthly | August → May 31 |
| **Trial** | 7 days free, no card required | 7 days free, no card required |
| **Features** | Everything | Everything |

</div>

---

## Tech Stack

Built deliberately lean — no framework, no build step, no compile times. Edit a file, refresh the browser, done.

**Frontend**
`HTML5` · `CSS3` · `Vanilla JavaScript (ES Modules)`

**Backend**
`Node.js` · `Express 5`

**Data & Infrastructure**
`Supabase (PostgreSQL + RLS)` · `Redis` · `Contabo VPS` · `Nginx` · `PM2`

**Integrations**
`Anthropic Claude API` · `Stripe` · `Paytabs (planned)` · `Resend` · `Telegram Bot API`

---

## Security

IQPREC follows an internal **8-layer security model**, covering:

1. Schema validation on every request (Zod)
2. JWT RS256 authentication with rotating refresh tokens
3. Redis-backed rate limiting per route class
4. Hardened HTTP headers (Helmet, strict CSP, HSTS)
5. Environment-only secrets, zero hardcoded credentials
6. Row Level Security enforced on every database table
7. Sanitized rendering — no raw HTML injection on the frontend
8. AI prompt-injection and jailbreak detection on every model call

---

## Project Structure

```
IQPREC/
├── CLAUDE.md              Build standards & AI assistant instructions
├── public/                Frontend — HTML, CSS, JS (zero build step)
├── server/
│   └── src/
│       ├── routes/        API endpoints
│       ├── services/      Business logic — AI, billing, FPL sync, email
│       ├── middleware/    Security, auth, validation
│       ├── jobs/          Scheduled tasks (FPL sync, billing expiry)
│       └── db/             Migrations & Supabase client
└── scripts/                Dev tooling
```

---

## Status

🚧 **Actively in development.**

Running a 30-day build sprint targeting launch ahead of the **2026/27 Premier League season**, kicking off **August 22, 2026**.

---

## Founders

<div align="center">

| Jacob Qumsiyeh | Simon Haddad | Ibrahim Qumsiyeh |
|:---:|:---:|:---:|
| Co-Founder / Developer | Finance & Strategy | Co-Founder / Developer |

</div>

---

<div align="center">

**© IQPREC. All Rights Reserved.**

*Designed and developed by [Jacob Qumsiyeh](https://jacobqum.dev)*

</div>