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
* `games.json`: The "Form Builder" configuration file defining scoring rules.
* `scripts/`: Utilities for importing Rosters and seeding data.
* `docker-compose.yml`: Maps port 3000 and mounts the `./data` volume.
* `data/`: Persistent storage for SQLite database (mounted by Docker).

## 📝 License


## Usage Flow

1.  **Online (WiFi):** Open the app. It will automatically download the `games.json` config and the Roster (`entities`).
2.  **Offline (Field):** Go to a game station. Select the station and the Team (Patrol/Troop). Fill out the form.
3.  **Submit:** Scores are saved to the browser's storage.
4.  **Sync:** Return to WiFi range. Click "Sync Scores Now" to upload all offline data to the server.

## Admin

*   **Export Data:** Go to `http://localhost:3000/api/export` to download a CSV of all scores.


MIT License - Free for use by any Scouting unit.

