import { normalizeGameDefinition } from "../core/schema.js";
import { generateFieldHTML } from "../core/ui.js";
import { LibraryService } from "../core/library-service.js";
import { ApiClient } from "../core/api.js";

const SYSTEM_PRESETS = [
    { id: "p_flag", label: "Patrol Flag", type: "number", kind: "points", weight: 10, audience: "judge", config: { min: 0, max: 10, placeholder: "0-10 Points" } },
    { id: "p_yell", label: "Patrol Yell", type: "number", kind: "points", weight: 5, audience: "judge", config: { min: 0, max: 5, placeholder: "0-5 Points" } },
    { id: "p_spirit", label: "Scout Spirit", type: "number", kind: "points", weight: 10, audience: "judge", config: { min: 0, max: 10, placeholder: "0-10 Points" } },
    { id: "off_notes", label: "Judges Notes", type: "textarea", kind: "info", weight: 0, audience: "judge", config: { placeholder: "Issues, tie-breakers, etc." } },
    { id: "bracket_result", label: "Match Result", type: "text", kind: "info", weight: 0, audience: "judge", required: true, config: { placeholder: "Place:  1, 2, 3, 4....." } },
    { id: "final_rank", label: "Final Ranking", type: "select", kind: "info", weight: 0, audience: "admin", config: { options: ["1st Place", "2nd Place", "3rd Place", "4th Place", "Participant"] } },
    { id: "overall_points", label: "Overall Points", type: "number", kind: "points", weight: 1, audience: "admin", config: { placeholder: "e.g., 100, 90, 80..." } }
];

