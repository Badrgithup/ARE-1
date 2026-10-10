# Antigravity Prompt - Tournament Format Change
## 90 Robots: 1v1 Elimination → Individual Performance Scoring

---

## OVERVIEW

The tournament format is changing. **No more group stage at the end.**

Instead:
1. **1v1 elimination all the way down** (90 → 45 → 23 → 12 → 6 → 3)
2. **At 3 robots remaining**: Switch to **Individual Performance Mode**
3. **Each robot does a solo run** (time trial / skills challenge)
4. **Judge manually enters**: Time achieved + Points scored
5. **Rankings determined** by these scores (1st, 2nd, 3rd place)

---

## CURRENT BEHAVIOR (What Works)

✅ 90 robots → 1v1 matches
✅ 45 remain (1 bye)
✅ 1v1 matches → 23 remain
✅ 1v1 matches → 12 remain
✅ 1v1 matches → 6 remain

**Problem**: At 6 robots, system triggers **Group Stage** (Round-Robin with 2-to-final/4-to-final)

---

## NEW BEHAVIOR (What's Needed)

### Phase 1: 1v1 Elimination (90 → 6) ✅ Already Works
```
Round 1: 90 robots → 1v1 matches → 45 winners + 1 bye = 46 robots
Round 2: 46 robots → 1v1 matches → 23 winners + 1 bye = 24 robots
Round 3: 24 robots → 1v1 matches → 12 winners = 12 robots
Round 4: 12 robots → 1v1 matches → 6 winners = 6 robots
Round 5: 6 robots → 1v1 matches → 3 winners = 3 robots
```

### Phase 2: Individual Performance Mode (3 robots) ❌ NEW - NEEDS IMPLEMENTATION

When exactly **3 robots remain**, instead of continuing elimination:

**Switch to Individual Performance Mode:**

```
Current state: 3 robots left
Status: "individual_performance"

Each robot does:
1. Solo run/performance (time trial, skills challenge, etc.)
2. Judge watches and records:
   - TIME: How long they took (seconds)
   - POINTS: Score achieved (if applicable)

Example:
Robot-A: 45.3 seconds, 120 points
Robot-B: 42.1 seconds, 135 points
Robot-C: 48.7 seconds, 115 points

System ranks by points (highest = 1st place)
Then tiebreaker by time (fastest = wins tiebreaker)

Final Result:
🥇 1st Place: Robot-B (135 points, 42.1 sec)
🥈 2nd Place: Robot-A (120 points, 45.3 sec)
🥉 3rd Place: Robot-C (115 points, 48.7 sec)
```

---

## TECHNICAL CHANGES NEEDED

### 1. Remove Group Stage at 6 Robots

**File: `src/lib/tournament-engine.ts`**

**Current Logic (BAD):**
```typescript
if (activeRobots.length === 6) {
  // Trigger group stage
  startGroupStageRound(tournament);
}
```

**Change To (GOOD):**
```typescript
if (activeRobots.length === 3) {
  // Trigger individual performance mode
  startIndividualPerformanceMode(tournament);
} else {
  // Continue 1v1 elimination
  startNewElimination(tournament);
}
```

### 2. Create Individual Performance Engine

**New File: `src/lib/individual-performance-engine.ts`**

