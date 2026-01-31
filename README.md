# Coyote Collator

**A Local-First Scoring System for Scout Camporees**

Coyote Collator is a Progressive Web App (PWA) designed to digitize scoring for large-scale scouting competitions in remote environments with **zero internet access**.

## 🏗 Architecture: "The Mule Strategy"

This application uses a "Load, Go, Sync" workflow to handle remote data collection:

1.  **The Mule (Server):** A laptop running a local Docker container acts as the central server. It broadcasts a local WiFi network (no internet).
2.  **The Load (Online):** Judges connect to the WiFi at HQ. The PWA downloads the Roster and Game Configuration (`games.json`) to the device's `localStorage`.
3.  **The Field (Offline):** Judges disconnect and walk to their stations. Scores are saved locally to the device.
4.  **The Sync (Re-connect):** When judges return to HQ range, the app detects the connection and flushes stored scores to the SQLite database.

## 🛠 Tech Stack

* **Infrastructure:** Docker & Docker Compose (Node:20-Alpine)
* **Backend:** Node.js (Express) + `better-sqlite3`
* **Database:** SQLite (using a JSON column strategy for flexible scoring schemas)
* **Frontend:** Vanilla JS PWA (No frameworks, local caching via Service Worker)

## 🚀 Quick Start

### Prerequisites
* Docker Desktop
* VS Code
* (Windows Users) Ensure you are running in **WSL2** mode.

### Installation

1.  **Start the System:**
    ```bash
    docker-compose up --build -d
    ```
2.  **Access the App:**
    Open `http://localhost:3000` in your browser.
3.  **Verify Data Persistence:**
    Ensure the `./data` folder is created on your host machine.

## 📂 Project Structure

* `server.js`: Node.js Express server with SQLite backend. The API handling sync and CSV export.
* `public/`: Frontend PWA assets (HTML, CSS, JS).
* `config/games/`: JSON configuration files for each game station.
* `scripts/`: Utilities for importing Rosters and seeding data.
* `scripts/demo/`: Playwright automation scripts for walkthroughs and testing.
* `docker-compose.yml`: Maps port 3000 and mounts the `./data` volume.
* `data/`: Persistent storage for SQLite database (mounted by Docker).

## 🎭 Demo & Walkthrough Automation

The project includes Playwright-based scripts to automate data entry and system demonstrations at "Human Speed".

### Prerequisites
* Node.js installed locally.
* Install dependencies: `npm install`
* Install Playwright browsers: `npx playwright install chromium`

### Running the Walkthroughs

1.  **Seed the Roster:**
    Automatically register all Troops and Patrols defined in your config.
    ```bash
    # Headless (Fast)
    node scripts/demo/seed-roster.cjs

    # Interactive (Human Speed)
    node scripts/demo/seed-roster.cjs --interactive --wait=2
    ```

2.  **Simulate Scoring:**
    Run scoring scripts for specific games (e.g., `p1`, `p2`).
    ```bash
    node scripts/demo/score-p1.cjs --interactive --wait=1
    ```

### Interaction Controls (Interactive Mode)
*   **Skip Wait:** Press `Space` or `Enter` inside the browser window to skip the current delay and perform the next action immediately.
*   **Finish:** When the demo is complete, press `Space` or `Enter` to close the browser.

## 📝 License


## Usage Flow

1.  **Online (WiFi):** Open the app. It will automatically download the `games.json` config and the Roster (`entities`).
2.  **Offline (Field):** Go to a game station. Select the station and the Team (Patrol/Troop). Fill out the form.
3.  **Submit:** Scores are saved to the browser's storage.
4.  **Sync:** Return to WiFi range. Click "Sync Scores Now" to upload all offline data to the server.

## Admin

*   **Export Data:** Go to `http://localhost:3000/api/export` to download a CSV of all scores.


MIT License - Free for use by any Scouting unit.

