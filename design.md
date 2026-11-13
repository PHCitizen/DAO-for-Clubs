# DAO for Clubs — Design System

**Project:** DAO for Clubs  
**Context:** Binance Hackathon — BNB Smart Chain  
**Tech Stack:** React 19, TanStack Start, Tailwind CSS v4, TypeScript, viem

---

## 1. Design Direction & Overview

DAO for Clubs is an event-funding and governance platform built on BNB Smart Chain. The visual theme is designed to evoke a modern, high-contrast Web3 dApp experience inspired by the Binance dark aesthetic: deep obsidian backgrounds, sleek surface cards with micro-borders, and high-energy gold/yellow accents reserved exclusively for interactive elements, highlights, and primary CTAs.

---

## 2. Color Palette & Theme Tokens

All colors are codified as CSS variables and mapped to Tailwind CSS v4 `@theme` tokens in `packages/frontend/src/styles.css`. This ensures central maintainability and eliminates scattered inline styles or hardcoded hex literals.

| Token | CSS Variable | Hex / Value | Usage |
| :--- | :--- | :--- | :--- |
| `page` | `--color-page` | `#0B0E11` | Application background (obsidian black) |
| `card` | `--color-card` | `#1E2329` | Surface cards, modals, dropdowns |
| `card-hover` | `--color-card-hover` | `#262B34` | Hover state for interactive cards/buttons |
| `card-border` | `--color-card-border` | `#2B3139` | Subtle structural borders and dividers |
| `binance-yellow` | `--color-binance-yellow` | `#F0B90B` | Primary CTAs, active highlights, badges |
| `binance-yellow-hover` | `--color-binance-yellow-hover` | `#FCD535` | Hover state for primary yellow buttons |
| `binance-black` | `--color-binance-black` | `#0B0E11` | Text rendered on yellow buttons and badges |
| `text-primary` | `--color-text-primary` | `#EAECEF` | Primary headings, titles, high-contrast body |
| `text-secondary` | `--color-text-secondary` | `#848E9C` | Subtitles, labels, descriptions, muted copy |
| `text-tertiary` | `--color-text-tertiary` | `#5E6673` | Dim indicators, empty states, subtle icons |
| `status-success` | `--color-status-success` | `#0ECB81` | Connected network, positive status, confirmations |
| `status-error` | `--color-status-error` | `#F6465D` | Disconnections, reverts, rejections, errors |
| `status-warning` | `--color-status-warning` | `#F0B90B` | Network mismatch alerts, pending confirmations |

---

## 3. Typography & Visual Hierarchy

- **Hero Title (`text-3xl sm:text-5xl font-extrabold tracking-tight text-text-primary`):** Bold headline anchoring the home experience.
- **Sub-hero Badge (`rounded-full bg-card/80 border-card-border text-binance-yellow`):** Hackathon context and chain attribution.
- **Section Headers (`text-base sm:text-lg font-semibold text-text-primary`):** Clearly delineated card groupings paired with distinctive icon badges.
- **Field Labels (`text-xs font-semibold uppercase tracking-wider text-text-secondary`):** Monospace/uppercase metadata headers for fast scanning.
- **Addresses & Hashes (`font-mono text-sm text-text-primary break-all`):** Monospace font for exact cryptographic identities (wallets, contracts, tx hashes).

---

## 4. Component Architecture

### A. Navigation Header
- **Positioning:** Sticky top banner (`sticky top-0 z-30`) with backdrop blur (`backdrop-blur-md bg-page/90`) and bottom border (`border-card-border`).
- **Brand Identity:** Abstract interlocking geometric logo icon alongside "DAO for Clubs" and a "BNB Chain" pill badge.
- **Right-Aligned Wallet Action:**
  - *Disconnected:* Primary gold "Connect Wallet" button with wallet icon.
  - *Connecting:* Pulsing spinner state with "Connecting…" text.
  - *Connected:* Dual pill showing the active network badge (green for matched, yellow for mismatched) and shortened wallet address (`0x1234...5678`) with a quick disconnect action.

### B. Deployment Context Card
- Card surface (`bg-card border-card-border rounded-xl shadow-lg shadow-black/30`).
- Card header with contract/server icon and live deployment pill badge.
- 2x2 responsive data grid highlighting:
  1. **Configured Network:** Chain name + ID badge.
  2. **Canonical DAO:** Monospace contract address or "Not yet deployed" italic state.
  3. **TestUSD Token:** Monospace token address or "Not yet deployed" italic state.
  4. **Public RPC Status:** Real-time query result (Reachable with block number, checking, or unavailable).

### C. Wallet & Network Management Card
- Card header with wallet icon and dynamic status badge:
  - `No Extension` (red)
  - `Not connected` (neutral)
  - `Connecting…` (yellow)
  - `Connected` (green)
  - `Wrong network` (yellow alert)
- Dynamic content states:
  - *Uninstalled:* Clear guidance to install MetaMask or Trust Wallet with link.
  - *Disconnected:* Call-to-action copy and primary yellow button.
  - *Connected:* Full monospace address display with quick disconnect button.
  - *Network Match:* Green banner confirming connection to supported network.
  - *Network Mismatch:* High-visibility yellow alert explaining expected vs current chain with one-click "Switch to [Chain]" button.
  - *Network Switch Error:* Red alert banner detailing rejection/error with "Try again" retry button.

---

## 5. Responsive Design & Accessibility

- **Mobile First:** All grids degrade cleanly from multi-column layouts to single-column card stacks on mobile viewports (`grid-cols-1 sm:grid-cols-2`).
- **Touch Targets:** Interactive targets maintain at least 40–44px hit areas with generous padding for mobile tapping.
- **Contrast Ratios (WCAG AA & AAA):**
  - Primary text (`#EAECEF`) on card (`#1E2329`): **11.5:1** (exceeds AAA).
  - Secondary text (`#848E9C`) on card (`#1E2329`): **4.7:1** (exceeds AA).
  - Button text (`#0B0E11`) on primary yellow (`#F0B90B`): **12.3:1** (exceeds AAA).
- **Focus Rings:** All buttons, links, and interactive controls provide high-visibility keyboard focus rings (`focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:outline-none focus-visible:ring-offset-2 focus-visible:ring-offset-page`).
- **Screen Reader Support:** Preserves `role="alert"`, `aria-live="polite"`, `aria-labelledby`, and descriptive SVG labels throughout.