```typescript
export interface IndividualPerformance {
  id: string;
  robotId: string;
  time: number; // seconds (e.g., 45.3)
  points: number; // score (e.g., 120)
  timestamp: string;
}

export interface PerformanceRanking {
  ranking: number; // 1st, 2nd, 3rd
  robot: Robot;
  time: number;
  points: number;
  medal: "gold" | "silver" | "bronze";
}

/**
 * Start individual performance mode (3 robots remaining)
 */
export function startIndividualPerformanceMode(
  tournament: Tournament
): Tournament {
  const activeRobots = getActiveRobots(tournament);

  if (activeRobots.length !== 3) {
    throw new Error("Individual performance mode requires exactly 3 robots");
  }

  return {
    ...tournament,
    currentStage: "individual_performance",
    performances: [], // Array of IndividualPerformance records
    performanceResults: null // Will be populated after all 3 perform
  };
}

/**
 * Record an individual robot's performance
 * Judge enters: time + points
 */
export function recordRobotPerformance(
  tournament: Tournament,
  robotId: string,
  time: number, // seconds
  points: number // score
): Tournament {
  const performance: IndividualPerformance = {
    id: generateUUID(),
    robotId,
    time,
    points,
    timestamp: new Date().toISOString()
  };

  const updatedPerformances = [...(tournament.performances || []), performance];

  // Check if all 3 robots have performed
  const activeRobots = getActiveRobots(tournament);
  if (updatedPerformances.length === activeRobots.length) {
    // All robots have performed - calculate final rankings
    const rankings = calculateFinalRankings(tournament, updatedPerformances);

    return {
      ...tournament,
      performances: updatedPerformances,
      performanceResults: rankings,
      status: "completed",
      completedAt: new Date().toISOString()
    };
  }

  // Not all robots have performed yet
  return {
    ...tournament,
    performances: updatedPerformances
  };
}

/**
 * Calculate final rankings based on individual performances
 * Primary: Points (highest wins)
 * Tiebreaker: Time (fastest wins)
 */
export function calculateFinalRankings(
  tournament: Tournament,
  performances: IndividualPerformance[]
): PerformanceRanking[] {
  const robotMap = new Map(tournament.robots.map((r) => [r.id, r]));

  // Create ranking data
  const rankingData = performances
    .map((perf) => ({
      robot: robotMap.get(perf.robotId)!,
      time: perf.time,
      points: perf.points
    }))
    // Sort by: Points (descending), then Time (ascending)
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points; // Higher points wins
      }
      return a.time - b.time; // Faster time wins tiebreaker
    });

  // Assign final rankings with medals
  const medals: ("gold" | "silver" | "bronze")[] = [
    "gold",
    "silver",
    "bronze"
  ];

  return rankingData.map((data, index) => ({
    ranking: index + 1,
    robot: data.robot,
    time: data.time,
    points: data.points,
    medal: medals[index]
  }));
}
```

### 3. Create Individual Performance UI

**New Component: `src/components/IndividualPerformanceScreen.tsx`**

```typescript
"use client";

import { useState } from "react";
import type { Robot } from "@/lib/types";

interface Props {
  remainingRobots: Robot[];
  completedPerformances: Array<{ robotId: string; time: number; points: number }>;
  onRecordPerformance: (robotId: string, time: number, points: number) => void;
}

export default function IndividualPerformanceScreen({
  remainingRobots,
  completedPerformances,
  onRecordPerformance
}: Props) {
  const [selectedRobot, setSelectedRobot] = useState<Robot | null>(null);
  const [time, setTime] = useState<string>("");
  const [points, setPoints] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const nextRobot = remainingRobots.find(
    (r) => !completedPerformances.find((p) => p.robotId === r.id)
  );

  const handleSubmit = async () => {
    if (!nextRobot || !time || !points) return;

    setSubmitting(true);
    try {
      onRecordPerformance(nextRobot.id, parseFloat(time), parseInt(points));
      setTime("");
      setPoints("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-light mb-8">
          🏃 Individual Performance
        </h1>

        {/* Progress */}
        <div className="mb-8">
          <p className="text-light-secondary mb-4">
            {completedPerformances.length} of {remainingRobots.length} robots completed
          </p>
          <div className="w-full bg-border rounded h-2">
            <div
              className="bg-gold h-2 rounded transition-all"
              style={{
                width: `${(completedPerformances.length / remainingRobots.length) * 100}%`
              }}
            />
          </div>
        </div>

        {nextRobot ? (
          <div className="card">
            <h2 className="text-2xl font-bold text-light mb-6">
              {nextRobot.name}
            </h2>
            <p className="text-light-secondary mb-4">{nextRobot.club}</p>

            {/* Input Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-light mb-2">Time (seconds)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g., 45.3"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-light mb-2">Points</label>
                <input
                  type="number"
                  placeholder="e.g., 120"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  className="w-full input"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!time || !points || submitting}
              className="w-full button button-primary mt-8"
            >
              {submitting ? "Recording..." : "✓ Record Performance"}
            </button>
          </div>
        ) : (
          <div className="card text-center">
            <h2 className="text-2xl font-bold text-gold mb-4">
              All Performances Recorded!
            </h2>
            <p className="text-light-secondary">
              Click "View Results" to see final standings
            </p>
          </div>
        )}

        {/* Completed List */}
        {completedPerformances.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-bold text-light mb-4">Completed</h3>
            <div className="space-y-2">
              {completedPerformances.map((perf) => {
                const robot = remainingRobots.find((r) => r.id === perf.robotId);
                return (
                  <div
                    key={perf.robotId}
                    className="bg-dark-secondary p-4 rounded border border-gold"
                  >
                    <p className="text-light font-semibold">{robot?.name}</p>
                    <p className="text-light-secondary">
                      {perf.time}s • {perf.points} pts
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 4. Create Results/Podium Screen

**Update: `src/components/tournament/ChampionScreen.tsx`**

Instead of showing only 1 champion, show **1st, 2nd, 3rd**:

```typescript
// Display three podium positions with medals
🥇 1st Place: Robot-B (135 points, 42.1 sec)
🥈 2nd Place: Robot-A (120 points, 45.3 sec)
🥉 3rd Place: Robot-C (115 points, 48.7 sec)
```

### 5. Update UI Flow

**In tournament display:**
- After round with 6 → 3 robots
- Show message: "Advancing to Individual Performance Mode"
- Display countdown/timer: "Waiting for Judge to Record Performance"
- Show live performance input screen
- Auto-advance when all 3 have performed

---

## DATA MODEL CHANGES

### Update Tournament Type

**File: `src/lib/types.ts`**

```typescript
interface Tournament {
  // ... existing fields ...

