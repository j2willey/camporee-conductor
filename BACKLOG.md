# Camporee Conductor Suite - Project Backlog

## 🛠️ Tech Debt & Refactoring
* [ ] **Tier 2/3 Rebrand (Deep Clean):**
    * Audit internal variable names (e.g., `coyote_config`, `coyote_drafts`) in `localStorage`. *Note: Breaking change for existing devices.*
    * Rename the `Coyote-Collator` root directory to `Camporee-Conductor`.
* [ ] **CSS Unification:**
    * Migrate `judge.css` and `admin.css` to fully utilize the variables defined in `conductor.css`.
    * Create a shared "Component Library" for buttons and cards to ensure the Designer looks exactly like the Runtime.
* [ ] **Playwright Test Updates:**
    * Update `tests/basic.spec.js` selectors to match new "Camporee" IDs and text.
    * Add new test cases for the "Designer -> Export -> Runtime -> Import" workflow.

## 🚀 Camporee Composer (Designer) Enhancements
* [ ] **"Test Drive" Mode:**
    * Expand the **Preview Modal** to allow actual interaction (clicking "Start" on stopwatches, calculating scores) to verify game logic without exporting.
* [ ] **Template Library:**
    * Create a built-in library of common Scouting games (e.g., "Knot Relay", "First Aid Scenarios") that users can instantiate with one click.
* [ ] **Undo/Redo Stack:**
    * Implement a history stack for the Form Editor to recover from accidental deletions.

## 🎻 Camporee Collator (Runtime) Enhancements
* [ ] **"Practice Mode":**
    * A flag to allow Judges to test the form without saving data to the official queue.
* [ ] **Station Status Dashboard:**
    * A view for the "Conductor" (Admin) to see which stations are active and when they last synced.

## 🏛️ New Module: Camporee Curator
* [ ] **Concept:** A digital archive for past events.
* [ ] **Features:**
    * Ingest `CamporeeConfig.zip` and `Camporee_Scores.csv` from past events.
    * Read-only view of Leaderboards and Game definitions.
    * "Clone to New Event" feature to bootstrap next year's Camporee from a previous one.

## 📦 Infrastructure & DevOps
* [ ] **GitHub Actions:**
    * Automate the Docker Build and Release creation on tag push.
* [ ] **Single Container Deployment:**
    * Investigate merging `server.js` and `designer_server.js` into a single Express app (routed via `/design` and `/runtime`) to simplify Docker Compose.

## 📝 Documentation
* [ ] **User Guide:** Create a PDF or Wiki for non-technical "Event Chairs" on how to design an event.
* [ ] **Developer Guide:** Document the `better-sqlite3` schema and the JSON storage strategy.