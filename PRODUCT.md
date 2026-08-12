# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: audio/video/luci rental & event companies — warehouse staff (magazzinieri), the admin who runs the company's operations, and event organizers who manage recurring content-driven events. Confirmed by the user (2026-08-09): Roadcase is a multi-client SaaS sold to other companies in this industry, not an internal-only tool. Each customer company is a "team" (multi-tenant, `teamId`-scoped) with its own data, billing, and configurable feature set.

Within a team, three roles (inferred from `AuthContext.jsx`/`TabBar.jsx`, strong evidence):
- **admin** — full access: inventory, calendar/events, load lists, users, billing, settings.
- **worker** (magazziniere) — home/calendar/inventory/tasks; a "senior" permission variant can edit inventory fully. Operates the load-list scanner workflow (Pronto/Carico/Rientro) on-site in the warehouse, often on a poor Wi-Fi/cellular connection.
- **organizer** — manages recurring content-driven events (e.g. a weekly show format — see "Brasserie" event type) rather than physical load lists.

## Product Purpose

Roadcase is warehouse + event-logistics software for AV rental companies: track equipment inventory, plan events on a calendar, build a per-event load list, and scan gear in/out via QR/barcode as it's packed, loaded onto vans, and returned. Source: Landing.jsx hero copy — "Il gestionale per aziende di noleggio audio/video/luci: magazzino, calendario eventi e personale in un'unica app."

## Positioning

Built specifically for the physical realities of AV warehouse work, not generic inventory software:
- Resilient to bad warehouse connectivity — every write to a load list goes through a Firestore transaction with visible save-error feedback (added this session) instead of silently losing data, and toggle buttons update optimistically so the UI feels instant even on a slow link.
- Per-item unit tracking (kit instances, e.g. distinguishing "VX1000 unit #2" from #1) only where it actually matters, opt-in per catalog item rather than forced on everything.
- Configurable per client: not every rental company needs the full load-list workflow (this session added an on/off "Moduli" system, starting with a "Liste di carico" toggle in team settings), so the product can be trimmed to what a given customer actually needs.
- Vehicle-aware: items can be assigned to a specific van when a company runs more than one.

## Operating Context

- PWA, installable to the home screen (iOS Safari / Android Chrome), used primarily on phones.
- Warehouse floor use: workers scan QR/barcodes on physical flight cases and equipment with the phone camera; keyboard-wedge Bluetooth scanners (e.g. Netum C750) are also supported.
- Load-list checklist has three phases: Pronto (prepped) → Carico (loaded onto the van) → Rientro (returned to the warehouse) — carico implies pronto, rientro implies both.
- Load lists can also be printed to PDF and used as a physical paper checklist while loading (all items included regardless of checked state, with a filled checkmark for items already marked loaded in the app, for a double-check against the physical PDF).
- Billing via Stripe subscription (35€/month per company, 30-day free trial, no card required to start — Landing.jsx).

## Capabilities and Constraints

- Multi-tenant: every collection is `teamId`-scoped; Firestore security rules gate on team membership and `hasValidBilling`.
- Stack: React 18 + Vite, Firebase (Auth/Firestore/Storage), i18next (IT/EN), no CSS framework — all styling is inline styles using CSS custom properties as design tokens.
- Single light theme only, no dark mode.
- Undecided/open: exact list of future toggleable modules beyond "Liste di carico" (an "inventory-only, no calendar" mode was discussed as a distinct future direction, explicitly out of scope for now).

## Brand Commitments

- Name: **Roadcase** (wordmark styled "ROAD" in white + "CASE" in the accent red), rebranded this session from the internal working name "Magazzino AV".
- Accent color: `#e63946` (red). App background `#f5f5f3`. Logo placeholder is a flight-case-inspired mark.
- Tone: plain, operational Italian (the primary/default locale), matter-of-fact rather than salesy — copy names things the way a warehouse worker would say them ("Da rientrare" → "Rientrato", not abstract statuses).

## Evidence on Hand

- `src/pages/Landing.jsx` — hero copy, feature summary, pricing.
- `README.md` — describes an earlier, single-tenant version of the product; superseded by the multi-tenant/SaaS evolution above but still accurate on core mechanics (inventory, QR/barcode, load lists).
- No customer testimonials, logos, or case studies on hand — do not fabricate any.

## Product Principles

1. Never let a UI action claim success it didn't confirm — this product runs where the network can't be trusted (warehouse floor), so every write surfaces failure instead of silently losing data.
2. Track detail only where the job needs it — per-unit tracking, vehicle assignment, and now whole modules are opt-in, not forced on every customer.
3. Speak the warehouse's language — labels and states mirror what a magazziniere already says out loud, not generic software vocabulary.
4. Mobile and on-site come first — camera scanning, big touch targets, and phone-first layout are the primary interface, not an adaptation of a desktop tool.

## Accessibility & Inclusion

No specific standard mandated by the user; existing implementation already uses aria-live regions for scan feedback (screen-reader announcements for popups that are otherwise purely visual/timed) and visible focus/keyboard affordances in places — treat as a baseline to maintain, not degrade.
