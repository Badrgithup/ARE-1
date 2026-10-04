# RoboCup Tournament Game Selection System
## Complete Function Specification

**Event**: RoboCup Annual Tournament  
**Format**: Single-elimination tournament with manual judging  
**Input Pool**: 90-100 robots  
**Output**: Single champion robot  
**Technology Stack**: Astro + Svelte (or similar)

---

## 1. DATA MODELS

### 1.1 Robot Object
```
{
  id: string (UUID),
  name: string,
  club: string,
  institution: string | null (optional),
  status: "active" | "eliminated",
  eliminatedRound: number | null,
  wins: number
}
```

### 1.2 Match Object
```
{
  id: string (UUID),
  roundNumber: number,
  matchNumber: number,
  robot1: Robot,
  robot2: Robot,
  winner: Robot | null,
  loser: Robot | null,
  timestamp: ISO8601,
  undoDeadline: ISO8601 | null (30 seconds from timestamp),
  status: "pending" | "recorded" | "locked"
}
```

### 1.3 Round Object
```
{
  id: string (UUID),
  roundNumber: number,
  startTime: ISO8601,
  endTime: ISO8601 | null,
  totalMatches: number,
  completedMatches: number,
  matches: Match[],
  status: "pending" | "in_progress" | "completed"
}
```

### 1.4 Tournament Object
```
{
  id: string (UUID),
  name: string,
  startTime: ISO8601,
  endTime: ISO8601 | null,
  totalRobots: number,
  currentRound: number,
  rounds: Round[],
  winner: Robot | null,
  status: "not_started" | "in_progress" | "completed"
}
```

---

## 2. CORE FUNCTIONS

### 2.1 File Input/Output Functions

#### `loadRobotsFromCSV(file: File) → Robot[]`
**Purpose**: Parse CSV file and create robot objects

**Input Format**:
```csv
Robot Name,Club,Institution
PIPE-GUARD-17,Alpha Club,University of Tunis
BioBot-2024,Beta Team,
RoboX-2024,Beta Team,INSAT
```

**Parameters**:
- `file: File` - CSV file from user upload

**Returns**: 
- `Robot[]` - Array of robot objects with UUID ids

**Side Effects**:
- Validates CSV headers (must contain at least "Robot Name" and "Club")
- Institution field is OPTIONAL (can be empty)
- Removes duplicates by name
- Throws error if file is invalid or empty
- Loads ALL robots (no minimum or maximum limit)

**Error Handling**:
- Invalid file format → throw `CSVParseError`
- Missing "Robot Name" or "Club" headers → throw `CSVHeaderError`
- Empty file → throw `EmptyFileError`
- Duplicate robot names → remove duplicates, keep first occurrence

---

#### `exportRoundResults(round: Round) → void`
**Purpose**: Save round results to H2 database

**Parameters**:
- `round: Round` - Completed round object

**Returns**: 
- `void` (data persisted in H2 database)

**Database Schema**:
```sql
CREATE TABLE rounds (
  id VARCHAR(36) PRIMARY KEY,
  tournament_id VARCHAR(36),
  round_number INT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  total_matches INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE matches (
  id VARCHAR(36) PRIMARY KEY,
  round_id VARCHAR(36),
  tournament_id VARCHAR(36),
  match_number INT,
  robot1_id VARCHAR(36),
  robot2_id VARCHAR(36),
  winner_id VARCHAR(36),
  loser_id VARCHAR(36),
  judge_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (round_id) REFERENCES rounds(id)
);
```

**Side Effects**:
- Inserts round data into H2 database
- Inserts all match records with winner/loser info
- Timestamps automatically recorded
- Also creates local backup in browser localStorage

---

### 2.2 Pairing & Randomization Functions

#### `generateRandomPairing(robots: Robot[]) → Match[]`
**Purpose**: Randomly pair all remaining robots for a round, avoiding same club/institution matches when possible

**Parameters**:
- `robots: Robot[]` - Array of active (non-eliminated) robots

**Returns**: 
- `Match[]` - Array of match objects, each with 2 robots paired

**Algorithm**:
1. Create shallow copy of robots array
2. Fisher-Yates shuffle initial randomization
3. Attempt intelligent pairing:
   - For each robot, find an unpaired opponent from different club AND institution
   - If no match available, pair with different club (institution can be same)
   - If still no match available, allow same club/institution pairing (rare)
