# Camporee Conductor Suite - Project Backlog

## 🚨 Critical Fixes & Stability (Immediate)
* [x] **Service Worker Refresh:**
    * *Action:* Update `service-worker.js` to explicitly cache the new modular structure (`/js/core/`, `/js/apps/`).
    * *Status:* **Completed.** SW v5 caches all modular dependencies and handles cache-busting via `ignoreSearch: true`.
* [ ] **CSS Unification (Housekeeping):**
    * *Status:* `judge.html` and `admin.html` still reference `judge.css` and `admin.css`.
    * *Action:* Merge common styles into `conductor.css` and remove the specific files if possible to reduce maintenance.

## 🏆 Bracket & Scoring Enhancements
* [ ] **"Grand Final" Workflow (The True 2nd Place):**
    * *Status:* **In Progress.** Review Modal implemented with 1st-4th calculation. Challenge match logic and manual drag-and-drop podium reordering remains.
    * *Requirement:*
        1.  **Review Screen:** Replace "Submit" with "Review Results" to allow manual drag-and-drop of the podium.
        2.  **Challenge Match:** Logic to detect if [Consolation Winner] needs to play [Main Loser] for 2nd place.
* [ ] **Ranking Logic Update:**
    * *Action:* Ensure `leaderboard.js` respects the "True 2nd Place" override if a challenge match occurs.

## 🚀 Camporee Composer (Composer) Enhancements
* [ ] **"Test Drive" Mode:**
    * *Status:* `renderPreview` exists, but it is static.
    * *Action:* Expand the Preview Modal to allow actual interaction (clicking "Start" on stopwatches, entering data) to verify game rules without exporting.
* [ ] **Template Library:**
    * Create a built-in library of common Scouting games (e.g., "Knot Relay", "First Aid Scenarios") for one-click setup.
* [ ] **Undo/Redo Stack:**
    * Implement a history stack for the Form Editor.

## 🎻 Camporee Collator (Runtime) Enhancements
* [ ] **"Practice Mode" / "Pre-Event Check":**
    * A flag to allow Judges to test the form without saving data to the official queue.
* [ ] **Station Status Dashboard:**
    * A view for the "Conductor" (Admin) to see active stations and sync status.

## 🏛️ New Module: Camporee Curator (Archive)
* [ ] **Concept:** A digital archive for past events.
* [ ] **Features:**
    * Ingest `CamporeeConfig.zip` and `Camporee_Scores.csv`.
    * Read-only view of Leaderboards.
    * "Clone to New Event" feature.

## 📦 Infrastructure & DevOps
* [ ] **Node.js LTS Enforcement:**
    * Add `.nvmrc` (v22) to prevent build failures on Node v24+.
* [ ] **GitHub Actions:**
    * Automate Docker Build/Release on tag push.
* [ ] **Single Container Optimization:**
    * Investigate merging `server.js` and `composer_server.js` into a single Express app to simplify deployment.

## 📝 Documentation
* [ ] **User Guide:** Create a "Chair's Manual" (PDF/Wiki) for designing events.
* [ ] **Developer Guide:** Document the modular architecture (`apps/` vs `core/`) and schema.