  currentStage: 
    | "elimination"
    | "group_stage"
    | "individual_performance" // NEW
    | "semifinals"
    | "final"
    | "completed";

  // NEW: Individual performance mode fields
  performances?: IndividualPerformance[]; // Array of recorded performances
  performanceResults?: PerformanceRanking[]; // Final rankings (1st, 2nd, 3rd)
}

interface IndividualPerformance {
  id: string;
  robotId: string;
  time: number; // seconds, e.g., 45.3
  points: number; // score, e.g., 120
  timestamp: string;
}

interface PerformanceRanking {
  ranking: number; // 1, 2, 3
  robot: Robot;
  time: number;
  points: number;
  medal: "gold" | "silver" | "bronze";
}
```

---

## LOGIC FLOW

```
Start Tournament (90 robots)
    ↓
Round 1: 90 → 45 (1v1 matches)
    ↓
Round 2: 45 → 23 (1v1 matches, 1 bye)
    ↓
Round 3: 23 → 12 (1v1 matches, 1 bye)
    ↓
Round 4: 12 → 6 (1v1 matches)
    ↓
Round 5: 6 → 3 (1v1 matches)
    ↓
[3 ROBOTS REMAINING - SWITCH MODE]
    ↓
Individual Performance Mode:
  - Robot 1: Judge enters Time + Points
  - Robot 2: Judge enters Time + Points
  - Robot 3: Judge enters Time + Points
    ↓
Calculate Rankings:
  Sort by: Points (desc), then Time (asc)
    ↓
Display Podium:
  🥇 1st: Robot with highest points (or fastest time if tie)
  🥈 2nd: Second highest
  🥉 3rd: Third highest
    ↓
[TOURNAMENT COMPLETE]
```

---

## UI/UX BEHAVIOR

### Current Screen: Individual Performance Input

```
Individual Performance

Robot-01
Robotics Club 1

Time (seconds):    [ 45.3 ]
Points:            [ 120  ]

[✓ Record Performance]

─────────────────────
Completed:
 ✓ Robot-02  42.1s • 135 pts
 ✓ Robot-03  48.7s • 115 pts
```

### When All 3 Complete: Podium Screen

```
🏆 TOURNAMENT CHAMPION

🥇 1st Place
   Robot-02
   Robotics Club 2
   135 points • 42.1 seconds

🥈 2nd Place
   Robot-01
   Robotics Club 1
   120 points • 45.3 seconds

🥉 3rd Place
   Robot-03
   Robotics Club 3
   115 points • 48.7 seconds

[Start New Tournament] [View History]
```

---

## TESTING SCENARIOS

- [ ] 90 robots → 1v1 → 45 remain (with 1 bye)
- [ ] Continue eliminating: 45 → 23 → 12 → 6 → 3
- [ ] At exactly 3 robots: **Do NOT enter group stage**
- [ ] Instead: **Enter individual performance mode**
- [ ] Judge can record time + points for each robot
- [ ] After all 3 recorded: **Calculate rankings by points (with time tiebreaker)**
- [ ] Display 1st, 2nd, 3rd on podium screen
- [ ] Tournament completes correctly

---

## IMPORTANT NOTES

1. **No Group Stage at 6**: Remove the logic that triggers group stage
2. **Threshold is 3**: Individual performance mode ONLY when exactly 3 robots remain
3. **1v1 until 3**: Continue 1v1 elimination from 6 → 3
4. **Judge Manual Entry**: Time and Points are manually entered by judge (not automated)
5. **Ranking by Points**: Primary sort is points (highest wins). Tiebreaker is time (fastest wins)
6. **Display 1st, 2nd, 3rd**: Show all three medalists on final podium

---

## QUESTIONS BEFORE STARTING

1. Should time be in seconds with decimals (45.3) or MM:SS format (0:45)?
2. Should points have a max value, or can they be any number?
3. If two robots have same points AND same time, how to break final tiebreaker?
4. Should we show a timer for the judge (e.g., "Next robot ready?") or just input form?
5. Should individual performance results be saved to database like tournament history?

