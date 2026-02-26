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
    api: new ApiClient('/composer/api'),
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
        this.showPane('meta-pane', document.getElementById('btn-meta'));
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

    promptLoadWorkspace: async function () {
        const id = prompt("Enter Workspace Name/ID to load (e.g. camp0002):");
        if (!id) return;

        await this.loadFromServer(id);
    },

    loadFromServer: async function (id) {
        if (!confirm(`Load workspace '${id}'? Unsaved changes will be lost.`)) return;

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

            const loadModalEl = document.getElementById("serverLoadModal");
            if (loadModalEl) {
                const loadModal = bootstrap.Modal.getInstance(loadModalEl);
                if (loadModal) loadModal.hide();
            }
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

    showPane: function (paneId, btnElem) {
        document.querySelectorAll('.editor-pane').forEach(el => el.classList.add('d-none'));
        const pane = document.getElementById(paneId);
        if (pane) pane.classList.remove('d-none');

        if (btnElem) {
            document.querySelectorAll('.nav-pane-btn').forEach(b => b.classList.remove('active'));
            btnElem.classList.add('active');
        } else {
            document.querySelectorAll('.nav-pane-btn').forEach(b => b.classList.remove('active'));
        }

        if (paneId === 'presets-pane') {
            this.renderPresetManager();
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
            library_uuid: null, // "Bespoke" game
            library_title: type === "patrol" ? "New Game" : "New Event",
            game_title: type === "patrol" ? "New Game" : "New Event",
            type: type,
            enabled: true,
            bracketMode: false,
            match_label: "",
            tags: [],
            content: {
                camporee_uuid: this.data.meta.camporeeId,
                game_uuid: id,
                description: "",
                story: "",
                instructions: "",
                rules: [],
                supplies: []
            },
            scoring_model: {
                camporee_uuid: this.data.meta.camporeeId,
                game_uuid: id,
                method: "points_desc",
                inputs: [
                    {
                        id: "score_1",
                        label: "Points",
                        type: "number",
                        kind: "points",
                        weight: 1,
                        audience: "judge",
                        sortOrder: 0,
                        config: {
                            min: 0,
                            max: 10,
                            placeholder: ""
                        }
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
        copy.game_title += " (Copy)";

        if (copy.scoring_model.inputs) {
            copy.scoring_model.inputs.forEach(c => {
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
            if (catalog && catalog.components) {
                catalog.components.forEach(game => {
                    const li = document.createElement("li");
                    li.className = "library-item px-3 py-2 border-bottom";
                    const tagsHtml = (game.tags || []).map(t =>
                        `<span class="badge bg-secondary me-1" style="font-size: 0.65rem;">${t}</span>`
                    ).join("");

                    li.innerHTML = `
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <span class="item-title d-block fw-bold">${game.library_title || game.title || game.game_title || "Untitled"}</span>
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
                if (statusEl) statusEl.innerText = `${catalog.components.length} templates available`;
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
                library_uuid: template.library_uuid || template.id,
                library_title: template.library_title || template.base_title || template.content?.title || "Untitled",
                game_title: template.game_title || template.content?.title || template.base_title || "Untitled Game",
                type: template.type || (path.includes("troop") ? "troop" : "patrol"),
                enabled: true,
                category: template.category || "Teamwork",
                sortOrder: (this.data.games.length + 1) * 10,
                tags: template.tags || [],
                content: {
                    camporee_uuid: this.data.meta.camporeeId,
                    game_uuid: newId,
                    story: template.content?.story || template.content?.legend || "",
                    challenge: template.content?.challenge || template.content?.quest || template.content?.description || "",
                    description: template.content?.description || template.content?.briefing || template.content?.instructions || "",
                    rules: template.content?.rules || [],
                    time_and_scoring: template.content?.time_and_scoring || template.content?.scoring_overview || "",
                    scoring_notes: template.content?.scoring_notes || template.content?.judging_notes || "",
                    staffing: template.content?.staffing || template.content?.logistics?.staffing || "",
                    setup: template.content?.setup || template.content?.logistics?.setup || "",
                    reset: template.content?.reset || template.content?.logistics?.reset || "",
                    supplies: template.content?.supplies || template.content?.logistics?.supplies || template.content?.supplies || []
                },
                scoring_model: {
                    camporee_uuid: this.data.meta.camporeeId,
                    game_uuid: newId,
                    method: template.scoring_model?.method || "points_desc",
                    inputs: (template.scoring_model?.inputs || []).map(input => ({
                        id: input.id || this.generateUUID(),
                        label: input.label || "New Field",
                        type: input.type === "timer" ? "stopwatch" : (input.type || "number"),
                        kind: input.kind || "points",
                        weight: input.weight !== undefined ? input.weight : 1,
                        audience: input.audience || "judge",
                        sortOrder: input.sortOrder || 0,
                        config: input.config || { min: 0, max: 0, placeholder: "" }
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
                <div class="me-3 text-muted" style="cursor: grab;"><i class="fas fa-grip-vertical"></i></div>
                <div class="flex-grow-1 text-truncate">
                    <strong>${game.game_title || game.content?.title || "Untitled Game"}</strong><br>
                    <small class="text-muted">${game.content?.game_uuid || game.id}</small>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <i class="fas fa-circle ${statusClass} me-2" style="font-size: 0.5rem;"></i>
                    <button class="btn btn-sm btn-outline-secondary border-0" 
                            onclick="event.stopPropagation(); composer.duplicateGame('${game.id}')" title="Copy">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="event.stopPropagation(); composer.deleteGame('${game.id}')" title="Delete">
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

        this.showPane('editor-pane');

        const container = document.getElementById("editor-container");
        container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="mb-0">
            <i class="fas fa-edit"></i> <span id="headerTitle">${game.game_title || "Game Editor"}</span>
        </h4>
        <div class="d-flex flex-column align-items-end gap-2">
             <button class="btn btn-outline-primary btn-sm w-100 d-none" id="previewBtnTop" onclick="composer.renderGuidePreview('${id}')">
                 <i class="fas fa-eye"></i> Preview Guide
             </button>
        </div>
    </div>

    <ul class="nav nav-tabs mb-3" id="editorTabs" role="tablist">
        <li class="nav-item" role="presentation">
            <button class="nav-link active" id="meta-tab" data-bs-toggle="tab" data-bs-target="#meta" type="button" role="tab">Metadata</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="content-tab" data-bs-toggle="tab" data-bs-target="#content" type="button" role="tab">Game Guide</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="scoring-tab" data-bs-toggle="tab" data-bs-target="#scoring" type="button" role="tab">Scoring</button>
        </li>
    </ul>

    <div class="tab-content" id="editorTabsContent">
        <!-- METADATA TAB -->
        <div class="tab-pane fade show active" id="meta" role="tabpanel">
            <div class="card mb-4">
                <div class="card-body">
                    <div class="row">
                        <div class="col-12 mb-3">
                            <label class="form-label">Library UUID</label>
                            <input type="text" class="form-control bg-light" id="libraryId" value="${game.library_uuid || game.id || ""}" disabled readonly>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-12 mb-3">
                            <label class="form-label" title="Original unthemed name in catalog">Library Title <i class="fas fa-info-circle text-muted"></i></label>
                            <input type="text" class="form-control bg-light" id="libraryTitle" value="${game.library_title || ""}" disabled readonly>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-12 mb-3">
                            <label class="form-label" title="Themed display name for this instance">Game Title <i class="fas fa-info-circle text-muted"></i></label>
                            <input type="text" class="form-control fw-bold" id="gameTitle">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-5 mb-3">
                            <label class="form-label">Type</label>
                            <select class="form-select" id="gameType">
                                <option value="patrol">Patrol Competition</option>
                                <option value="troop">Troop Competition</option>
                                <option value="exhibition">Exhibition / Individual</option>
                            </select>
                        </div>
                        <div class="col-md-7 mb-3">
                            <label class="form-label">Tags <small class="text-muted">(space or comma separated)</small></label>
                            <input type="text" class="form-control" id="gameTags" placeholder="#fire #knots #teamwork">
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- GAME GUIDE TAB (Content) -->
        <div class="tab-pane fade" id="content" role="tabpanel">
            <div class="accordion accordion-flush border rounded mb-3 bg-white" id="gameGuideAccordion">
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingNarrative">
                        <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseNarrative">
                            <i class="fas fa-fw fa-book-open me-2 text-primary"></i> Narrative & Lore
                        </button>
                    </h2>
                    <div id="collapseNarrative" class="accordion-collapse collapse show" data-bs-parent="#gameGuideAccordion">
                        <div class="accordion-body bg-light pb-1">
                            <div class="mb-3">
                                <label class="form-label">Challenge (Objective)</label>
                                <input type="text" class="form-control" id="gameChallenge" placeholder="e.g. Boil water within 10 minutes" value="${game.content.challenge || ""}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Story (Thematic Lore)</label>
                                <textarea class="form-control" rows="6" id="gameStory" placeholder="Read this to the patrol...">${game.content.story || ""}</textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Description (Instructions)</label>
                                <textarea class="form-control" rows="6" id="gameDescription" placeholder="Specific instructions...">${game.content.description || ""}</textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingRules">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseRules">
                            <i class="fas fa-fw fa-gavel me-2 text-primary"></i> Rules
                        </button>
                    </h2>
                    <div id="collapseRules" class="accordion-collapse collapse" data-bs-parent="#gameGuideAccordion">
                        <div class="accordion-body bg-light pb-1">
                            <div id="rules-editor" class="list-editor mb-2"></div>
                            <button class="btn btn-sm btn-outline-secondary mb-3" onclick="composer.addListItem('rules')">
                                <i class="fas fa-plus"></i> Add Rule
                            </button>
                        </div>
                    </div>
                </div>

                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingJudging">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseJudging">
                            <i class="fas fa-fw fa-clipboard-check me-2 text-primary"></i> Scoring Notes & Criteria
                        </button>
                    </h2>
                    <div id="collapseJudging" class="accordion-collapse collapse" data-bs-parent="#gameGuideAccordion">
                        <div class="accordion-body bg-light pb-1">
                            <div class="mb-3">
                                <label class="form-label">Time & Scoring (Overview)</label>
                                <textarea class="form-control" rows="6" id="gameTimeAndScoring" placeholder="General explanation...">${game.content.time_and_scoring || ""}</textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Scoring Notes (Tips)</label>
                                <textarea class="form-control" rows="6" id="gameScoringNotes" placeholder="Tips for the judge...">${game.content.scoring_notes || ""}</textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingLogistics">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseLogistics">
                            <i class="fas fa-fw fa-boxes me-2 text-primary"></i> Logistics & Setup
                        </button>
                    </h2>
                    <div id="collapseLogistics" class="accordion-collapse collapse" data-bs-parent="#gameGuideAccordion">
                        <div class="accordion-body bg-light pb-1">
                            <div class="mb-3">
                                <label class="form-label">Staffing Requirements</label>
                                <textarea class="form-control" rows="6" id="gameStaffing">${game.content.staffing || ""}</textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Setup Instructions</label>
                                <textarea class="form-control" rows="6" id="gameSetup">${game.content.setup || ""}</textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Reset Instructions</label>
                                <textarea class="form-control" rows="6" id="gameReset">${game.content.reset || ""}</textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Supplies Needed (Text)</label>
                                <textarea class="form-control" rows="6" id="gameSuppliesText" placeholder="List of supplies...">${game.content.supplies_text || ""}</textarea>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- SCORING TAB -->
        <div class="tab-pane fade" id="scoring" role="tabpanel">
            <div class="card mb-3">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Match Configuration</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-3 d-flex align-items-center">
                            <div class="form-check form-switch text-success">
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
                        <button class="btn btn-sm btn-outline-secondary" onclick="composer.renderScoringPreview('${id}')" title="Judge View">
                            <i class="fas fa-mobile-alt"></i> Judge View
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
            </div>
        </div>
    </div>`;

        if (this.markdownEditors) {
            Object.values(this.markdownEditors).forEach(e => {
                if (e.toTextArea) e.toTextArea();
            });
        }
        this.markdownEditors = {};

        // Bind standard text Inputs
        ["gameTitle", "gameMatchLabel", "gameChallenge"].forEach(fieldId => {
            const key = fieldId === "gameTitle" ? "game_title" :
                fieldId === "gameMatchLabel" ? "match_label" : "challenge";

            const el = document.getElementById(fieldId);
            if (el) {
                let val = "";
                if (key === "match_label" || key === "game_title") {
                    val = game[key] || "";
                } else {
                    val = game.content[key] || "";
                }
                el.value = val;
                el.oninput = (e) => this.updateGameField(key, e.target.value);
            }
        });

        // Bind Markdown Editors
        ["gameStory", "gameDescription", "gameTimeAndScoring", "gameScoringNotes", "gameStaffing", "gameSetup", "gameReset", "gameSuppliesText"].forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if (el) {
                const key = fieldId === "gameStory" ? "story" :
                    fieldId === "gameDescription" ? "description" :
                        fieldId === "gameTimeAndScoring" ? "time_and_scoring" :
                            fieldId === "gameScoringNotes" ? "scoring_notes" :
                                fieldId === "gameStaffing" ? "staffing" :
                                    fieldId === "gameSetup" ? "setup" :
                                        fieldId === "gameReset" ? "reset" :
                                            "supplies_text";

                // Set initial value
                let val = game.content[key] || "";
                if (!val && ["staffing", "setup", "reset", "supplies_text"].includes(key)) {
                    val = game.content.logistics ? game.content.logistics[key] || "" : "";
                }
                el.value = val;

                if (window.EasyMDE) {
                    const mde = new EasyMDE({
                        element: el,
                        spellChecker: false,
                        status: false,
                        minHeight: "100px",
                        initialValue: val,
                        toolbar: ["bold", "italic", "heading", "|", "unordered-list", "ordered-list", "|", "link", "image", "upload-image", "|", "preview", "side-by-side", "fullscreen"],
                        uploadImage: true,
                        imageAccept: "image/png, image/jpeg, image/gif, image/webp",
                        imageUploadFunction: (file, onSuccess, onError) => {
                            if (!this.isServerMode || !this.data.meta.camporeeId) {
                                onError("Uploads only supported in Server Mode with a saved workspace.");
                                return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                                const b64 = reader.result.split(',')[1];
                                const ext = file.name.split('.').pop();
                                const filename = `img_${Date.now()}.${ext}`;
                                fetch(`/api/camporee/${this.data.meta.camporeeId}/assets/${filename}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ base64: b64 })
                                })
                                    .then(res => res.json())
                                    .then(data => {
                                        if (data.success) onSuccess(data.path);
                                        else onError(data.error || "Upload failed");
                                    })
                                    .catch(() => onError("Network Error"));
                            };
                            reader.readAsDataURL(file);
                        }
                    });

                    mde.codemirror.on("change", () => {
                        // Dynamic lookup to handle rapid clicks where `game` reference might be stale
                        this.updateGameField(key, mde.value());
                    });
                    this.markdownEditors[fieldId] = mde;

                    // Add event listeners to refresh the editor when its parent tab or accordion opens
                    const parentTab = el.closest('.tab-pane');
                    if (parentTab) {
                        const tabButton = document.querySelector(`button[data-bs-target="#${parentTab.id}"]`);
                        if (tabButton) {
                            tabButton.addEventListener('shown.bs.tab', () => {
                                mde.codemirror.refresh();
                            });
                        }
                    }
                    const parentCollapse = el.closest('.accordion-collapse');
                    if (parentCollapse) {
                        parentCollapse.addEventListener('shown.bs.collapse', () => {
                            mde.codemirror.refresh();
                        });
                    }

                } else {
                    // Fallback if CDN fails
                    el.oninput = (e) => this.updateGameField(key, e.target.value);
                }
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
        methodEl.value = game.scoring_model.method || "points_desc";
        methodEl.onchange = (e) => {
            game.scoring_model.method = e.target.value;
        };

        document.getElementById("gameEnabled").onchange = (e) => {
            game.enabled = e.target.checked;
            this.renderGameLists();
        };

        this.renderScoringInputs(game.scoring_model.inputs, game.id, "game");
        this.renderListEditor('rules', game.content.rules);

        // UI Tabs toggle for preview button
        const triggerTabs = document.querySelectorAll('#editorTabs button[data-bs-toggle="tab"]');
        triggerTabs.forEach(tab => {
            tab.addEventListener('shown.bs.tab', (event) => {
                const previewBtn = document.getElementById("previewBtnTop");
                if (previewBtn) {
                    if (event.target.id === 'meta-tab') {
                        previewBtn.classList.add('d-none');
                    } else if (event.target.id === 'scoring-tab') {
                        previewBtn.classList.remove('d-none');
                        previewBtn.innerHTML = '<i class="fas fa-mobile-alt"></i> Judge View';
                        previewBtn.onclick = () => composer.renderScoringPreview(id);
                    } else {
                        previewBtn.classList.remove('d-none');
                        previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview Guide';
                        previewBtn.onclick = () => composer.renderGuidePreview(id);
                    }
                }
            });
        });
    },

    renderListEditor: function (type, items) {
        const container = document.getElementById(`${type}-editor`);
        if (!container) return;

        container.innerHTML = "";
        (items || []).forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "input-group input-group-sm mb-1";
            row.innerHTML = `
                <input type="text" class="form-control" value="${item.replace(/"/g, '&quot;')}" 
                       oninput="composer.updateListItem('${type}', ${index}, this.value)">
                <button class="btn btn-outline-danger" onclick="composer.deleteListItem('${type}', ${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(row);
        });
    },

    addListItem: function (type) {
        if (!this.activeGameId) return;
        const game = this.data.games.find(g => g.id === this.activeGameId);
        if (!game) return;

        if (!game.content[type]) game.content[type] = [];
        game.content[type].push("");
        this.renderListEditor(type, game.content[type]);
    },

    updateListItem: function (type, index, value) {
        if (!this.activeGameId) return;
        const game = this.data.games.find(g => g.id === this.activeGameId);
        if (!game) return;

        if (game.content[type]) {
            game.content[type][index] = value;
        }
    },

    deleteListItem: function (type, index) {
        if (!this.activeGameId) return;
        const game = this.data.games.find(g => g.id === this.activeGameId);
        if (!game) return;

        if (game.content[type]) {
            game.content[type].splice(index, 1);
            this.renderListEditor(type, game.content[type]);
        }
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
        } else if (field === "game_title") {
            game.game_title = value;
            if (game.content) game.content.title = value; // Keep legacy sync for now just in case
        } else if (field === "tags") {
            const tags = value.split(/[ ,]+/).map(t => t.trim()).filter(t => t.length > 0);
            if (!game.meta) game.meta = {};
            game.meta.tags = tags;
            if (game.content) game.content.tags = tags;
            game.tags = tags;
        } else {
            game.content[field] = value;
        }

        if (field === "game_title" || field === "title" || field === "id") {
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
                if (!game.scoring_model.inputs.find(c => c.id === pid)) {
                    let preset = this.presets.find(p => p.id === pid) ||
                        SYSTEM_PRESETS.find(p => p.id === pid);
                    if (preset) {
                        const copy = JSON.parse(JSON.stringify(preset));
                        if (pid === "bracket_result") {
                            copy.audience = "judge";
                            game.scoring_model.inputs.unshift(copy);
                        } else {
                            copy.audience = "admin";
                            game.scoring_model.inputs.push(copy);
                        }
                    }
                }
            });
        }
        this.renderScoringInputs(game.scoring_model.inputs, game.id, "game");
    },

    renderPresetManager: function () {
        const container = document.getElementById("presets-container");
        if (container) {
            container.innerHTML = `
    < div class="card" >
                    <div class="card-header bg-light"><h5 class="mb-0">Preset Library</h5></div>
                    <div class="card-body bg-light">
                        <div id="preset-editor-list" class="d-flex flex-column gap-3"></div>
                        <div class="mt-4 text-center">
                            <button class="btn btn-primary" onclick="composer.addGenericField('global', 'preset_manager')">
                                <i class="fas fa-plus-circle"></i> Add Field
                            </button>
                        </div>
                    </div>
                </div > `;
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
                card.className = `card border - start border - 4 shadow - sm ${borderClass} `;
                card.draggable = true;
                card.dataset.index = index;

                const isSelect = comp.type === "select";

                card.innerHTML = `
    < div class="card-body p-3 d-flex align-items-start" >
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
                  </div > `;

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
            if (!game.scoring_model.inputs) game.scoring_model.inputs = [];
            list = game.scoring_model.inputs;
        }

        list.push({
            id: `field_${Date.now()} `,
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
            list = game.scoring_model.inputs;
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
            list = game.scoring_model.inputs;
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
            list = game.scoring_model.inputs;
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
            list = game.scoring_model.inputs;
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
            list = game.scoring_model.inputs;
        }

        const copy = JSON.parse(JSON.stringify(list[index]));
        copy.id = `copy_${Date.now()} `;
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
            list = game.scoring_model.inputs;
        }

        const [moved] = list.splice(srcIndex, 1);
        list.splice(destIndex, 0, moved);
        this.renderScoringInputs(list, contextId, contextType);
    },

    openPresetModal: function (contextId) {
        this.activeGameId = contextId;
        const select = document.getElementById("presetSelect");
        select.innerHTML = this.presets.map(p =>
            `< option value = "${p.id}" > ${p.label}</option > `
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
            copy.id = `preset_${Date.now()} `;

            if (!game.scoring_model.inputs) game.scoring_model.inputs = [];
            game.scoring_model.inputs.push(copy);

            this.renderScoringInputs(game.scoring_model.inputs, game.id, "game");
        }
        bootstrap.Modal.getInstance(document.getElementById("presetModal")).hide();
    },

    renderScoringPreview: function (id) {
        const game = this.data.games.find(g => g.id === (id || this.activeGameId));
        if (!game) return;

        const normalized = normalizeGameDefinition(game);
        const html = normalized.fields.map(f => generateFieldHTML(f)).join("");

        const modalBody = document.getElementById("previewModalBody");
        const modalTitle = document.getElementById("previewModalTitle");
        const dialog = document.getElementById("previewModalDialog");

        if (dialog) dialog.style.maxWidth = '400px';

        if (modalBody) modalBody.innerHTML = `< div class="p-2" > ${html}</div > `;
        if (modalTitle) modalTitle.innerText = "Judge View: " + (game.game_title || "Game");

        const printBtn = document.getElementById("previewPrintBtn");
        if (printBtn) printBtn.classList.add("d-none"); // Hide print for scoring preview

        if (window.bootstrap) {
            new bootstrap.Modal(document.getElementById("previewModal")).show();
        }
    },

    renderGuidePreview: async function (id) {
        const game = this.data.games.find(g => g.id === (id || this.activeGameId));
        if (!game) return;

        try {
            // Fetch the template if not cached
            if (!this._gameGuideTemplate) {
                const res = await fetch('/templates/gameguide.md');
                if (!res.ok) throw new Error("Could not fetch gameguide template");
                this._gameGuideTemplate = await res.text();
            }

            // Compile with Handlebars
            const template = Handlebars.compile(this._gameGuideTemplate);
            const markdown = template(game);

            // Convert to HTML with Marked, resolving relative paths to workspace assets
            const workspaceId = this.data.meta.camporeeId || 'camp0002';
            const html = marked.parse(markdown, {
                baseUrl: `/api/camporee/${workspaceId}/games/`
            });

            const modalBody = document.getElementById("previewModalBody");
            const modalTitle = document.getElementById("previewModalTitle");
            const dialog = document.getElementById("previewModalDialog");

            if (dialog) dialog.style.maxWidth = 'min(95vw, 8.5in)';

            if (modalBody) modalBody.innerHTML = html;
            if (modalTitle) modalTitle.innerText = "Guide Preview: " + (game.game_title || "Game");

            const printBtn = document.getElementById("previewPrintBtn");
            if (printBtn) printBtn.classList.remove("d-none"); // Show print button

            if (window.bootstrap) {
                new bootstrap.Modal(document.getElementById("previewModal")).show();
            }
        } catch (e) {
            console.error(e);
            alert("Error rendering preview: " + e.message);
        }
    },

    printPreview: function () {
        const originalContents = document.body.innerHTML;
        const modalBody = document.getElementById('previewModalBody').innerHTML;

        document.body.innerHTML = `
    < div style = "padding: 20px; max-width: 800px; margin: 0 auto; font-family: sans-serif;" >
        ${modalBody}
            </div >
    `;

        window.print();
        document.body.innerHTML = originalContents;
        window.location.reload(); // Reload to restore proper event bindings
    },

    exportCamporee: async function () {
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
                scoring_model: g.scoring_model,
                match_label: g.match_label || ""
            };
            if (g.bracketMode) gameFile.bracketMode = true;

            gamesFolder.file(`${g.id}.json`, JSON.stringify(gameFile, null, 2));
        });

        // Add assets directory if running in Server Mode
        if (this.isServerMode && this.data.meta.camporeeId) {
            try {
                const res = await fetch(`/api/camporee/${this.data.meta.camporeeId}/assets`);
                if (res.ok) {
                    const assets = await res.json();
                    if (assets && assets.length > 0) {
                        const assetsFolder = zip.folder("assets");
                        for (const asset of assets) {
                            const assetRes = await fetch(`/api/camporee/${this.data.meta.camporeeId}/assets/${asset}`);
                            if (assetRes.ok) {
                                const blob = await assetRes.blob();
                                assetsFolder.file(asset, blob);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to bundle assets into ZIP:", e);
            }
        }

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

                    if (!g.scoring_model) {
                        // Fallback/Migration for old camporees
                        if (g.scoring) {
                            g.scoring_model = {
                                method: g.scoring_model.method || "points_desc",
                                inputs: g.scoring_model.inputs || []
                            };
                            delete g.scoring;
                        } else {
                            g.scoring_model = { method: "points_desc", inputs: [] };
                        }
                    }
                    if (!g.scoring_model.inputs) g.scoring_model.inputs = [];
                    if (!g.type) g.type = "patrol";
                    g.bracketMode = !!g.bracketMode;
                    g.match_label = g.match_label || "";

                    this.data.games.push(g);
                });

                if (!this.data.meta.camporeeId) {
                    this.data.meta.camporeeId = this.generateUUID();
                }

                if (this.isServerMode && zip.folder("assets")) {
                    const assetPromises = [];
                    zip.folder("assets").forEach((relativePath, file) => {
                        if (!file.dir) {
                            assetPromises.push(file.async("base64").then(b64 => {
                                return fetch(`/api/camporee/${this.data.meta.camporeeId}/assets/${relativePath}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ base64: b64 })
                                });
                            }));
                        }
                    });
                    try {
                        await Promise.all(assetPromises);
                    } catch (e) {
                        console.error("Failed to upload some assets", e);
                    }
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
                    game.id = `import_${Date.now()} `;
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
    < label class="list-group-item d-flex gap-2" >
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
            game.id = `import_${Date.now()}_${cb.value} `;
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