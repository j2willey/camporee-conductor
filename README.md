# Camporee Conductor Suite

**The Event Operating System for Offline Scout Competitions**

The **Camporee Conductor Suite** (formerly Coyote Collator) is a specialized software ecosystem designed to plan, run, and score large-scale Scouting competitions in environments with **zero internet access**.

It replaces paper score sheets and complex Excel spreadsheets with a robust, offline-first digital workflow.

---

## 🏗️ The Architecture: "The Camporee Conductor Compendium"

The suite is composed of four distinct modules that handle the entire event lifecycle:

### 1. 🎼 Camporee Composer (The Architect)
* **Role:** Pre-Production Design Tool.
* **Function:** A drag-and-drop visual editor where you define the games, rules, scoring inputs, and penalties.
* **Output:** Generates a portable `CamporeeConfig.zip` cartridge containing the entire event definition.
* **Location:** Runs on Port `3001`.

### 2. 🦋 Camporee Collector (The Field Agent)
* **Role:** Judge's Interface (PWA).
* **Function:** The lightweight, offline-first Progressive Web App used by Judges in the field.
* **Workflow:** Judges "Load" the config at HQ, walk to the woods to "Collect" scores (stored in `localStorage`), and return to HQ to "Sync."
* **Location:** Served via the Runtime Server (Port `3000`).

### 3. 🎻 Camporee Collator (The Command Center)
* **Role:** Administration Dashboard.
* **Function:** The central hub where scores land. The Event Director uses this to:
    * Manage the Roster (Troops/Patrols).
    * Monitor incoming data streams in real-time.
    * "Collate" raw data into the Master Leaderboard.
    * Generate Awards and Ribbons.
* **Location:** Served via the Runtime Server (Port `3000`).

### 4. 🏛️ Camporee Curator (The Librarian - to be implemented)
* **Role:** Archives & Templates (Roadmap).
* **Function:** A repository for preserving past event data and maintaining a library of standard Game Templates (e.g., "Standard Knot Relay") to speed up future event design.

---

## 🚀 Quick Start

### Prerequisites
* **Docker Desktop** (Required)
* (Windows Users) Ensure you are running in **WSL2** mode.

### Installation & Launch

1.  **Start the Suite:**
    ```bash
    docker compose up --build -d
    ```

2.  **Access the Applications:**
    * **The Composer (Design):** `http://localhost:3001`
    * **The Runtime (Collect/Collate):** `http://localhost:3000`

---

## 🔄 The "Mule Strategy" Workflow

1.  **Compose:** Use the **Composer** to build your event schema and export the `CamporeeConfig.zip`.
2.  **Setup:** Upload the zip file and your Roster CSV to the **Collator** dashboard.
3.  **Collect:**
    * Judges scan a QR code at HQ to load the **Collector** app.
    * They go offline to the field and score games.
    * They return to Wi-Fi range to sync data.
4.  **Collate:** The server aggregates scores, handles weighted logic, and produces the final Leaderboard.

---

## 🛠️ Tech Stack

* **Infrastructure:** Docker Compose (Node:20-Alpine)
* **Frontend:** Vanilla JS (ES Modules) with a **Shared Core Architecture**.
* **Backend:** Node.js (Express)
* **Database:** SQLite (via `better-sqlite3`) using a JSON-column strategy for flexible schema storage.
* **Offline Storage:** `localStorage` + Service Workers.

## 📂 Project Structure

* `camporee/`: Default storage for event configurations and game definitions.
* `public/js/core/`: **Shared Library.** Contains schema definitions and UI rendering logic used by both Composer and Collector.
* `composer_server.js`: The Design server.
* `server.js`: The Runtime server (hosting Collector & Collator).
* `scripts/`: Automation utilities and Playwright tests.

---

## 📜 License

MIT License - Free for use by any Scouting unit.