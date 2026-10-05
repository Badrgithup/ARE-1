#  RoboCup Arena — Tournament Engine & Live Audience Projector System

<p align="center">
  <img src="robocup/public/are-logo.jpg" alt="Association Robotique ENSI (ARE)" width="120" style="border-radius: 8px;" />
</p>

<p align="center">
  <b>Official Tournament Management & Live Projection Display System</b><br />
  Built for <b>Association Robotique ENSI (ARE)</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15.5-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.0-61dafb?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178c6?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Tests-49%2F49_Passing-brightgreen?style=for-the-badge" alt="Tests" />
  <img src="https://img.shields.io/badge/Real--Time-SSE-orange?style=for-the-badge" alt="SSE" />
</p>

---

## 📋 Table of Contents
- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tournament Architecture & Rules](#-tournament-architecture--rules)
  - [Arbitrary Knockout Brackets (e.g. 22 Robots)](#1-arbitrary-knockout-brackets-eg-22-robots)
  - [Generalized Group-Stage Engine (5 to 9 Robots)](#2-generalized-group-stage-engine-5-to-9-robots)
- [Projector View — Phase-Based Live Presentation](#-projector-view--phase-based-live-presentation)
- [Public Remote Access & One-Command Start](#-public-remote-access--one-command-start)
- [Multi-PC Live Event Setup (LAN / Wi-Fi)](#-multi-pc-live-event-setup-lan--wi-fi)
- [Prerequisites & Installation](#-prerequisites--installation)
  - [Step 1: Clone the Repository](#step-1-clone-the-repository)
  - [Step 2: Install Dependencies](#step-2-install-dependencies)
  - [Step 3: Run the Application (One Command)](#step-3-run-the-application-one-command)
  - [Cloudflare Tunnel CLI Setup (cloudflared)](#cloudflare-tunnel-cli-setup-cloudflared)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Keyboard Shortcuts (Projector View)](#-keyboard-shortcuts-projector-view)
- [Project Directory Structure](#-project-directory-structure)
- [API Endpoints](#-api-endpoints)
- [License & Organization](#-license--organization)

---

## 🌟 Overview

**RoboCup Arena** is a mission-critical tournament operations platform developed for live robotic combat competitions organized by the **Association Robotique ENSI (ARE)**. 

The system solves two distinct challenges during a live event:
1. **Admin Control Desk** (`/tournament/[id]`): High-velocity match registration, result verification, undo windows, automatic round progression, and batch dispatching.
2. **Audience Projector Display** (`/projector` or `/tournament/[id]/projector`): A **phase-based, zero-scroll live presentation interface** designed for physical projectors, giant arena TVs, and jumbotrons (supporting 1080p and 768p displays) streaming real-time mutations from the admin desk over the local network (<5ms latency).

---

## 🚀 Key Features

- 🏆 **Dynamic Bracket & Knockout Engine**: Handles any combatant count (from 2 up to 32+ robots) with power-of-two bye algorithms and batch-based match execution.
- 🔄 **Generalized Group-Stage Engine**: Full round-robin scheduling using Berger/polygon rotation with interleaved sub-rounds across multiple groups.
- 📺 **Phase-Based Projector Presentation**: Viewport-contained (`100vh`, `100vw`, zero vertical scrollbar) spectator screen displaying only the current stage without overwhelming audiences.
- 📡 **Multi-PC LAN Real-Time Synchronization**: Native Server-Sent Events (SSE) push updates from Admin PC 1 to Projector PC 2 across standard local area networks or Wi-Fi.
- 🔒 **Permanent Result Visibility**: Completed matches permanently display winners with authoritative gold checkmarks (`✓`) and scores.
- ⚡ **Zero-Latency Optimistic UI & Reversible Window**: Instant 0ms admin state feedback backed by server-authoritative file-locked atomic serialization.

---

## 📐 Tournament Architecture & Rules

### 1. Arbitrary Knockout Brackets (e.g. 22 Robots)
- **Automatic Byes Calculation**: Calculates the nearest power of 2 ($2^5 = 32$), granting byes where required or pairing combatants for preliminary rounds.
- **Batched Scheduling**: Matches execute in configurable batches (default 10 matches per batch) to ensure smooth arena queue flow.
- **Viewport-Contained Knockout Grid**: On the Projector display, large rounds (such as 22 robots with 11 matches) render as a **split screen**:
  - **Left**: Active Arena Bout Spotlight (combatant cards, avatar crests, clubs).
  - **Right**: Compact 2/3-column responsive pairings grid fitting 100% within the screen height with permanently visible winners.

### 2. Generalized Group-Stage Engine (5 to 9 Robots)
For tournaments with 5 to 9 robots, the system automatically runs a group-stage qualification round:

| Robot Count | Group Allocation | Total Group Matches | Advancement Scheme |
| :---: | :---: | :---: | :---: |
| **5 Robots** | **1 group of 5** | 10 matches | Top 2 advance to Final (`2-to-final`) or Top 4 to Semis (`4-to-final`) |
| **6 Robots** | **2 groups: 3 + 3** | 6 matches | Group winners (`2-to-final`) or Top 2 per group to Semis (`4-to-final`) |
| **7 Robots** | **2 groups: 3 + 4** | 9 matches | Balanced group allocation with concurrent interleaved rounds |
| **8 Robots** | **2 groups: 4 + 4** | 12 matches | Group winners advance to Final, or Top 2 per group to Semifinals |
| **9 Robots** | **3 groups: 3 + 3 + 3** | 9 matches | 3 group winners + best runner-up advance |

- **Scoring System**: Standard 3 points for a Win, 0 points for a Loss.
- **Standings Tiebreakers**: Points $\to$ Wins $\to$ Alphabetical tiebreaker.
- **Interleaved Scheduling**: Matches from Group A and Group B interleave by sub-round so all groups progress concurrently.

---

## 📺 Projector View — Phase-Based Live Presentation

The Projector View automatically switches screens to showcase only the authoritative active phase:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   ROBOCUP ARENA · PHASE-BASED STAGE FLOW                         │
└──────────────────────────────────────────────────────────────────────────────────┘

   [Phase 1: GROUP STAGE]
   ├─ Group Leaderboard tables (Points, W-L, Rank, Qualify vs Cut)
   ├─ Completed Group match results with gold checkmarks (✓)
   └─ Prominent Active Arena Bout Spotlight Card
              │
              ▼ (All group matches finished)
   [Phase 2: QUALIFIED COMBATANTS]
   ├─ Stage Advancement Ceremony Screen
   ├─ Combatant Seeding Badges (🟨 A1, 🟨 B1, 🟨 A2, 🟨 B2...)
   └─ Upcoming Playoff Pairings Banner
              │
              ▼ (Playoff bracket started)
   [Phase 3: KNOCKOUT / ROUND N]
   ├─ Left: Active Arena Bout Spotlight Card
   ├─ Right: Compact 2/3-Column Pairings Grid
   └─ Completed match winners permanently visible with gold checkmark (✓)
              │
              ▼ (Final Four reached)
   [Phase 4: SEMIFINALS]
   ├─ Semifinal 1 and Semifinal 2 Matchup Cards
   └─ Championship Grand Final Preview Pod
              │
              ▼ (Finalists determined)
   [Phase 5: CHAMPIONSHIP GRAND FINAL]
   ├─ High-Impact Clash: Red Corner vs Blue Corner
   ├─ Combatant Crests, Clubs, and Tournament Win Tallies
   └─ Trophy Preview
              │
              ▼ (Final match concluded)
   [Phase 6: TOURNAMENT CHAMPION]
   ├─ Dedicated Celebration Podium
   ├─ Pulsing Victor Trophy Aura
   ├─ Champion Name, Club, Institution
   └─ Undefeated Title Stats & Honorary Runner-Up Citation
```

---

## 🌍 Public Remote Access & One-Command Start

RoboCup Arena supports **Public Remote Access** in addition to Local and LAN access. With a single command, you can run the arena server and automatically expose the live projector to anyone on the internet (e.g. spectators on smartphones, remote display screens, or secondary projectors on separate networks or cellular hotspots).

### The One-Command Experience

From the root directory or `robocup/` folder:

```bash
npm run start:arena
```

*(Or for live development mode with hot-reloading: `npm run dev:arena`)*

### What the Command Does Automatically:
1. **Starts the Arena Server**: Binds Next.js to `0.0.0.0:3000`.
2. **Detects Your Machine's LAN IP**: Resolves the true physical IPv4 address (e.g. `192.168.x.x`), strictly ignoring virtual adapters and never showing unusable `0.0.0.0` browser links.
3. **Launches Cloudflare Quick Tunnel**: Starts a secure, account-less tunnel (`cloudflared`) pointing directly to `http://localhost:3000`.
4. **Detects the Public URL**: Parses the generated `https://xxxx-xxxx.trycloudflare.com` domain in real time.
5. **Displays the Unified Terminal Banner**:

```text
====================================================
           ROBOCUP ARENA IS READY
====================================================

LOCAL:
http://localhost:3000/

LAN:
http://192.168.3.9:3000/

PUBLIC:
https://dispatched-collectables-varies-probe.trycloudflare.com/

PROJECTOR:
https://dispatched-collectables-varies-probe.trycloudflare.com/projector

ADMIN:
https://dispatched-collectables-varies-probe.trycloudflare.com/

====================================================
COPY THIS URL TO THE PROJECTOR:
https://dispatched-collectables-varies-probe.trycloudflare.com/projector
====================================================

[Press Ctrl+C to stop the arena server]
```

### Remote Projector Architecture:

```text
       Admin Desk (Host PC)
               │
               ▼
      [RoboCup Server: 3000]
         │            │
         │            ▼
         │      [cloudflared]
         │            │ (Argo Edge)
         ▼            ▼
    Local/LAN      Public Internet (trycloudflare.com)
    Audience       Remote Projectors, Phones, Remote Screens
```

- **Zero Cloudflare Configuration**: No Cloudflare account, DNS setup, API keys, or certificates required.
- **Remote Synchronization**: The remote projector does not rely on device-local `localStorage`. It listens to server-authoritative **Server-Sent Events (SSE)** via `/api/events` with an automatic 2-second **HTTP Polling fallback** if network connection drops.
- **Graceful Fault Tolerance**: If `cloudflared` is not installed or the local network blocks tunnel ports, the server **does not crash**; it continues running locally and over LAN with clear instructions on how to install `cloudflared`.
- **Clean One-Key Shutdown**: Pressing `Ctrl+C` terminates both the Next.js server and Cloudflare tunnel cleanly, leaving no orphaned background processes.

---

## 🌐 Multi-PC Live Event Setup (LAN / Wi-Fi)

Run the Admin desk and the Projector display on separate machines on the venue network:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  ROBOCUP ARENA MULTI-PC VENUE TOPOLOGY                       │
└──────────────────────────────────────────────────────────────────────────────┘

        PC 1: Admin / Control Desk                   PC 2: Audience TV / Projector
   (http://192.168.1.50:3000/tournament/..)       (http://192.168.1.50:3000/projector)
                  │                                               │
                  │ POST /api/tournament/:id/match/:matchId       │ EventSource('/api/events')
                  │ (Single Action Command)                       │ (Real-Time SSE Stream)
                  ▼                                               │
   ┌───────────────────────────────────────────────┐              │
   │      Host Server (listening on 0.0.0.0:3000)  │              │
   │                                               │              │
   │  ┌─────────────────────────────────────────┐  │              │
   │  │ Serialized Promise Mutation Queue       │  │              │
   │  │  - Atomic disk persistence              │  │              │
   │  │  - Monotonic revision increment (N+1)   │  │              │
   │  └─────────────────────────────────────────┘  │              │
   │                       │                       │              │
   │                       ▼                       │              │
   │            EventBus.emit('arena')             │              │
   │                       │                       │              │
   │                       ▼                       │              │
   │      SSE Route Handler (/api/events) ─────────┴──────────────┘
   │      Pushes updates to Projector in <5ms
   └───────────────────────────────────────────────────────────────
```

### Steps for Event Day:
1. **Find Host IP**: On the host computer, run `ipconfig` (Windows) or `ifconfig` (Linux/Mac). Note the IPv4 address (e.g. `192.168.1.50`).
2. **Start Server**: Run `npm run start` (which binds to `0.0.0.0:3000`).
3. **Admin PC**: Open browser to `http://localhost:3000`.
4. **Projector PC**: Open browser to `http://192.168.1.50:3000/projector` and press `F` (or `F11`) for fullscreen.

---

## 💻 Prerequisites & Installation

### Prerequisites
- **Node.js**: Version **18.18.0** or higher (Node 20.x or 22.x LTS recommended)
- **npm**: Version **9.x** or higher
- **Git**: Installed and available in terminal

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/Badrgithup/ARE-1.git
cd ARE-1
```

---

### Step 2: Install Dependencies

Navigate to the `robocup` directory and install all required packages:

```bash
cd robocup
npm install
```

*(Or from the repository root, run `npm --prefix robocup install`)*

---

### Step 3: Run the Application (One Command)

#### Option A: Unified Arena Launcher (Production + Public Tunnel — Recommended)
Starts the production server and Cloudflare Quick Tunnel with a single command, auto-detecting your LAN IP and public URL:

```bash
npm run start:arena
```

*(From repo root: `npm run start:arena`, or from `robocup/`: `npm run start:arena`)*

#### Option B: Unified Development Launcher (Dev Server + Public Tunnel)
Starts Next.js dev server with Turbopack and Cloudflare Quick Tunnel:

```bash
npm run dev:arena
```

#### Option C: Standard Local-Only Mode
If you prefer running without any cloud tunnel:

```bash
npm run build
npm run start
```

---

### ☁️ Cloudflare Tunnel CLI Setup (`cloudflared`)

`start:arena` automatically uses `cloudflared` if installed. If it is not already installed on your system:

#### Windows (via WinGet or Direct Download):
```powershell
winget install --id Cloudflare.cloudflared
```
Or download the Windows 64-bit standalone executable from the [Cloudflare Releases page](https://github.com/cloudflare/cloudflared/releases) and place `cloudflared.exe` in your `PATH` or `C:\Program Files (x86)\cloudflared\`.

#### macOS (via Homebrew):
```bash
brew install cloudflared
```

#### Linux (Debian / Ubuntu):
```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

> **Note**: If `cloudflared` is not installed, `npm run start:arena` will **never crash**. It will display friendly installation guidance and continue running smoothly in Local and LAN mode.

---

## 🧪 Testing & Quality Assurance

The codebase includes comprehensive unit, regression, and headless browser tests:

### 1. Run Unit & Regression Test Suite
Executes all 49 engine tests using Node's native test runner and `tsx`:

```bash
npm test
```

**Test Coverage Highlights:**
- ✅ 22-Robot qualification, locked match progression & idempotency
- ✅ Boundary robot counts (2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 22, 24, 32 robots)
- ✅ Invariant protection (undo deadline, anti-corruption rapid saves)
- ✅ Multi-group partitioning (5, 6, 7, 8, 9 robots) and interleaved sub-rounds
- ✅ Geometric centering and SVG connector generation for bracket trees

### 2. Run Headless Browser CDP Presentation Verification
Launches headless Chrome to validate full tournament lifecycles, viewport containment on 1080p and 768p, and automatic phase progression:

```bash
node scripts/verify-phase-presentation.mjs
```

Generated verification screenshots are saved in `tests/screenshots/presentation/`.

---

## ⌨️ Keyboard Shortcuts (Projector View)

When viewing `/projector` or `/tournament/[id]/projector`, control the audience screen using hotkeys:

| Key | Action | Description |
| :---: | :--- | :--- |
| **`F`** | **Toggle Fullscreen** | Expands the presentation to fill the display edge-to-edge |
| **`A`** | **Auto Phase Mode** | Returns to the automatic live tournament phase view |
| **`T`** | **Tree View Mode** | Switches to the panoramic full-tournament bracket tree |
| **`D`** | **Head-to-Head Duel Mode** | Enters full-screen live duel spotlight for the active bout |
| **`C`** | **Champion Podium** | Shows the tournament champion celebration podium |
| **`1` - `6`** | **Direct Phase Jump** | Quick-jump to `1` (Groups), `2` (Qualifiers), `3` (Knockout), `4` (Semis), `5` (Final), `6` (Champion) |

---

## 📁 Project Directory Structure

```text
ARE-1/
├── README.md                          # Repository documentation
├── .gitignore                         # Git ignore configuration
├── robocup-game-selection-spec.md     # Official tournament game specifications
├── 327231729_..._n.jpg                # Tournament bracket reference diagram
│
└── robocup/                           # Next.js Application Root
    ├── package.json                   # Dependencies, scripts & metadata
    ├── tsconfig.json                  # TypeScript compiler settings
    ├── next.config.ts                 # Next.js server configuration
    ├── tailwind.config.js             # Arena dark-theme styling configuration
    │
    ├── public/                        # Static assets (ARE logo, icons)
    │   └── are-logo.jpg
    │
    ├── src/
    │   ├── app/                       # Next.js App Router Pages & API Endpoints
    │   │   ├── page.tsx               # Admin Tournament Setup / Dashboard
    │   │   ├── history/page.tsx       # Tournament Archives & History
    │   │   ├── projector/page.tsx     # Active Projector Display (Auto-Sync)
    │   │   ├── tournament/[id]/       # Specific Tournament Control Desk
    │   │   │   ├── page.tsx           # Admin match control & tree interface
    │   │   │   └── projector/page.tsx # Projector View for specific tournament
    │   │   └── api/                   # REST & SSE API Handlers
    │   │       ├── tournament/        # Tournament CRUD & Mutations
    │   │       ├── events/route.ts    # Server-Sent Events (SSE) Stream
    │   │       └── diagnostics/       # System health check endpoint
    │   │
    │   ├── components/                # Modular React UI Components
    │   │   ├── layout/AppShell.tsx    # Shell isolating Projector from Admin chrome
    │   │   ├── tournament/
    │   │   │   ├── ProjectorDisplay.tsx      # Phase-based audience presentation
    │   │   │   ├── TournamentBracketTree.tsx # Visual SVG bracket tree
    │   │   │   ├── MatchExecutionCard.tsx   # Admin match result recorder
    │   │   │   └── GroupStageLeaderboard.tsx # Standings leaderboards
    │   │
    │   ├── hooks/                     # Custom React Hooks
    │   │   └── useTournament.ts       # Real-time sync & optimistic updates hook
    │   │
    │   └── lib/                       # Core Tournament Logic & Architecture
    │       ├── tournament-engine.ts   # Round advancement, byes & winner rules
    │       ├── group-stage-engine.ts  # Multi-group scheduling & standings
    │       ├── bracket-tree-builder.ts# Tree coordinate layout algorithm
    │       ├── tournament-sync.ts     # Client SSE & BroadcastChannel synchronization
    │       ├── tournament-events.ts   # Server EventBus for real-time dispatch
    │       └── tournament-repository.ts # Serialized atomic file persistence
    │
    ├── scripts/                       # Automation & Verification Scripts
    │   └── verify-phase-presentation.mjs # Headless Chrome CDP verification suite
    │
    └── tests/                         # Automated Unit & Regression Tests
        ├── engine-regression.test.ts  # 49 unit and invariant regression tests
        └── bracket-tree.test.ts       # Tree layout geometric verification
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tournament` | List all tournament records with summary metadata |
| `POST` | `/api/tournament` | Create a new tournament (`{ name, robots, config, batchSize }`) |
| `GET` | `/api/tournament/:id` | Fetch full authoritative tournament state |
| `DELETE` | `/api/tournament/:id` | Delete tournament and purge disk records |
| `PUT / POST` | `/api/tournament/:id/match/:matchId` | Record winner (`{ winnerId }`) |
| `DELETE` | `/api/tournament/:id/match/:matchId` | Undo match result (within undo window) |
| `POST` | `/api/tournament/:id/round` | Advance round (`{ action: 'start_next_round' \| 'advance_from_group' \| ... }`) |
| `GET` | `/api/events` | Real-time Server-Sent Events (SSE) feed for multi-PC sync |
| `GET` | `/api/diagnostics` | System health check and active storage diagnostics |

---

## 📄 License & Organization

This project was engineered specifically for **Association Robotique ENSI (ARE)** for the annual **RoboCup** robotics competition.

All rights reserved © 2026 Association Robotique ENSI.
