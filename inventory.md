# Workspace JSON & ZIP Inventory (Updated)

Based on the latest audit of the current workspace (`camporee-conductor`), here is the up-to-date inventory of all `.json` and `.zip` files, organized by their usage and status within the Curator, Composer, and Collator applications.

## 1. Camporee Instances (`/camporee/`)
This directory holds specific Camporee "instances" (blueprints built using the Composer, loaded by the Collator).

### Active Instance (`/camporee/active/`)
**Status:** **IN USE**
**Explanation:** This acts as the single source of truth for the currently running or edited event. The `collator-server.js` explicitly hardcodes this directory (`const ACTIVE_DIR = path.join(__dirname, 'camporee', 'active')`) to load event data.
*   `camporee.json` - The main manifest and playlist for the active event.
*   `presets.json` - The scoring presets (points mapping) for the active event.
*   `games/*.json` (e.g., `p1.json`, `t1.json`) - The customized games configured for this active camporee. 
*   **Recommendation:** Do not delete. These may need to be migrated to newer schemas if they haven't been recently, but they are the live data.

*(Note: The old `/camporee/camp0001/` backup directory has been successfully cleaned up and removed.)*

---

## 2. Curator Game Library (`/public/library/games/`)
This directory holds the "master templates" used by the Curator to build games that can later be imported into a Camporee.

### Catalogs
*   `library-catalog.json`: **IN USE**. This is the modern, validated catalog index tracking all library components.
*   `catalog.json`: **DEPRECATED**. This is the old catalog format prior to the recent schema migration.
*   **Recommendation:** Safe to delete `catalog.json` once you confirm the Curator successfully loads `library-catalog.json`.

### Game Templates (`*_001.json`)
**Status:** **IN USE**
**Explanation:** These are the base templates (e.g., `p_Barrel_Raft_001.json`, `t_TugOWar_001.json`). 
*   **Recommendation:** Keep. However, you should audit these to ensure they successfully pass validation against the latest `game.schema.json`. Some may be using older structures.

---

## 3. Schemas (`/schemas/`)
**Status:** **IN USE**
**Explanation:** These define the data models across the entire application stack.
*   `camporee-catalog.schema.json`
*   `camporee-instance.schema.json`
*   `game.schema.json`
*   `library-catalog.schema.json`
*   `/definitions/content.schema.json`
*   `/definitions/scoring.schema.json`
*   **Recommendation:** Keep all. These are the current architectural standards.

*(Note: The old wireframe `/public/templates/proposed_content_schema.json` has been successfully cleaned up and removed.)*

---

## 4. Web/System Files
**Status:** **IN USE / DO NOT TOUCH**
**Explanation:** Standard system files required by Node.js or the browser.
*   `package.json` / `package-lock.json`
*   `/public/manifest.json` (PWA Manifest)
*   **Recommendation:** Keep.

---

## Summary of ZIP Files
**Zero `.zip` files were found.** 

## Outstanding Recommended Actions
1. **Delete** `/public/library/games/catalog.json` (Keep `library-catalog.json`).
2. **Migrate/Audit** the files inside `/camporee/active/` to ensure they conform to the new `camporee-instance.schema.json` and `active-game.schema.json` structure from our recent upgrades.
