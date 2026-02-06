# Camporee Conductor Suite

**The Complete Operating System for Offline Scout Events**

The **Camporee Conductor Suite** (formerly Coyote Collator) is a specialized software ecosystem designed to plan, run, and score large-scale Scouting competitions in environments with **zero internet access**.

It replaces paper score sheets and complex Excel spreadsheets with a robust, offline-first digital workflow.

---

## 🏗️ The Architecture: "The Camporee Suite"

The system is split into three distinct tools that handle the entire event lifecycle:

### 1. 🎼 Camporee Composer (The Designer)
* **Role:** The "Pre-Production" Tool.
* **Function:** A drag-and-drop visual editor where you define the games, rules, scoring inputs, and penalties.
* **Output:** Generates a portable `CamporeeConfig.zip` cartridge containing the entire event definition.
* **Tech:** Runs on a separate port (3001) to keep design logic isolated from runtime.

### 2. 🎻 Camporee Collator (The Runtime Engine)
* **Role:** The "Field" Tool (PWA).
* **Function:** The offline Progressive Web App used by Judges in the field. It loads the configuration, captures scores, and queues them locally on the device.
* **The "Mule" Strategy:** Devices connect to the server at HQ to "Load" the config, go offline to the field to "Score," and return to HQ to "Sync."

### 3. 🎩 Camporee Conductor (The Dashboard)
* **Role:** The "Mission Control" Tool.
* **Function:** The administration panel for the Event Chair. It handles Roster management (Patrols/Troops), QR Code generation for judges, and real-time leaderboard calculation.

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
    * **The Designer (Composer):** Open `http://localhost:3001`
    * **The Runtime (Collator/Conductor):** Open `http://localhost:3000`

---

## 🔄 The Workflow

### Phase 1: Design (The Composer)
1.  Open **Camporee Composer** (`:3001`).
2.  Create a new Camporee.
3.  Add games (e.g., "Knot Tying", "Fire Building") and define their scoring fields (Stopwatch, Points, Penalties).
4.  **Preview** your forms using the "Eye" icon to see exactly what Judges will see.
5.  Click **Export Zip** to download your `CamporeeConfig.zip`.

### Phase 2: Setup (The Conductor)
1.  Open **Camporee Conductor** (`:3000/admin.html`).
2.  Go to **System Setup**.
3.  Upload your `CamporeeConfig.zip`.
4.  Upload your Roster CSV (Troops and Patrols).

### Phase 3: Execution (The Collator)
1.  **Judges** connect their devices to your local network.
2.  They visit `http://YOUR_SERVER_IP:3000`.
3.  The app automatically downloads the configuration and roster for offline use.
4.  Judges go to the field, score games, and return later to sync.

---

## 🛠️ Tech Stack

* **Infrastructure:** Docker Compose (Node:20-Alpine)
* **Frontend:** Vanilla JS (ES Modules) with a **Shared Core Architecture**.
    * *Note:* The Logic (`schema.js`) and UI (`ui.js`) are shared between the Designer and Runtime to ensure "What You Design Is What You Get."
* **Backend:** Node.js (Express)
* **Database:** SQLite (via `better-sqlite3`) using a JSON-column strategy for flexible schema storage.
* **Offline Storage:** `localStorage` + Service Workers.

## 📂 Project Structure

* `public/js/core/`: **Shared Library.** Contains the Schema definitions and UI rendering logic used by both apps.
* `public/js/designer/`: Logic specific to the Composer tool.
* `server.js`: The Runtime server (Collator/Conductor).
* `designer_server.js`: The Design server (Composer).
* `data/`: Persistent storage for the SQLite database and uploaded Camporee files.

---

## 📜 License

MIT License - Free for use by any Scouting unit.