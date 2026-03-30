Project Handover: Camporee Conductor Suite
⚜️ The Mission (Domain Context)
Camporee Conductor is a digital ecosystem for Scouting America (BSA) skill competitions.

The Problem: Traditional "Camporees" rely on paper scorecards, which are slow, error-prone, and lack thematic immersion.

The Solution: A "Digital Cartridge" system where an entire event's rules, scoring logic, and thematic narrative are packaged into a single, portable ZIP file.

The Core User: Jim Willey (Lead Architect/Director), a veteran Scout leader building this as a professional portfolio "reboot."

🏗️ The Three-Pillar Architecture
The suite is divided into three distinct applications that share a unified JSON schema:

The Curator (Librarian):

Purpose: Manages the Master Library of generic scout games (e.g., Fire Building, Knots).

Key Feature: "Functional Variants" (e.g., a Fire game with a 'Friction' variant vs. a 'Match' variant).

The Composer (Director):

Purpose: The event-building tool. Users import generic games, apply a Theme (e.g., Circus, Space, Vikings), and "Embellish" the content using AI.

Output: Generates the Camporee Cartridge (a ZIP containing camporee-instance.json and associated assets).

The Collator (Scoreboard & Judge Client):

Purpose: The live-event server. It "unpacks" the cartridge to provide mobile-first Judge Views for data entry and real-time Official Leaderboards.

📄 The Data "Source of Truth" (Schemas)
The application is Schema-First. Every action must validate against these files:

game.schema.json: The container for a game, including its Source Snapshot (a frozen copy of the generic version for comparison/revert).

content.schema.json: The human-readable narrative (Legend, Quest, Briefing, Rules).

scoring.schema.json: The mathematical logic (Points, Stopwatches, Weights).

camporee-instance.schema.json: The high-level event metadata (Council, Dates, Location, Theme).

✨ Current State & AI Integration
Thematic Embellishment: The Composer uses a Step-wise AI Workflow. First, it embellishes a "Theme" into a "Welcome Introduction." Then, it uses that intro as a creative "North Star" to rewrite individual games.

The AI Loop: Users can provide feedback to the AI to "reign in" descriptions or add specific nomenclature (e.g., naming a rope a "Liana Vine" in an African Safari theme).

UI/UX Status: The app uses Bootstrap 5 and CSS Variables. We are currently moving away from "standard/blah" layouts toward a Configurable Design System where the theme colors (Primary, Accent, Background) are stored in the JSON and injected at runtime.

🛠 Technical Stack
Backend: Node.js, Express, EJS (templating).

Frontend: Vanilla ES6 JavaScript, Bootstrap, CSS Variables.

Storage: Flat-file JSON, SQLite (for specific persistence), and Docker-based containerization.

Environment: Development occurs in WSL: Ubuntu with terser for minification.

🚩 Critical Guardrails for the Agent
Zero-Inference Data Integrity: Never strip metadata (IDs, weights, config) during save/load operations.

Scout-Appropriate: All AI-generated content must be G-rated, age-appropriate (11–17), and reflect the values of the Scout Oath and Law.

Variable-First CSS: Do not hardcode hex colors. Always use the --theme-primary style variables to support on-the-fly thematic skinning.

Middleware Sanitization: The Collator must "strip" internal metadata (like source_snapshot) before serving data to the Judge’s client app to keep payloads light.

Next Step for New Agent:
"Please audit the existing views/composer/index.ejs and the schemas/ directory. Once you have internalized the relationship between the Source Snapshot and the Active Content, propose a plan to implement the Thematic CSS Variable Picker in the Event Details accordion."