4. If odd number: last unpaired robot gets a **bye** (auto-advances)
5. Assign match IDs and numbers sequentially
6. Return match array

**Pairing Priority**:
1. ✅ Different club AND different institution (preferred)
2. ✅ Different club (institution can be same)
3. ⚠️ Same club/institution (only if no other option)

**Example**:
- Input: 45 robots from 12 clubs / 8 institutions
- Output: 22 matches (avoiding same club/institution) + 1 bye = 23 robots advance

**Edge Cases**:
- Odd number of robots → handle bye (auto-advance one robot)
- 2 robots remaining → final match (pairing rules don't apply)
- 1 robot remaining → tournament ends
- All robots from same club → allow pairing despite constraint

**Randomization Quality**:
- Use `crypto.getRandomValues()` for fair entropy
- Initial shuffle is random, then intelligent pairing applied

---

#### `selectMatchWinner(matchId: string, robotId: string) → Match`
**Purpose**: Simple interface - event staff clicks on the winning robot in a match

**Parameters**:
- `matchId: string` - UUID of the match
- `robotId: string` - UUID of the robot selected as winner

**Returns**: 
- `Match` - Updated match object with winner recorded

**UI Display**:
- Show two robot cards side-by-side with names, clubs, institutions
- Large clickable buttons on each robot
- Selected robot highlights (glow effect)
- Display: `Robot1 vs Robot2` at top
- Show match number in bracket

**Side Effects**:
- Highlights selected robot
- Shows "Winner Selected" confirmation
- Enables "Undo" button for 30 seconds
- Moves to next match after confirmation

**No Judge Management**:
- No judge login/assignment
- No turn order randomization
- Event staff simply clicks the robot who won each match

---

### 2.3 Match Execution Functions

#### `recordMatchResult(matchId: string, winnerId: string) → Match`
**Purpose**: Confirm and lock in the match result after selection

**Parameters**:
- `matchId: string` - UUID of the match
- `winnerId: string` - UUID of winning robot (the one clicked)

**Returns**: 
- `Match` - Updated match object with winner/loser finalized

**Side Effects**:
- Updates match object with winner confirmed
- Marks losing robot as `status: "eliminated"`
- Sets `eliminatedRound` on loser
- Increments winner's `wins` counter
- Triggers animation: confetti for winner, fade-out for loser
- Auto-saves to localStorage and H2 database
- Starts 30-second undo timer
- Shows "Undo" button with countdown

**Validation**:
- Both robots must exist
- Robots must be in this match
- Match must not already be locked (past undo window)
- Both robots must be active (not previously eliminated)

---

#### `undoLastMatch(matchId: string) → Match`
**Purpose**: Revert a match result if staff made a mistake (within 30 seconds)

**Parameters**:
- `matchId: string` - UUID of the match to undo

**Returns**: 
- `Match` - Match object reset to unsettled state

**Side Effects**:
- Clears winner/loser from match
- Restores both robots to `status: "active"`
- Removes elimination mark
- Restores `wins` counter on false winner
- Resets UI to show both robots for re-selection
- Updates H2 database with undo action

**Validation**:
- Match must exist
- Must be called within 30 seconds of recordMatchResult
- After 30 seconds: show error "Cannot undo - time expired"

---

#### `completeRound(roundId: string) → Round`
**Purpose**: Finalize all matches in a round and prepare for next round

**Parameters**:
- `roundId: string` - UUID of round to complete

**Returns**: 
- `Round` - Updated round with status = "completed"

**Validation**:
- All matches must have results recorded
- At least 2 robots must remain for next round

**Side Effects**:
- Sets `round.endTime` to now
- Sets `round.status = "completed"`
- Counts remaining active robots
- Triggers round summary animation
- Auto-saves results to file

---

### 2.4 Round Management Functions

#### `initializeTournament(robots: Robot[], tournamentName: string) → Tournament`
**Purpose**: Create tournament object and initialize first round

**Parameters**:
- `robots: Robot[]` - Array of loaded robots
- `tournamentName: string` - Name of tournament

**Returns**: 
- `Tournament` - Initialized tournament object

**Side Effects**:
- Creates tournament ID
- Creates first Round object
- Generates initial pairings
- Sets status = "in_progress"

---

#### `startNewRound(tournament: Tournament) → Round`
**Purpose**: Generate pairings for the next round

**Parameters**:
- `tournament: Tournament` - Current tournament object

**Returns**: 
- `Round` - New round object with matches generated

**Algorithm**:
1. Filter robots where `status = "active"`
2. Check if tournament is over (1 robot remaining)
3. Generate random pairings using `generateRandomPairing()`
4. Assign new round number (previous + 1)
5. Create Round object with all matches

**Side Effects**:
- Triggers round transition animation
- Displays upcoming matchups to audience
- Updates tournament UI

**Edge Cases**:
- 1 robot remaining → tournament ends, return winner
- 2 robots remaining → final match with special animation
- Odd number remaining → create bye match

---

#### `getCurrentActiveRobots(tournament: Tournament) → Robot[]`
**Purpose**: Get all robots still in tournament

**Parameters**:
- `tournament: Tournament` - Current tournament

**Returns**: 
- `Robot[]` - Array of robots with `status = "active"`

---

#### `getTournamentStats(tournament: Tournament) → object`
**Purpose**: Generate tournament summary statistics

**Parameters**:
- `tournament: Tournament` - Completed or in-progress tournament

**Returns**:
```
{
  totalRobots: number,
  currentRound: number,
  robotsRemaining: number,
  robotsEliminated: number,
  matchesCompleted: number,
  matchesRemaining: number,
  winnersPerClub: {[clubName]: count},
  winnersPerInstitution: {[institutionName]: count}
}
```

---

### 2.5 Persistence Functions

#### `saveTournamentState(tournament: Tournament) → void`
**Purpose**: Save current tournament state to browser storage and file

**Parameters**:
- `tournament: Tournament` - Current tournament object

**Side Effects**:
- Saves to `localStorage` (key: `robocup_tournament_${id}`)
- Triggers auto-download of JSON backup
- Timestamp saved state

**Storage Format**: JSON

---

#### `loadTournamentState(tournamentId: string) → Tournament`
**Purpose**: Restore tournament from previous session

**Parameters**:
- `tournamentId: string` - ID of tournament to restore

**Returns**: 
- `Tournament` - Restored tournament object

**Error Handling**:
- If tournament not found → throw `TournamentNotFoundError`
- If corrupted data → throw `CorruptedDataError`

---

## 3. ANIMATION & UI TRIGGERS

### Animation Anchor Points
These are moments where animations should be triggered:

| Trigger | Animation | Duration |
|---------|-----------|----------|
| Robot selected as winner | **Winner**: confetti burst, highlight glow; **Loser**: fade-out slide | 1.5s |
| Undo button appears | "Undo" button slides in with 30s countdown timer | 0.3s |
| Round transitions | Slide all results up, new bracket slides in | 2s |
| Final match setup | Stadium lights effect, dramatic zoom on final 2 robots | 2s |
| Tournament winner | Confetti explosion, trophy animation, celebratory music cue | 3s |
| Match cards load | Robot cards slide in from sides, shake/bounce animation | 0.8s |

---

## 4. USER INTERFACE STATES

### State: Upload CSV
- Input: File picker
- Output: List of robots loaded, robot count display
- Next: Confirm & start tournament

### State: Tournament Preparation
- Display: All robots, club/institution breakdown
- Actions: View pairings, randomize again, start round
- Animations: Pairings slide in

### State: Round In Progress
- Display: Current match - two robots facing off side-by-side
  - Robot 1 card: Name, Club, Institution
  - Robot 2 card: Name, Club, Institution
  - Match number and round number at top
- Actions: 
  - Click on **Robot 1** button to select as winner
  - Click on **Robot 2** button to select as winner
  - Click **Undo** button (if within 30 seconds of last selection)
- Confirmation: "Winner Selected" flash with countdown timer for undo window
- Next: Auto-advance to next match after confirmation

### State: Round Complete
- Display: Results table (all matches), elimination list
- Actions: View stats, export results, start next round
- Animations: Round summary slide-in

### State: Tournament Complete
- Display: Champion robot, club, institution
- Display: Bracket visualization (all 8+ rounds shown)
- Actions: Export full results, download bracket image
- Animations: Trophy, confetti, final stats count-up

---

## 5. ERROR HANDLING & VALIDATION

### Critical Validations
```
validateRobotList(robots):
  - Check count: 90 ≤ count ≤ 100
  - Check no duplicates by name
  - Check all fields non-empty
  - Check encoding (UTF-8)

validateMatch(match):
  - robot1 ≠ robot2
  - Both robots active
  - Match not already recorded
  
validateRound(round):
  - All matches have results
  - At least 2 robots remain (unless final)
  - No robot appears twice
```

### Error Recovery
- **Corrupted data**: Recover from previous auto-save
- **Network failure**: Auto-save to localStorage, user can download
- **Invalid match**: Show error modal, let judge re-select

---

## 6. EDGE CASES

| Case | Handling |
|------|----------|
| Odd number of robots | Create bye (auto-advance one robot) |
| 2 robots final | Create final match |
| 1 robot (winner found) | Tournament ends, show trophy screen |
| CSV missing data | Skip row, warn user |
| Duplicate robot names | Remove duplicates, keep first |
| Judge accidentally selects wrong winner | Allow undo (for current match only) |
| Browser crashes mid-round | Recover from localStorage auto-save |

---

## 7. FUNCTION CALL ORDER (Happy Path)

```
1. loadRobotsFromCSV(csvFile)
   ↓
2. initializeTournament(robots, name)
   ↓
3. LOOP for each round:
   a. startNewRound(tournament)
      - generateRandomPairing() [avoids same club/institution]
      - Display all matches for the round
   b. LOOP for each match:
      - Display: Robot1 vs Robot2 (side-by-side)
      - Staff clicks on winner robot
      - selectMatchWinner(matchId, winnerId)
      - recordMatchResult(matchId, winnerId)
      - [ANIMATION: confetti for winner, fade loser]
      - Show Undo button (30s window)
      - Advance to next match
   c. completeRound(currentRound)
      - exportRoundResults(currentRound) [saves to H2 database]
      - saveTournamentState(tournament)
   d. Check: if 1 robot remains → END
   e. Else → return to 3a
   ↓
4. WINNER FOUND
   ↓
5. displayChampion(tournament.winner)
6. displayFinalStats(tournament)
```

---

## 8. TECHNOLOGY NOTES

### For Astro + Svelte Implementation:
- **State Management**: Svelte stores (writable stores for tournament, currentRound, currentMatch, undoTimer)
- **Animations**: Svelte transitions + GSAP for complex animations (confetti, fade-outs, card reveals)
- **Persistence**: localStorage API + H2 Database (backend) for round results
- **File I/O**: Papa Parse (CSV parsing), Blob/File API
- **Database**: H2 database with JDBC driver for result storage
- **UI Components Needed**:
  - CSVUploader
  - RobotList (preview of loaded robots)
  - MatchDisplay (shows 2 robots side-by-side, clickable winner buttons)
  - UndoButton (30s countdown timer)
  - RoundSummary
  - TournamentStats
  - ChampionScreen (trophy animation)
  - AnimationWrapper (confetti, transitions, eliminations)

---

## 9. ACCEPTANCE CRITERIA

✅ CSV loads ALL robots (no 90-100 limit) with Club field required, Institution optional  
✅ Robots randomly paired each round (fair shuffle)  
✅ Pairing algorithm avoids same club/institution matches when possible  
✅ Event staff click on winning robot in simple side-by-side UI  
✅ Undo capability for 30 seconds if staff makes mistake  
✅ Losers eliminated immediately, cannot re-appear  
✅ Results saved to H2 database after each match  
✅ Results also backed up to localStorage  
✅ Animations trigger at key moments (win, lose, undo, round complete)  
✅ Tournament ends when 1 robot remains  
✅ Bracket/stats viewable at end  
✅ Can recover from browser crash via auto-save  
✅ No judge management system needed  

---

## 10. BONUS FEATURES (Phase 2)

- [ ] Live stream overlay (OBS integration)
- [ ] QR code for audience voting (vs. judge selection)
- [ ] Leaderboard per club/institution
- [ ] Bracket visualization (visual tree of all rounds)
- [ ] Time limits per match (countdown timer)
- [ ] Replay/undo last match (admin only)
- [ ] Custom background music per round
- [ ] Multi-screen support (matches on different screens)