const composer = {
    serverMode: false,
    cachedCamporee: null,
    api: new ApiClient(),
    data: {
        meta: {
            camporeeId: null,
            title: "New Camporee",
            theme: "",
            year: new Date().getFullYear(),
            director: ""
        },
        games: []
    },
    presets: JSON.parse(JSON.stringify(SYSTEM_PRESETS)),
    activeGameId: null,
    pendingImportGames: [],
    dragSrcGameId: null,
    libraryCatalog: null,

    init: async function () {
        console.log("Composer App Initialized");
        const libService = new LibraryService();
        try {
            this.libraryCatalog = await libService.getCatalog();
            this.renderLibrary(this.libraryCatalog);
        } catch (e) {
            console.warn("Library Catalog failed to load:", e);
            const statusEl = document.getElementById("library-status");
            if (statusEl) {
                statusEl.innerHTML = '<span class="text-danger">Failed to load library</span>';
            }
        }

        this.serverMode = await this.api.getStatus();
        this.setupDynamicTabs();
        this.injectModals();
        this.bindGlobalEvents();

        if (!this.data.meta.camporeeId) {
            this.data.meta.camporeeId = this.generateUUID();
        }

        this.renderServerControls();
        this.renderGameLists();
    },

    bindGlobalEvents: function () {
        const fileInput = document.getElementById("fileInput");
        if (fileInput) {
            fileInput.addEventListener("change", (e) => this.handleCamporeeImport(e));
        }

        const importGameInput = document.createElement("input");
        importGameInput.type = "file";
        importGameInput.id = "importGameInput";
        importGameInput.accept = ".json,.zip";
        importGameInput.style.display = "none";
        importGameInput.addEventListener("change", (e) => this.handleGameImport(e));
        document.body.appendChild(importGameInput);

        ["metaTitle", "metaTheme"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("input", (e) => {
                    const key = id === "metaTitle" ? "title" : "theme";
                    this.data.meta[key] = e.target.value;
                });
            }
        });
    },

    generateUUID: function () {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    ensureSystemPresets: function () {
        SYSTEM_PRESETS.forEach(sys => {
            if (!this.presets.find(p => p.id === sys.id)) {
                console.log(`[System] Injecting missing preset: ${sys.id}`);
                this.presets.push(JSON.parse(JSON.stringify(sys)));
            }
        });
    },

    renderServerControls: function () {
        if (!this.serverMode) return;

        const container = document.querySelector(".d-flex.gap-2");
        if (container) {
            const existing = document.getElementById("server-controls");
            if (existing) existing.remove();

            const group = document.createElement("div");
            group.id = "server-controls";
            group.className = "btn-group ms-2";
            group.innerHTML = `
                <button class="btn btn-outline-light" onclick="composer.initiateServerSave()" title="Save to Server">
                    <i class="fas fa-cloud-upload-alt"></i> Save
                </button>
                <button class="btn btn-outline-light" onclick="composer.openServerLoadModal()" title="Load from Server">
                    <i class="fas fa-cloud-download-alt"></i> Load
                </button>
                <button class="btn btn-outline-light dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown"></button>
                <ul class="dropdown-menu">
                    <li><a class="dropdown-item" href="#" onclick="composer.duplicateCamporee()"><i class="fas fa-copy"></i> Duplicate</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" onclick="composer.newCamporee()"><i class="fas fa-file"></i> New Empty</a></li>
                </ul>`;
            container.appendChild(group);
        }
    },

    openServerLoadModal: async function () {
        try {
            const list = await this.api.getCamporees();
            const listEl = document.getElementById("serverLoadList");

            if (list.length > 0) {
                listEl.innerHTML = list.map(c => `
                    <a href="#" class="list-group-item list-group-item-action" onclick="composer.loadFromServer('${c.id}')">
                        <div class="d-flex w-100 justify-content-between">
                            <h5 class="mb-1">${c.title || "Untitled"}</h5>
                            <small>${c.year}</small>
                        </div>
                        <p class="mb-1 small text-muted">${c.theme || "No theme"}</p>
                        <small class="text-muted">ID: ${c.id}</small>
                    </a>`).join("");
            } else {
                listEl.innerHTML = '<div class="p-3 text-center text-muted">No saved camporees.</div>';
            }

            new bootstrap.Modal(document.getElementById("serverLoadModal")).show();
        } catch (e) {
            alert("Server Error: Could not fetch list.");
        }
    },

    loadFromServer: async function (id) {
        if (!confirm("Load this? Unsaved changes will be lost.")) return;

        try {
            const camporee = await this.api.getCamporee(id);
            this.data.meta = camporee.meta;
            this.data.games = camporee.games || [];
            if (camporee.presets) {
                this.presets = camporee.presets;
            }

            if (!this.data.meta.camporeeId) {
                this.data.meta.camporeeId = id;
            }

            this.ensureSystemPresets();
            this.normalizeGameSortOrders();
            this.updateMetaUI();
            this.renderGameLists();
            this.renderPresetManager();

            bootstrap.Modal.getInstance(document.getElementById("serverLoadModal")).hide();
            alert("Loaded from Server!");
        } catch (e) {
            alert("Error: " + e.message);
        }
    },

    initiateServerSave: async function () {
        const id = this.data.meta.camporeeId;
        if (!id) {
            this.data.meta.camporeeId = this.generateUUID();
            this.executeSave();
            return;
        }

        try {
            const check = await this.api.getCamporeeMeta(id);
            if (check.exists) {
                document.getElementById("overwriteServerTitle").innerText = check.meta.title;
                document.getElementById("overwriteServerTheme").innerText = check.meta.theme;
                document.getElementById("overwriteClientTitle").innerText = this.data.meta.title;
                document.getElementById("overwriteClientTheme").innerText = this.data.meta.theme;
                new bootstrap.Modal(document.getElementById("overwriteModal")).show();
            } else {
                this.executeSave();
            }
        } catch (e) {
            alert("Server Check Failed. Is server online?");
        }
    },

    executeSave: async function () {
        const id = this.data.meta.camporeeId;
        const payload = {
            meta: this.data.meta,
            games: this.data.games,
            presets: this.presets
        };

        try {
            const result = await this.api.saveCamporee(id, payload);

            const modalEl = document.getElementById("overwriteModal");
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            if (result.success) {
                alert("Saved Successfully!");
            } else {
                alert("Error: " + result.error);
            }
        } catch (e) {
            alert("Save Failed: Network Error");
        }
    },

    duplicateCamporee: function () {
        if (confirm("Duplicate this Camporee?")) {
            this.data.meta.camporeeId = this.generateUUID();
            this.data.meta.title += " (Copy)";
            this.updateMetaUI();
            alert("Duplicated! working on a copy.");
        }
    },

    setupDynamicTabs: function () {
        const navTabs = document.querySelector(".nav-tabs");
        const tabContent = document.querySelector(".tab-content");
        if (!navTabs || !tabContent) return;

        let libTab = document.getElementById("library-tab") ||
            navTabs.children[1]?.querySelector("button");
        let libPane = document.getElementById("library-pane") ||
            tabContent.children[1];

        if (libTab && libTab.innerText.includes("Library")) {
            libTab.id = "patrol-tab";
            libTab.innerText = "Patrol Games";
            libTab.setAttribute("data-bs-target", "#patrol-pane");

            libPane.id = "patrol-pane";
            libPane.innerHTML = `
                <div id="patrolList" class="list-group p-3"></div>
                <div class="p-3">
                    <button class="btn btn-primary w-100" onclick="composer.addGame('patrol')">
                        <i class="fas fa-plus-circle"></i> Add Patrol Game
                    </button>
                </div>`;

            if (!document.getElementById("troop-tab")) {
                const patrolItem = document.getElementById("patrol-tab")?.parentElement;
                if (patrolItem) {
                    const li = document.createElement("li");
                    li.className = "nav-item";
                    li.innerHTML = '<button class="nav-link" id="troop-tab" data-bs-toggle="tab" data-bs-target="#troop-pane" type="button">Troop Events</button>';
                    navTabs.insertBefore(li, patrolItem.nextSibling);
                }

                const patrolPane = document.getElementById("patrol-pane");
                if (patrolPane) {
                    const pane = document.createElement("div");
                    pane.className = "tab-pane fade";
                    pane.id = "troop-pane";
                    pane.innerHTML = `
                        <div id="troopList" class="list-group p-3"></div>
                        <div class="p-3">
                            <button class="btn btn-success w-100" onclick="composer.addGame('troop')">
                                <i class="fas fa-calendar-plus"></i> Add Troop Event
                            </button>
                        </div>`;
                    tabContent.insertBefore(pane, patrolPane.nextSibling);
                }
            }
        }

        if (!document.getElementById("presets-tab")) {
            const li = document.createElement("li");
            li.className = "nav-item";
            li.innerHTML = '<button class="nav-link" id="presets-tab" data-bs-toggle="tab" data-bs-target="#presets-pane" type="button">Presets</button>';
            navTabs.appendChild(li);

            const pane = document.createElement("div");
            pane.className = "tab-pane fade";
            pane.id = "presets-pane";
            pane.innerHTML = '<div id="presets-container" class="p-3"></div>';
            tabContent.appendChild(pane);

            document.getElementById("presets-tab").addEventListener("shown.bs.tab", () => this.renderPresetManager());
        }
    },

    injectModals: function () {
        const modals = [
            `<div class="modal fade" id="presetModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Insert Preset</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Choose Field</label>
                                <select class="form-select" id="presetSelect"></select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="composer.confirmInsertPreset()">Insert</button>
                        </div>
                    </div>
                </div>
            </div>`,
            `<div class="modal fade" id="importModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Import Games</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="list-group" id="importList"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-success" onclick="composer.confirmGameImport()">Import</button>
                        </div>
                    </div>
                </div>
            </div>`,
            `<div class="modal fade" id="serverLoadModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Load Server</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="list-group" id="serverLoadList"></div>
                        </div>
                    </div>
                </div>
            </div>`,
            `<div class="modal fade" id="overwriteModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content border-danger">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">Overwrite Warning</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>Overwrite existing ID?</p>
                            <div class="row text-center mb-3">
                                <div class="col-6 border-end">
                                    <h6 class="text-danger">Server</h6>
                                    <div id="overwriteServerTitle"></div>
                                    <div id="overwriteServerTheme"></div>
                                </div>
                                <div class="col-6">
                                    <h6 class="text-success">Client</h6>
                                    <div id="overwriteClientTitle"></div>
                                    <div id="overwriteClientTheme"></div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-danger" onclick="composer.executeSave()">Yes, Overwrite</button>
                        </div>
                    </div>
                </div>
            </div>`
        ];

        modals.forEach(html => {
            const div = document.createElement("div");
            div.innerHTML = html;
            const id = div.firstElementChild.id;
            if (!document.getElementById(id)) {
                document.body.insertAdjacentHTML("beforeend", html);
            }
        });
    },

    normalizeGameSortOrders: function () {
        const groups = { patrol: [], troop: [], exhibition: [] };

        this.data.games.forEach(g => {
            const type = g.type || "patrol";
            if (!groups[type]) groups[type] = [];
            groups[type].push(g);
        });

        Object.values(groups).forEach(list => {
            list.sort((a, b) => (a.sortOrder || Infinity) - (b.sortOrder || Infinity));
            list.forEach((g, i) => {
                g.sortOrder = (i + 1) * 10;
            });
        });
    },

    moveGame: function (srcId, targetId) {
        if (srcId === targetId) return;

        const srcGame = this.data.games.find(g => g.id === srcId);
        const targetGame = this.data.games.find(g => g.id === targetId);

        if (!srcGame || !targetGame || srcGame.type !== targetGame.type) return;

        const type = srcGame.type || "patrol";
        const group = this.data.games.filter(g => (g.type || "patrol") === type);

        group.sort((a, b) => a.sortOrder - b.sortOrder);

        const srcIndex = group.findIndex(g => g.id === srcId);
        const targetIndex = group.findIndex(g => g.id === targetId);

        group.splice(srcIndex, 1);
        group.splice(targetIndex, 0, srcGame);

        group.forEach((g, i) => {
            g.sortOrder = (i + 1) * 10;
        });

        this.renderGameLists();
    },

    newCamporee: function () {
        if (confirm("Start new Camporee?")) {
            this.data.games = [];
            this.data.meta = {
                camporeeId: this.generateUUID(),
                title: "New Camporee",
                theme: "",
                year: new Date().getFullYear()
            };
            this.activeGameId = null;
            this.updateMetaUI();
            this.renderGameLists();
            document.getElementById("editor-container").innerHTML = '<p class="text-muted">Select a game to edit.</p>';
        }
    },

    addGame: function (type = "patrol") {
        const id = `game_${Date.now()}`;
        const newGame = {
            id: id,
            type: type,
            enabled: true,
            bracketMode: false,
            match_label: "",
            content: {
                title: type === "patrol" ? "New Game" : "New Event",
                story: "",
                instructions: ""
            },
            scoring: {
                method: "points_desc",
                components: [
                    {
                        id: "score_1",
                        type: "number",
                        kind: "points",
                        label: "Points",
                        weight: 1,
                        audience: "judge",
                        sortOrder: 0
                    }
                ]
            }
        };

        this.data.games.push(newGame);
        this.normalizeGameSortOrders();
        this.renderGameLists();
        this.editGame(id);
    },

    duplicateGame: function (id) {
        const original = this.data.games.find(g => g.id === id);
        if (!original) return;

        const copy = JSON.parse(JSON.stringify(original));
        copy.id = `game_${Date.now()}`;
        copy.content.title += " (Copy)";

        if (copy.scoring.components) {
            copy.scoring.components.forEach(c => {
                c.id = `${c.kind}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            });
        }

        this.data.games.push(copy);
        this.normalizeGameSortOrders();
        this.renderGameLists();
        this.editGame(copy.id);
    },

    deleteGame: function (id) {
        if (confirm("Delete this game?")) {
            this.data.games = this.data.games.filter(g => g.id !== id);
            if (this.activeGameId === id) {
                this.activeGameId = null;
                document.getElementById("editor-container").innerHTML = '<p class="text-muted">Select a game to edit.</p>';
            }
            this.renderGameLists();
        }
    },

    updateMetaUI: function () {
        const titleEl = document.getElementById("metaTitle");
        const themeEl = document.getElementById("metaTheme");
        if (titleEl) titleEl.value = this.data.meta.title || "";
        if (themeEl) themeEl.value = this.data.meta.theme || "";
    },

    renderLibrary: function (catalog) {
        const listEl = document.getElementById("library-list");
        const statusEl = document.getElementById("library-status");

        if (listEl) {
            listEl.innerHTML = "";
            if (catalog && catalog.games) {
                catalog.games.forEach(game => {
                    const li = document.createElement("li");
                    li.className = "library-item px-3 py-2 border-bottom";
                    const tagsHtml = (game.tags || []).map(t =>
                        `<span class="badge bg-secondary me-1" style="font-size: 0.65rem;">${t}</span>`
                    ).join("");

                    li.innerHTML = `
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <span class="item-title d-block fw-bold">${game.title}</span>
                                <div class="item-tags mt-1">${tagsHtml}</div>
                            </div>
                            <div class="btn-group">
                                <button class="btn btn-sm btn-outline-primary" 
                                        onclick="event.stopPropagation(); composer.addGameFromLibrary('${game.path}')" 
                                        title="Add to Camporee">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>
    `;
                    // Log selection but don't automatically add/load on click
                    li.onclick = () => console.log("Selected Library Game:", game.id, game.path);
                    listEl.appendChild(li);
                });
                if (statusEl) statusEl.innerText = `${catalog.games.length} templates available`;
            } else {
                if (statusEl) statusEl.innerText = "Catalog empty";
            }
        }
    },

    async addGameFromLibrary(path) {
        console.log("Adding game from library:", path);
        const libService = new LibraryService();
        try {
            const template = await libService.getGame(path);
            const newId = this.generateUUID();

            const newGame = {
                id: newId,
                library_ref_id: template.id,
                enabled: true,
                type: template.type || (path.includes("troop") ? "troop" : "patrol"),
                sortOrder: (this.data.games.length + 1) * 10,
                schemaVersion: "2.9",
                content: {
                    title: template.meta?.title || template.base_title || "Untitled Game",
                    story: template.meta?.description || "",
                    instructions: template.meta?.instructions || ""
                },
                tags: template.tags || template.meta?.tags || [],
                scoring: {
                    method: "points_desc",
                    components: (template.scoring_model?.inputs || []).map(input => ({
                        id: input.id || this.generateUUID(),
                        label: input.label || "New Field",
                        type: input.type === "timer" ? "stopwatch" : (input.type || "number"),
                        kind: input.type === "timer" ? "metric" : "points",
                        weight: input.weight !== undefined ? input.weight : 1,
                        audience: "judge",
                        sortOrder: input.sortOrder || 0,
                        config: {
                            min: 0,
                            max: input.max_points || 0,
                            placeholder: input.placeholder || ""
                        }
                    }))
                },
                match_label: "",
                bracketMode: false,
                variants: template.variants ? JSON.parse(JSON.stringify(template.variants)) : []
            };

            this.data.games.push(newGame);
            this.normalizeGameSortOrders();
            this.renderGameLists();
            this.editGame(newId);
        } catch (e) {
            console.error("Failed to add game from library:", e);
            alert("Error adding game: " + e.message);
        }
    },

    renderGameLists: function () {
        const patrolList = document.getElementById("patrolList");
        const troopList = document.getElementById("troopList");
        const patrolCount = document.getElementById("patrolCount");
        const troopCount = document.getElementById("troopCount");

        if (!patrolList || !troopList) return;

        patrolList.innerHTML = "";
        troopList.innerHTML = "";

        let pCount = 0;
        let tCount = 0;

        if (this.data.games.length === 0) {
            patrolList.innerHTML = '<div class="text-center text-muted">No patrol games.</div>';
            troopList.innerHTML = '<div class="text-center text-muted">No troop events.</div>';
            if (patrolCount) patrolCount.innerText = "0";
            if (troopCount) troopCount.innerText = "0";
            return;
        }

        this.data.games.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        this.data.games.forEach(game => {
            const activeClass = game.id === this.activeGameId ? "active" : "";
            const statusClass = game.enabled ? "text-success" : "text-secondary";
            const isPatrol = !game.type || game.type === "patrol";
            const targetList = isPatrol ? patrolList : troopList;

            if (isPatrol) pCount++; else tCount++;

            const item = document.createElement("div");
            item.className = `list-group-item list-group-item-action d-flex align-items-center ${activeClass}`;
            item.draggable = true;

            // Drag Handlers
            item.ondragstart = (e) => {
                this.dragSrcGameId = game.id;
                e.dataTransfer.effectAllowed = "move";
                item.classList.add("opacity-50");
            };
            item.ondragend = (e) => {
                item.classList.remove("opacity-50");
                this.dragSrcGameId = null;
            };
            item.ondragover = (e) => {
                e.preventDefault();
            };
            item.ondrop = (e) => {
                e.preventDefault();
                if (this.dragSrcGameId) {
                    this.moveGame(this.dragSrcGameId, game.id);
                }
            };
            item.onclick = (e) => {
                e.preventDefault();
                this.editGame(game.id);
            };

            item.innerHTML = `
    < div class="me-3 text-muted" style = "cursor: grab;" > <i class="fas fa-grip-vertical"></i></div >
                <div class="flex-grow-1 text-truncate">
                    <strong>${game.content.title}</strong><br>
                    <small class="text-muted">${game.id}</small>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <i class="fas fa-circle ${statusClass} me-2" style="font-size: 0.5rem;"></i>
                    <button class="btn btn-sm btn-outline-secondary border-0" 
                            onclick="event.stopPropagation(); composer.exportSingleGame('${game.id}')">
                        <i class="fas fa-file-download"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary border-0" 
                            onclick="event.stopPropagation(); composer.duplicateGame('${game.id}')">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary border-0" 
                            onclick="event.stopPropagation(); composer.renderPreview('${game.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="event.stopPropagation(); composer.deleteGame('${game.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>`;

            targetList.appendChild(item);
        });

        if (patrolCount) patrolCount.innerText = pCount;
        if (troopCount) troopCount.innerText = tCount;
    },

    editGame: function (id) {
        this.activeGameId = id;
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;

        if (!game.type) game.type = "patrol";

        const editorTab = document.querySelector("#editor-tab");
        if (editorTab && window.bootstrap) {
            new bootstrap.Tab(editorTab).show();
        }

        const container = document.getElementById("editor-container");
        container.innerHTML = `
    < div class="card mb-4" >
                <div class="card-header bg-light"><h5 class="mb-0">Game Metadata</h5></div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8 mb-3">
                            <label class="form-label">Title</label>
                            <input type="text" class="form-control" id="gameTitle">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">ID</label>
                            <input type="text" class="form-control" id="gameId" readonly>
                        </div>
                    </div>
                    <div class="row border-bottom mb-3 pb-3">
                        <div class="col-12">
                            <label class="form-label text-muted">Instructions</label>
                            <textarea class="form-control" rows="1" id="gameInstructions" 
                                      placeholder="Judge-facing instructions..."></textarea>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Type</label>
                            <select class="form-select" id="gameType">
                                <option value="patrol">Patrol Competition</option>
                                <option value="troop">Troop Competition</option>
                                <option value="exhibition">Exhibition / Individual</option>
                            </select>
                        </div>
                        <div class="col-md-8 mb-3">
                            <label class="form-label">Premise</label>
                            <input type="text" class="form-control" id="gameStory">
                        </div>
                        <div class="col-12 mb-3">
                            <label class="form-label">Tags <small class="text-muted">(space or comma separated)</small></label>
                            <input type="text" class="form-control" id="gameTags" placeholder="#fire #knots #teamwork">
                        </div>
                    </div>
                    <div class="row border-top pt-3">
                         <div class="col-md-3 d-flex align-items-center">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="gameEnabled" ${game.enabled ? "checked" : ""}>
                                <label class="form-check-label fw-bold">Enabled</label>
                            </div>
                        </div>
                        <div class="col-md-4 d-flex align-items-center border-start">
                             <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="gameBracketMode" 
                                       ${game.bracketMode ? "checked" : ""} 
                                       onchange="composer.toggleBracketMode('${id}', this.checked)">
                                <label class="form-check-label fw-bold text-primary">Bracket Mode</label>
                            </div>
                        </div>
                        <div id="matchLabelContainer" class="col-md-5 border-start ${game.bracketMode ? "" : "d-none"}">
                             <div class="d-flex align-items-center gap-2">
                                <label class="form-label mb-0 small fw-bold text-muted" style="white-space:nowrap;">Match Term:</label>
                                <input type="text" class="form-control form-control-sm" id="gameMatchLabel" 
                                       list="matchLabelSuggestions" placeholder="e.g. Heat, War, Race">
                                <datalist id="matchLabelSuggestions">
                                    <option value="Match"><option value="Heat"><option value="Game">
                                    <option value="Race"><option value="Round"><option value="Pull">
                                    <option value="War"><option value="Bout">
                                </datalist>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Scoring Fields</h5>
                    <div class="d-flex align-items-center gap-3">
                         <small class="text-muted">Win Condition:</small>
                        <select class="form-select form-select-sm d-inline-block w-auto" id="gameScoringMethod">
                            <option value="points_desc">Highest Points</option>
                            <option value="timed_asc">Lowest Time</option>
                        </select>
                        <button class="btn btn-sm btn-outline-secondary" onclick="composer.renderPreview('${id}')" 
                                title="Preview Form">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="card-body bg-light">
                    <div id="scoring-editor" class="d-flex flex-column gap-3"></div>
                    <div class="mt-4 text-center">
                         <div class="btn-group shadow-sm">
                            <button class="btn btn-primary" onclick="composer.addGenericField('${id}', 'game')">
                                <i class="fas fa-plus-circle"></i> Add Field
                            </button>
                            <button class="btn btn-outline-primary" onclick="composer.openPresetModal('${id}')">
                                <i class="fas fa-magic"></i> Add Preset
                            </button>
                         </div>
                    </div>
                </div>
            </div>`;

        // Bind Inputs
        ["gameTitle", "gameId", "gameStory", "gameInstructions", "gameMatchLabel"].forEach(fieldId => {
            const key = fieldId === "gameId" ? "id" :
                fieldId === "gameTitle" ? "title" :
                    fieldId === "gameStory" ? "story" :
                        fieldId === "gameMatchLabel" ? "match_label" : "instructions";

            const el = document.getElementById(fieldId);
            if (el) {
                const val = (key === "id" || key === "match_label" ? game[key] : game.content[key]) || "";
                el.value = val;
                el.oninput = (e) => this.updateGameField(key, e.target.value);
            }
        });

        const tagsEl = document.getElementById("gameTags");
        if (tagsEl) {
            tagsEl.value = (game.meta?.tags || game.tags || []).join(" ");
            tagsEl.onchange = (e) => this.updateGameField("tags", e.target.value);
        }

        const typeEl = document.getElementById("gameType");
        typeEl.value = game.type;
        typeEl.onchange = (e) => {
            game.type = e.target.value;
            this.normalizeGameSortOrders();
            this.renderGameLists();
        };

        const methodEl = document.getElementById("gameScoringMethod");
        methodEl.value = game.scoring.method || "points_desc";
        methodEl.onchange = (e) => {
            game.scoring.method = e.target.value;
        };

        document.getElementById("gameEnabled").onchange = (e) => {
            game.enabled = e.target.checked;
            this.renderGameLists();
        };

        this.renderScoringInputs(game.scoring.components, game.id, "game");
    },

    updateGameField: function (field, value) {
        if (!this.activeGameId) return;
        const game = this.data.games.find(g => g.id === this.activeGameId);
        if (!game) return;

        if (field === "id") {
            game.id = value;
            this.activeGameId = value;
        } else if (field === "match_label") {
            game.match_label = value;
        } else if (field === "tags") {
            const tags = value.split(/[ ,]+/).map(t => t.trim()).filter(t => t.length > 0);
            if (!game.meta) game.meta = {};
            game.meta.tags = tags;
            if (game.content) game.content.tags = tags;
            game.tags = tags;
        } else {
            game.content[field] = value;
        }

        if (field === "title" || field === "id") {
            this.renderGameLists();
        }
    },

    toggleBracketMode: function (gameId, isEnabled) {
        const game = this.data.games.find(g => g.id === gameId);
        if (!game) return;

        game.bracketMode = isEnabled;
        const container = document.getElementById("matchLabelContainer");
        if (container) {
            if (isEnabled) container.classList.remove("d-none");
            else container.classList.add("d-none");
        }

        if (isEnabled) {
            ["bracket_result", "final_rank", "overall_points"].forEach(pid => {
                if (!game.scoring.components.find(c => c.id === pid)) {
                    let preset = this.presets.find(p => p.id === pid) ||
                        SYSTEM_PRESETS.find(p => p.id === pid);
                    if (preset) {
                        const copy = JSON.parse(JSON.stringify(preset));
                        if (pid === "bracket_result") {
                            copy.audience = "judge";
                            game.scoring.components.unshift(copy);
                        } else {
                            copy.audience = "admin";
                            game.scoring.components.push(copy);
                        }
                    }
                }
            });
        }
        this.renderScoringInputs(game.scoring.components, game.id, "game");
    },

    renderPresetManager: function () {
        const container = document.getElementById("presets-container");
        if (container) {
            container.innerHTML = `
                <div class="card">
                    <div class="card-header bg-light"><h5 class="mb-0">Preset Library</h5></div>
                    <div class="card-body bg-light">
                        <div id="preset-editor-list" class="d-flex flex-column gap-3"></div>
                        <div class="mt-4 text-center">
                            <button class="btn btn-primary" onclick="composer.addGenericField('global', 'preset_manager')">
                                <i class="fas fa-plus-circle"></i> Add Field
                            </button>
                        </div>
                    </div>
                </div>`;
            this.renderScoringInputs(this.presets, "global", "preset_manager");
        }
    },

    renderScoringInputs: function (components, contextId, contextType = "game") {
        const containerId = contextType === "preset_manager" ? "preset-editor-list" : "scoring-editor";
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = "";

        if (components && components.length !== 0) {
            components.forEach((comp, index) => {
                let borderClass = "border-success";
                if (comp.audience === "admin") borderClass = "border-info";
                else if (comp.kind === "penalty") borderClass = "border-danger";
                else if (comp.kind === "info") borderClass = "border-secondary";

                const card = document.createElement("div");
                card.className = `card border-start border-4 shadow-sm ${borderClass}`;
                card.draggable = true;
                card.dataset.index = index;

                const isSelect = comp.type === "select";

                card.innerHTML = `
                  <div class="card-body p-3 d-flex align-items-start">
                    <div class="me-3 mt-4 text-muted" style="cursor: grab;"><i class="fas fa-grip-vertical fa-lg"></i></div>
                    <div class="flex-grow-1 me-4">
                      <label class="form-label small text-muted fw-bold mb-1">Label</label>
                      <input type="text" class="form-control form-control-sm fw-bold mb-2" 
                             value="${comp.label || ""}" 
                             oninput="composer.updateComponent('${contextId}', ${index}, 'label', this.value, '${contextType}')">
                      <label class="form-label small text-muted fw-bold mb-1">Description</label>
                      <input type="text" class="form-control form-control-sm text-muted" 
                             value="${comp.config?.placeholder || ""}" 
                             oninput="composer.updateConfig('${contextId}', ${index}, 'placeholder', this.value, '${contextType}')">
                    </div>
                    <div class="d-flex flex-column gap-2 me-4" style="width: 340px;">
                      <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label small text-muted fw-bold mb-1">Type</label>
                            <select class="form-select form-select-sm" 
                                    onchange="composer.updateComponent('${contextId}', ${index}, 'type', this.value, '${contextType}')">
                                ${["number", "stopwatch", "text", "textarea", "checkbox", "select"]
                        .map(t => `<option value="${t}" ${comp.type === t ? "selected" : ""}>${t}</option>`)
                        .join("")}
                            </select>
                        </div>
                        <div class="col-6">
                            <label class="form-label small text-muted fw-bold mb-1">Kind</label>
                            <select class="form-select form-select-sm" 
                                    onchange="composer.handleKindChange('${contextId}', ${index}, this.value, '${contextType}')">
                                ${["points", "penalty", "metric", "info"]
                        .map(k => `<option value="${k}" ${comp.kind === k ? "selected" : ""}>${k}</option>`)
                        .join("")}
                            </select>
                        </div>
                      </div>
                      <div>
                          <label class="form-label small text-muted fw-bold mb-1">
                            ${isSelect ? "Options (Comma Separated)" : "Limits & Weight"}
                          </label>
                          ${isSelect ?
                        `<input type="text" class="form-control form-control-sm" 
                                      placeholder="Option A, Option B..." 
                                      value="${(comp.config?.options || []).join(", ")}" 
                                      onchange="composer.updateConfig('${contextId}', ${index}, 'options', this.value.split(',').map(s=>s.trim()), '${contextType}')">`
                        :
                        `<div class="input-group input-group-sm">
                                <span class="input-group-text text-muted">Min</span>
                                <input type="number" class="form-control" 
                                       value="${comp.config?.min || ""}" 
                                       onchange="composer.updateConfig('${contextId}', ${index}, 'min', this.value, '${contextType}')">
                                <span class="input-group-text text-muted">Max</span>
                                <input type="number" class="form-control" 
                                       value="${comp.config?.max || ""}" 
                                       onchange="composer.updateConfig('${contextId}', ${index}, 'max', this.value, '${contextType}')">
                                <span class="input-group-text fw-bold">Wgt</span>
                                <input type="number" class="form-control fw-bold" 
                                       value="${comp.weight !== undefined ? comp.weight : 0}" 
                                       onchange="composer.updateComponent('${contextId}', ${index}, 'weight', parseFloat(this.value), '${contextType}')">
                              </div>`}
                      </div>
                    </div>
                    <div class="d-flex flex-column align-items-end gap-3 mt-4" style="min-width: 110px;">
                      <div class="form-check form-switch text-end">
                        <input class="form-check-input float-end ms-2" type="checkbox" 
                               id="visSwitch${index}" 
                               ${comp.audience === "admin" ? "checked" : ""} 
                               onchange="composer.updateComponent('${contextId}', ${index}, 'audience', this.checked ? 'admin' : 'judge', '${contextType}')">
                        <label class="form-check-label small fw-bold text-muted d-block me-4">Official Only</label>
                      </div>
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" onclick="composer.duplicateComponent('${contextId}', ${index}, '${contextType}')">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="composer.deleteComponent('${contextId}', ${index}, '${contextType}')">
                            <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>`;

                // Drag Events for Components
                card.addEventListener("dragstart", (e) => {
                    this.dragSrcGameId = index; // Reuse this prop for component index
                    e.dataTransfer.effectAllowed = "move";
                    card.classList.add("opacity-50");
                });
                card.addEventListener("dragend", (e) => {
                    card.classList.remove("opacity-50");
                    this.dragSrcGameId = null;
                });
                card.addEventListener("dragover", (e) => {
                    e.preventDefault();
                });
                card.addEventListener("drop", (e) => {
                    e.preventDefault();
                    if (this.dragSrcGameId !== null) {
                        this.moveComponent(contextId, this.dragSrcGameId, index, contextType);
                    }
                });

                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<div class="alert alert-white text-center border">No fields defined. Add one below.</div>';
        }
    },

    addGenericField: function (contextId, contextType) {
        let list;
        if (contextType === "preset_manager") {
            list = this.presets;
        } else {
            const game = this.data.games.find(g => g.id === contextId);
            if (!game) return;
            if (!game.scoring.components) game.scoring.components = [];
            list = game.scoring.components;
        }

        list.push({
            id: `field_${Date.now()}`,
            label: "New Field",
            type: "number",
            kind: "points",
            weight: 1,
            audience: "judge",
            config: { min: 0, max: 10, placeholder: "" }
        });

        this.renderScoringInputs(list, contextId, contextType);
    },

    updateComponent: function (contextId, index, field, value, contextType = "game") {
        let list;
        if (contextType === "preset_manager") {
            list = this.presets;
        } else {
            const game = this.data.games.find(g => g.id === contextId);
            if (!game) return;
            list = game.scoring.components;
        }

        const comp = list[index];
        if (field === "weight") {
            comp.weight = parseFloat(value);
        } else {
            comp[field] = value;
        }

        if (field === "type") {
            this.renderScoringInputs(list, contextId, contextType);
        }
    },

    updateConfig: function (contextId, index, key, value, contextType = "game") {
        let list;
        if (contextType === "preset_manager") {
            list = this.presets;
        } else {
            const game = this.data.games.find(g => g.id === contextId);
            if (!game) return;
            list = game.scoring.components;
        }

        if (!list[index].config) list[index].config = {};

        if (key === "min" || key === "max") {
            list[index].config[key] = parseInt(value);
        } else {
            list[index].config[key] = value;
        }
    },

    handleKindChange: function (contextId, index, value, contextType = "game") {
        let list;
        if (contextType === "preset_manager") {
            list = this.presets;
        } else {
            const game = this.data.games.find(g => g.id === contextId);
            if (!game) return;
            list = game.scoring.components;
        }
        list[index].kind = value;
        this.renderScoringInputs(list, contextId, contextType);
    },

    deleteComponent: function (contextId, index, contextType = "game") {
        if (!confirm("Remove this field?")) return;

        let list;
        if (contextType === "preset_manager") {
            list = this.presets;
        } else {
            const game = this.data.games.find(g => g.id === contextId);
            if (!game) return;
            list = game.scoring.components;
        }

        list.splice(index, 1);
        this.renderScoringInputs(list, contextId, contextType);
    },

    duplicateComponent: function (contextId, index, contextType = "game") {
        let list;
        if (contextType === "preset_manager") {
            list = this.presets;
        } else {
            const game = this.data.games.find(g => g.id === contextId);
            if (!game) return;
            list = game.scoring.components;
        }

        const copy = JSON.parse(JSON.stringify(list[index]));
        copy.id = `copy_${Date.now()}`;
        copy.label += " (Copy)";
        list.splice(index + 1, 0, copy);

        this.renderScoringInputs(list, contextId, contextType);
    },

    moveComponent: function (contextId, srcIndex, destIndex, contextType = "game") {
        let list;
        if (contextType === "preset_manager") {
            list = this.presets;
        } else {
            const game = this.data.games.find(g => g.id === contextId);
            if (!game) return;
            list = game.scoring.components;
        }

        const [moved] = list.splice(srcIndex, 1);
        list.splice(destIndex, 0, moved);
        this.renderScoringInputs(list, contextId, contextType);
    },

    openPresetModal: function (contextId) {
        this.activeGameId = contextId;
        const select = document.getElementById("presetSelect");
        select.innerHTML = this.presets.map(p =>
            `<option value="${p.id}">${p.label}</option>`
        ).join("");

        new bootstrap.Modal(document.getElementById("presetModal")).show();
    },

    confirmInsertPreset: function () {
        const select = document.getElementById("presetSelect");
        const preset = this.presets.find(p => p.id === select.value);

        if (preset && this.activeGameId) {
            const game = this.data.games.find(g => g.id === this.activeGameId);
            if (!game) return;

            const copy = JSON.parse(JSON.stringify(preset));
            copy.id = `preset_${Date.now()}`;

            if (!game.scoring.components) game.scoring.components = [];
            game.scoring.components.push(copy);

            this.renderScoringInputs(game.scoring.components, game.id, "game");
        }
        bootstrap.Modal.getInstance(document.getElementById("presetModal")).hide();
    },

    renderPreview: function (id) {
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;

        const normalized = normalizeGameDefinition(game);
        const html = normalized.fields.map(f => generateFieldHTML(f)).join("");

        const body = document.getElementById("previewModalBody");
        const title = document.getElementById("previewModalTitle");

        if (body) body.innerHTML = html;
        if (title) title.innerText = "Preview: " + (game.content.title || "Game");

        if (window.bootstrap) {
            new bootstrap.Modal(document.getElementById("previewModal")).show();
        }
    },

    exportCamporee: function () {
        this.normalizeGameSortOrders();
        const zip = new JSZip();

        const playlist = [...this.data.games]
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map((g, i) => ({
                gameId: g.id,
                enabled: g.enabled,
                order: i + 1
            }));

        const camporeeConfig = {
            schemaVersion: "2.9",
            meta: this.data.meta,
            playlist: playlist
        };

        zip.file("camporee.json", JSON.stringify(camporeeConfig, null, 2));
        zip.file("presets.json", JSON.stringify(this.presets, null, 2));

        const gamesFolder = zip.folder("games");
        this.data.games.forEach(g => {
            const gameFile = {
                id: g.id,
                type: g.type,
                sortOrder: g.sortOrder,
                schemaVersion: "2.9",
                content: g.content,
                scoring: g.scoring,
                match_label: g.match_label || ""
            };
            if (g.bracketMode) gameFile.bracketMode = true;

            gamesFolder.file(`${g.id}.json`, JSON.stringify(gameFile, null, 2));
        });

        zip.generateAsync({ type: "blob" }).then(function (content) {
            saveAs(content, "CamporeeConfig.zip");
        });
    },

    handleCamporeeImport: function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            JSZip.loadAsync(evt.target.result).then(async (zip) => {
                const configStr = await zip.file("camporee.json").async("string");
                const config = JSON.parse(configStr);
                this.data.meta = config.meta;

                if (zip.file("presets.json")) {
                    const presetsStr = await zip.file("presets.json").async("string");
                    this.presets = JSON.parse(presetsStr);
                }

                this.data.games = [];
                const promises = [];

                zip.folder("games").forEach((path, file) => {
                    promises.push(file.async("string").then(s => JSON.parse(s)));
                });

                const loadedGames = await Promise.all(promises);

                loadedGames.forEach(g => {
                    const entry = config.playlist.find(p => p.gameId === g.id);
                    g.enabled = !!entry && entry.enabled;
                    if (entry && entry.order) {
                        g.sortOrder = entry.order * 10;
                    }

                    if (!g.scoring.components) g.scoring.components = [];
                    if (!g.type) g.type = "patrol";
                    g.bracketMode = !!g.bracketMode;
                    g.match_label = g.match_label || "";

                    this.data.games.push(g);
                });

                if (!this.data.meta.camporeeId) {
                    this.data.meta.camporeeId = this.generateUUID();
                }

                this.ensureSystemPresets();
                this.normalizeGameSortOrders();
                this.updateMetaUI();
                this.renderGameLists();

                this.activeGameId = null;
                document.getElementById("editor-container").innerHTML = '<p class="text-muted">Select a game to edit.</p>';
                alert("Camporee Loaded Successfully!");
            });
        };
        reader.readAsArrayBuffer(file);
    },

    exportSingleGame: function (id) {
        const game = this.data.games.find(g => g.id === id);
        if (game) {
            const blob = new Blob([JSON.stringify(game, null, 2)], { type: "application/json;charset=utf-8" });
            saveAs(blob, `${game.id}.json`);
        }
    },

    handleGameImport: function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        if (file.name.endsWith(".json")) {
            reader.onload = (evt) => {
                try {
                    const game = JSON.parse(evt.target.result);
                    game.id = `import_${Date.now()}`;
                    game.content.title += " (Imported)";
                    this.data.games.push(game);
                    this.normalizeGameSortOrders();
                    this.renderGameLists();
                    this.editGame(game.id);
                    alert("Game Imported!");
                } catch (err) {
                    alert("Invalid JSON");
                }
            };
            reader.readAsText(file);

        } else if (file.name.endsWith(".zip")) {
            reader.onload = (evt) => {
                JSZip.loadAsync(evt.target.result).then(async (zip) => {
                    this.pendingImportGames = [];
                    const promises = [];

                    zip.folder("games").forEach((path, file) => {
                        promises.push(file.async("string").then(s => {
                            try { return JSON.parse(s); } catch (e) { return null; }
                        }));
                    });

                    const results = await Promise.all(promises);
                    this.pendingImportGames = results.filter(g => g !== null);

                    const listEl = document.getElementById("importList");
                    listEl.innerHTML = this.pendingImportGames.map((g, i) => `
                        <label class="list-group-item d-flex gap-2">
                            <input class="form-check-input flex-shrink-0" type="checkbox" value="${i}" checked>
                            <span>
                                <strong>${g.content?.title || g.id}</strong><br>
                                <small class="text-muted">${g.type || "patrol"}</small>
                            </span>
                        </label>`).join("");

                    new bootstrap.Modal(document.getElementById("importModal")).show();
                });
            };
            reader.readAsArrayBuffer(file);
        }
    },

    confirmGameImport: function () {
        const checkboxes = document.querySelectorAll("#importList input:checked");
        checkboxes.forEach(cb => {
            const index = parseInt(cb.value);
            const game = JSON.parse(JSON.stringify(this.pendingImportGames[index]));
            game.id = `import_${Date.now()}_${cb.value}`;
            this.data.games.push(game);
        });

        this.normalizeGameSortOrders();
        this.renderGameLists();
        bootstrap.Modal.getInstance(document.getElementById("importModal")).hide();
    }
};

window.composer = composer;
window.onload = function () {
    composer.init();
};