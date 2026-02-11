# Camporee Conductor Suite - Project Backlog

## 🏆 Bracket & Scoring Enhancements
* [ ] **"The True 2nd Place" (Challenge Match Workflow):**
    * *Status:* UI Restore complete. Logical challenge triggers required.
    * *Priority:* **High.** This is essential for competitive fairness in bracket-style games.
    * *New Task:* Implement the "Challenge Match" flag in the score schema to identify if a 2nd place matchup occurred.

## 🚀 Camporee Composer (Designer/Composer)
* [ ] **Layout Theme Engine:**
    * *Status:* Variable architecture ready.
    * *Action:* Add a "Theme" picker in Composer to allow users to change `--brand-main` and `--brand-header` colors globally.

## 🎻 Camporee Collator (Admin/Runtime)
* [ ] **Integrated Score Visualizer:**
    * *Action:* Add a "Real-time Leaderboard" view directly into the Collator dashboard.
* [ ] **Express Server Consolidation:**
    * *Priority:* **Medium.** Merge `server.js` and `designer_server.js` into a single multi-port or path-based Express instance to simplify Docker/Dev runs.

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