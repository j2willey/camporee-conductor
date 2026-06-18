import { normalizeGameDefinition } from "../core/schema.js";
import { generateFieldHTML } from "../core/ui.js";
import { LibraryService } from "../core/library-service.js";
import { ApiClient } from "../core/api.js";

const SYSTEM_PRESETS = [
    // Patrol prefix common fields (injected before game-specific fields by the Collator)
    { id: "p_flag",    label: "Patrol Flag",                              type: "number",   kind: "points",  weight: 10, audience: "judge", position: "prefix", sortOrder: 10, config: { min: 0, max: 10, placeholder: "0-10 Points" } },
    { id: "p_yell",    label: "Patrol Yell",                              type: "number",   kind: "points",  weight: 5,  audience: "judge", position: "prefix", sortOrder: 20, config: { min: 0, max: 5,  placeholder: "0-5 Points"  } },
    { id: "p_spirit",  label: "Scout Spirit",                             type: "number",   kind: "points",  weight: 10, audience: "judge", position: "prefix", sortOrder: 30, config: { min: 0, max: 10, placeholder: "0-10 Points" } },
    { id: "ten_ess",   label: "10 Essentials: {{ten_essentials}}",   type: "checkbox", kind: "points",  weight: 5,  audience: "judge", position: "prefix", sortOrder: 40, config: { placeholder: "Does the patrol have {{ten_essentials}}?" } },
    // Patrol/Troop suffix common fields (injected after game-specific fields by the Collator)
    { id: "unscout",   label: "Unscoutlike Behavior",                     type: "number",   kind: "penalty", weight: 1,  audience: "judge", position: "suffix", sortOrder: 10, config: { min: 0, max: 20, placeholder: "Points deducted (0-20)" } },
    { id: "off_notes", label: "Judges Notes",                             type: "textarea", kind: "info",    weight: 0,  audience: "judge", position: "suffix", sortOrder: 20, config: { placeholder: "Issues, tie-breakers, etc." } },
    { id: "off_score", label: "Official Score",                           type: "number",   kind: "points",  weight: 1,  audience: "admin", position: "suffix", sortOrder: 30, config: { placeholder: "Final Calculated Points" } },
    { id: "final_rank",label: "Final Ranking",                            type: "select",   kind: "info",    weight: 0,  audience: "admin", position: "suffix", sortOrder: 40, config: { options: ["1st Place", "2nd Place", "3rd Place", "4th Place", "Participant"] } },
    { id: "overall_points", label: "Overall Points",                      type: "number",   kind: "points",  weight: 1,  audience: "admin", position: "suffix", sortOrder: 50, config: { placeholder: "e.g., 100, 90, 80..." } },
    // Bracket-specific field — injected only when bracketMode is enabled on a game
    { id: "bracket_result", label: "Match Result", type: "text", kind: "info", weight: 0, audience: "judge", required: true, config: { placeholder: "Place:  1, 2, 3, 4....." } }
];

// Common field IDs managed by the preset injection system.
// These must not be baked into individual game files.
const COMMON_FIELD_IDS = new Set([
    'patrol_flag', 'patrol_yell', 'patrol_spirit', 'patrol_sprirt',
    'p_flag', 'p_yell', 'p_spirit', 'ten_ess',
    'unscoutlike', 'unscout',
    'off_notes',
    'off_score', 'final_rank', 'overall_points'
]);

const DEFAULT_LEAGUES = [
    { id: 'patrol-games',     label: 'Patrol Games',       tier: 'subunit', registration: 'registered', divisions: [] },
    { id: 'exhibition',       label: 'Exhibition Events',  tier: 'subunit', registration: 'registered', divisions: [] },
    { id: 'troop-challenges', label: 'Troop Challenges',   tier: 'unit',    registration: 'registered', divisions: [] },
];

const DEFAULT_TYPE_DEFAULTS = {
    'patrol-games':     { prefix: ["p_flag", "p_yell", "p_spirit", "ten_ess"], suffix: ["unscout", "off_notes", "off_score", "final_rank", "overall_points"] },
    'exhibition':       { prefix: [], suffix: ["off_score", "final_rank", "overall_points"] },
    'troop-challenges': { prefix: [], suffix: ["off_score", "final_rank", "overall_points"] }
};

const composer = {
    serverMode: false,
    isDirty: false,
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
        games: [],
        leagues: JSON.parse(JSON.stringify(DEFAULT_LEAGUES)),
        sessions: [],
        rosters: { units: [], subunits: [], individuals: [] },
        terminology: null,
        type_defaults: JSON.parse(JSON.stringify(DEFAULT_TYPE_DEFAULTS))
    },
    presets: JSON.parse(JSON.stringify(SYSTEM_PRESETS)),
    activeGameId: null,
    pendingImportGames: [],
    dragSrcGameId: null,
    libraryCatalog: null,
    aiUpdateSnapshot: null,
    camporeeList: [],   // cached list of user's camporees for name-uniqueness checks

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
        this.injectModals();
        this.bindGlobalEvents();

        // Load the user's camporee list once at startup for name-uniqueness checks.
        // Show a first-time welcome when the list is empty.
        try {
            this.camporeeList = await this.api.getCamporees();
        } catch (e) {
            this.camporeeList = [];
        }

        if (this.camporeeList.length === 0) {
            this._showFirstTimeWelcome();
        } else {
            if (!this.data.meta.camporeeId) {
                this.data.meta.camporeeId = this.generateUUID();
            }
            this.showPane('meta-pane', document.getElementById('btn-meta'));
            this.renderServerControls();
            this.renderGameLists();
        }
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

        ["metaTitle", "metaTheme", "metaCouncil"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("input", (e) => {
                    const key = id === "metaTitle" ? "title" :
                        id === "metaTheme" ? "theme" : "council";
                    this.data.meta[key] = e.target.value;
                    this._markDirty();
                });
            }
        });

        // Warn (but don't block) if the title matches another of the user's camporees.
        const metaTitleEl = document.getElementById("metaTitle");
        if (metaTitleEl) {
            metaTitleEl.addEventListener("blur", (e) => {
                const warnEl = document.getElementById("metaTitleDuplicateWarning");
                if (!warnEl) return;
                const val = e.target.value.trim().toLowerCase();
                const currentId = this.data.meta.camporeeId;
                const isDupe = val && this.camporeeList.some(
                    c => c.id !== currentId && (c.title || '').trim().toLowerCase() === val
                );
                warnEl.classList.toggle('d-none', !isDupe);
            });
        }

        // Location binding
        ["metaLocName", "metaLocAddress"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("input", (e) => {
                    if (!this.data.meta.location) this.data.meta.location = {};
                    const key = id === "metaLocName" ? "name" : "address";
                    this.data.meta.location[key] = e.target.value;
                    this._markDirty();
                });
            }
        });

        // Dates binding
        ["metaStartDate", "metaEndDate"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("change", (e) => {
                    if (!this.data.meta.dates) this.data.meta.dates = {};
                    const key = id === "metaStartDate" ? "start" : "end";
                    this.data.meta.dates[key] = e.target.value;
                    this._markDirty();
                });
            }
        });

        // Theme color pickers
        const colorVarMap = { colorBrandMain: '--brand-main', colorBrandHeader: '--brand-header', colorBrandAccent: '--brand-accent' };
        const colorKeyMap = { colorBrandMain: 'main', colorBrandHeader: 'header', colorBrandAccent: 'accent' };
        Object.keys(colorVarMap).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    if (!this.data.meta.theme_colors) this.data.meta.theme_colors = {};
                    this.data.meta.theme_colors[colorKeyMap[id]] = e.target.value;
                    document.documentElement.style.setProperty(colorVarMap[id], e.target.value);
                    this._markDirty();
                });
            }
        });

        // Inside bindGlobalEvents, eagerly initialize the Welcome Text EasyMDE
        const introEl = document.getElementById("metaIntroduction");
        if (introEl && window.EasyMDE && !this.welcomeEditor) {
            const mde = new EasyMDE({
                element: introEl,
                spellChecker: false,
                status: false,
                minHeight: "100px",
                initialValue: this.data.meta.introduction || "",
                toolbar: ["bold", "italic", "heading", "link", "image"]
            });
            mde.codemirror.on("change", () => {
                this.data.meta.introduction = mde.value();
                this._markDirty();
            });
            this.welcomeEditor = mde;

            const parentCollapse = document.getElementById("collapseEventDetails");
            if (parentCollapse) {
                parentCollapse.addEventListener('shown.bs.collapse', () => {
                    mde.codemirror.refresh();
                });
            }
        } else if (introEl) {
            introEl.addEventListener("input", (e) => {
                this.data.meta.introduction = e.target.value;
            });
        }
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
        this._updateNavbar();
    },

    _updateNavbar: function () {
        const nameDisplay = document.getElementById('workspace-name-display');
        const nameText = document.getElementById('workspace-name-text');
        const dirtyIndicator = document.getElementById('workspace-dirty-indicator');

        const title = this.data.meta.title;
        const id = this.data.meta.camporeeId;
        if (nameDisplay && nameText) {
            if (id) {
                nameText.textContent = title || id;
                nameDisplay.classList.remove('d-none');
            } else {
                nameDisplay.classList.add('d-none');
            }
        }
        if (dirtyIndicator) {
            if (this.isDirty) {
                dirtyIndicator.classList.remove('d-none');
            } else {
                dirtyIndicator.classList.add('d-none');
            }
        }
    },

    _markDirty: function () {
        this.isDirty = true;
        const indicator = document.getElementById('workspace-dirty-indicator');
        if (indicator) indicator.classList.remove('d-none');
    },

    _markClean: function () {
        this.isDirty = false;
        const indicator = document.getElementById('workspace-dirty-indicator');
        if (indicator) indicator.classList.add('d-none');
        this._clearAiUpdateSnapshot();
    },

    saveWorkspace: async function () {
        await this.initiateServerSave();
    },

    validateNewWorkspaceName: function (val) {
        const statusEl = document.getElementById('newWorkspaceStatus');
        const confirmBtn = document.getElementById('newWorkspaceConfirmBtn');
        const trimmed = (val || '').trim();

        if (!trimmed) {
            statusEl.innerHTML = '';
            confirmBtn.disabled = true;
            return;
        }

        const dupe = this.camporeeList.some(
            c => (c.title || '').trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (dupe) {
            statusEl.innerHTML = '<span class="text-danger"><i class="fas fa-times-circle me-1"></i>You already have a camporee with this name.</span>';
            confirmBtn.disabled = true;
            return;
        }

        statusEl.innerHTML = '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Name is available.</span>';
        confirmBtn.innerHTML = '<i class="fas fa-check"></i> Create';
        confirmBtn.disabled = false;
    },

    confirmNewWorkspace: function () {
        const nameInput = document.getElementById('newWorkspaceName');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) return;

        const modalEl = document.getElementById('newWorkspaceModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }

        this._initFreshWorkspace(name);
    },

    openServerLoadModal: async function () {
        try {
            const list = await this.api.getCamporees();
            this.camporeeList = list;
            const listEl = document.getElementById("serverLoadList");

            if (list.length > 0) {
                listEl.innerHTML = list.map(c => `
                    <div class="list-group-item list-group-item-action d-flex align-items-center gap-2">
                        <div class="flex-grow-1" style="cursor:pointer;min-width:0" onclick="composer.loadFromServer('${c.id}')">
                            <div class="d-flex w-100 justify-content-between align-items-center">
                                <h5 class="mb-1 text-truncate">${c.title || "Untitled"}</h5>
                                <div class="d-flex align-items-center gap-1 flex-shrink-0 ms-2">
                                    <small>${c.year}</small>
                                    ${c.role !== 'owner' ? `<span class="badge bg-info text-dark">Shared</span>` : ''}
                                </div>
                            </div>
                            <p class="mb-1 small text-muted">${c.theme || "No theme"}</p>
                            <small class="text-muted">ID: ${c.id}</small>
                        </div>
                        ${c.role === 'owner' ? `<button class="btn btn-sm btn-outline-secondary flex-shrink-0" title="Share / Collaborators" onclick="event.stopPropagation(); composer.openShareModal('${c.id}')"><i class="fas fa-user-plus"></i></button>` : ''}
                    </div>`).join("");
            } else {
                listEl.innerHTML = '<div class="p-3 text-center text-muted">No saved camporees.</div>';
            }

            new bootstrap.Modal(document.getElementById("serverLoadModal")).show();
        } catch (e) {
            alert("Server Error: Could not fetch list.");
        }
    },

    promptLoadWorkspace: async function () {
        await this.openServerLoadModal();
    },

    loadFromServer: async function (id, noConfirm = false) {
        const dirtyWarning = this.isDirty ? ` (you have unsaved changes in "${this.data.meta.title || 'current workspace'}")` : '';
        if (!noConfirm && !confirm(`Load workspace '${id}'?${dirtyWarning} Unsaved changes will be lost.`)) return;

        try {
            const camporee = await this.api.getCamporee(id);
            this.data.meta = camporee.meta;
            this.data.games = camporee.games || [];
            this.data.leagues = camporee.leagues || JSON.parse(JSON.stringify(DEFAULT_LEAGUES));
            this.data.sessions = camporee.sessions || [];
            this.data.rosters = camporee.rosters || { units: [], subunits: [], individuals: [] };
            this.data.terminology = camporee.terminology || null;
            this.data.type_defaults = camporee.type_defaults || JSON.parse(JSON.stringify(DEFAULT_TYPE_DEFAULTS));
            if (camporee.presets) {
                this.presets = camporee.presets;
            }

            if (!this.data.meta.camporeeId) {
                this.data.meta.camporeeId = id;
            }

            this.ensureSystemPresets();
            this.normalizeGameSortOrders();
            this._markClean();
            this._updateNavbar();
            this.updateMetaUI();
            this.renderGameLists();
            this.renderPresetManager();

            const loadModalEl = document.getElementById("serverLoadModal");
            if (loadModalEl) {
                const loadModal = bootstrap.Modal.getInstance(loadModalEl);
                if (loadModal) loadModal.hide();
            }
        } catch (e) {
            alert("Error: " + e.message);
        }
    },

    openShareModal: async function (eventId) {
        this._shareEventId = eventId;
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('shareModal'));
        modal.show();
        await this._refreshCollaborators();
    },

    _refreshCollaborators: async function () {
        const eventId = this._shareEventId;
        const listEl = document.getElementById('collaboratorList');
        listEl.innerHTML = '<div class="text-center text-muted small py-2">Loading...</div>';
        try {
            const collabs = await this.api.getCollaborators(eventId);
            if (!collabs.length) {
                listEl.innerHTML = '<p class="text-muted small mb-0 mt-2">No collaborators yet.</p>';
                return;
            }
            listEl.innerHTML = `<hr class="my-2"><div class="list-group list-group-flush">` +
                collabs.map(c => {
                    const isOwner = c.role === 'owner';
                    const isOfficial = isOwner || !!c.is_collator_official;
                    const roleBadge = isOwner
                        ? `<span class="badge bg-primary ms-1">Director</span>`
                        : `<span class="badge bg-secondary ms-1">${c.role}</span>`;
                    const officialToggle = `
                        <div class="form-check form-switch mb-0 ms-2 d-flex align-items-center gap-1" title="Also Official in Collator">
                            <input class="form-check-input mt-0" type="checkbox" role="switch"
                                   id="official-${c.user_id}"
                                   ${isOfficial ? 'checked' : ''}
                                   ${isOwner ? 'disabled' : `onchange="composer.toggleOfficial('${c.user_id}', this.checked)"`}>
                            <label class="form-check-label small text-muted" for="official-${c.user_id}">Official</label>
                        </div>`;
                    const removeBtn = !isOwner
                        ? `<button class="btn btn-sm btn-outline-danger py-0 ms-2" onclick="composer.removeCollaborator('${c.user_id}')" title="Remove"><i class="fas fa-times"></i></button>`
                        : '';
                    return `
                        <div class="list-group-item d-flex justify-content-between align-items-center px-0 py-1">
                            <div>
                                <span>${c.display_name || c.email || c.user_id}</span>
                                ${roleBadge}
                            </div>
                            <div class="d-flex align-items-center">
                                ${officialToggle}
                                ${removeBtn}
                            </div>
                        </div>`;
                }).join('') + `</div>`;
        } catch (e) {
            listEl.innerHTML = '<p class="text-danger small mb-0 mt-2">Failed to load collaborators.</p>';
        }
    },

    inviteCollaborator: async function () {
        const email = document.getElementById('shareEmail').value.trim();
        const role = document.getElementById('shareRole').value;
        if (!email) return;
        try {
            await this.api.inviteCollaborator(this._shareEventId, email, role);
            document.getElementById('shareEmail').value = '';
            await this._refreshCollaborators();
        } catch (e) {
            alert(e.message || 'Failed to invite collaborator');
        }
    },

    removeCollaborator: async function (targetUserId) {
        if (!confirm('Remove this collaborator?')) return;
        try {
            await this.api.removeCollaborator(this._shareEventId, targetUserId);
            await this._refreshCollaborators();
        } catch (e) {
            alert(e.message || 'Failed to remove collaborator');
        }
    },

    toggleOfficial: async function (targetUserId, isOfficial) {
        try {
            await this.api.toggleOfficial(this._shareEventId, targetUserId, isOfficial);
        } catch (e) {
            alert(e.message || 'Failed to update official status');
            await this._refreshCollaborators();
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
            leagues: this.data.leagues,
            sessions: this.data.sessions,
            rosters: this.data.rosters,
            terminology: this.data.terminology,
            games: this.data.games,
            presets: this.presets,
            type_defaults: this.data.type_defaults
        };

        try {
            const result = await this.api.saveCamporee(id, payload);

            const modalEl = document.getElementById("overwriteModal");
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            if (result.success) {
                this._markClean();
                this._updateNavbar();
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
                            <h5 class="modal-title"><i class="fas fa-server me-1"></i> Load Workspace</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-0">
                            <div class="list-group list-group-flush" id="serverLoadList"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>`,
            `<div class="modal fade" id="shareModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="fas fa-user-plus me-1"></i> Share Event</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="d-flex gap-2 mb-2">
                                <input type="email" class="form-control" id="shareEmail" placeholder="collaborator@example.com">
                                <select class="form-select" style="width:auto" id="shareRole">
                                    <option value="editor">Editor</option>
                                    <option value="viewer">Viewer</option>
                                </select>
                                <button class="btn btn-primary" onclick="composer.inviteCollaborator()">Invite</button>
                            </div>
                            <div id="collaboratorList"></div>
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
        const groups = {};

        this.data.games.forEach(g => {
            const league = g.league || "patrol-games";
            if (!groups[league]) groups[league] = [];
            groups[league].push(g);
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

        if (!srcGame || !targetGame || srcGame.league !== targetGame.league) return;

        const leagueId = srcGame.league || "patrol-games";
        const group = this.data.games.filter(g => (g.league || "patrol-games") === leagueId);

        group.sort((a, b) => a.sortOrder - b.sortOrder);

        const srcIndex = group.findIndex(g => g.id === srcId);
        const targetIndex = group.findIndex(g => g.id === targetId);

        group.splice(srcIndex, 1);
        group.splice(targetIndex, 0, srcGame);

        group.forEach((g, i) => {
            g.sortOrder = (i + 1) * 10;
        });

        this._markDirty();
        this.renderGameLists();
    },

    // Shared workspace-initialization logic used by both modal and first-time welcome.
    _initFreshWorkspace: function (name) {
        const newId = this.generateUUID();
        this.data.games = [];
        this.data.meta = {
            camporeeId: newId,
            title: name,
            theme: "",
            year: new Date().getFullYear(),
            theme_colors: { main: '#0d6efd', header: '#34495e', accent: '#3498db' }
        };
        this.data.leagues = JSON.parse(JSON.stringify(DEFAULT_LEAGUES));
        this.data.sessions = [];
        this.data.rosters = { units: [], subunits: [], individuals: [] };
        this.data.terminology = null;
        this.data.type_defaults = JSON.parse(JSON.stringify(DEFAULT_TYPE_DEFAULTS));
        this.presets = JSON.parse(JSON.stringify(SYSTEM_PRESETS));
        this.activeGameId = null;
        this._markDirty();
        this._updateNavbar();
        this.updateMetaUI();
        this.renderGameLists();
        const editorContainer = document.getElementById("editor-container");
        if (editorContainer) editorContainer.innerHTML = '<p class="text-muted">Select a game to edit.</p>';
        // Hide first-time welcome if it was showing; reveal normal editor
        const welcomePane = document.getElementById('first-time-welcome-pane');
        if (welcomePane) welcomePane.classList.add('d-none');
        this.showPane('meta-pane', document.getElementById('btn-meta'));
    },

    // Show the first-time welcome pane (hides meta-pane and sidebar content).
    _showFirstTimeWelcome: function () {
        const metaPane = document.getElementById('meta-pane');
        if (metaPane) metaPane.classList.add('d-none');
        const welcomePane = document.getElementById('first-time-welcome-pane');
        if (welcomePane) welcomePane.classList.remove('d-none');
        this.renderServerControls();
        this.renderGameLists();
    },

    validateFirstTimeName: function (val) {
        const statusEl = document.getElementById('firstTimeStatus');
        const btn = document.getElementById('firstTimeCreateBtn');
        const trimmed = (val || '').trim();
        if (!trimmed) {
            if (statusEl) statusEl.textContent = '';
            if (btn) btn.disabled = true;
            return;
        }
        if (statusEl) statusEl.textContent = '';
        if (btn) btn.disabled = false;
    },

    confirmFirstTimeCamporee: function () {
        const nameInput = document.getElementById('firstTimeName');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) return;
        this._initFreshWorkspace(name);
    },

    newCamporee: function () {
        const modalEl = document.getElementById('newWorkspaceModal');
        if (modalEl) {
            const nameInput = document.getElementById('newWorkspaceName');
            const statusEl = document.getElementById('newWorkspaceStatus');
            const confirmBtn = document.getElementById('newWorkspaceConfirmBtn');
            const dirtyAlert = document.getElementById('newWorkspaceDirtyAlert');
            if (nameInput) nameInput.value = '';
            if (statusEl) statusEl.innerHTML = '';
            if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fas fa-check"></i> Create'; }
            if (dirtyAlert) {
                if (this.isDirty) dirtyAlert.classList.remove('d-none');
                else dirtyAlert.classList.add('d-none');
            }
            new bootstrap.Modal(modalEl).show();
        }
    },

    addGame: function (leagueOrType = "patrol-games") {
        // Accept legacy type strings passed from EJS buttons ("patrol", "troop", "exhibition")
        const legacyTypeMap = { patrol: 'patrol-games', troop: 'troop-challenges', exhibition: 'exhibition' };
        const leagueId = legacyTypeMap[leagueOrType] || leagueOrType;
        const leagues = this.data.leagues || DEFAULT_LEAGUES;
        const league = leagues.find(l => l.id === leagueId) || leagues[0];
        const resolvedLeagueId = league?.id || 'patrol-games';
        const isSubunit = league?.tier !== 'unit';

        const id = `game_${Date.now()}`;
        const newGame = {
            id: id,
            library_uuid: null,
            library_title: isSubunit ? "New Game" : "New Event",
            game_title: isSubunit ? "New Game" : "New Event",
            league: resolvedLeagueId,
            session: null,
            enabled: true,
            bracketMode: false,
            scoring_mode: "sequential",
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
        this._markDirty();
        this.renderGameLists();
        this.editGame(id);
    },

    toggleGameEnabled: function (id) {
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;
        game.enabled = !game.enabled;
        this._markDirty();
        this.renderGameLists();
        if (this.activeGameId === id) this.editGame(id);
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
        this._markDirty();
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
            this._markDirty();
            this.renderGameLists();
        }
    },

    updateMetaUI: function () {
        const titleEl = document.getElementById("metaTitle");
        const themeEl = document.getElementById("metaTheme");
        if (titleEl) titleEl.value = this.data.meta.title || "";
        if (themeEl) themeEl.value = this.data.meta.theme || "";

        const councilEl = document.getElementById("metaCouncil");
        if (councilEl) councilEl.value = this.data.meta.council || "";

        if (this.data.meta.location) {
            const elN = document.getElementById("metaLocName");
            if (elN) elN.value = this.data.meta.location.name || "";
            const elA = document.getElementById("metaLocAddress");
            if (elA) elA.value = this.data.meta.location.address || "";
        }

        if (this.data.meta.dates) {
            const elS = document.getElementById("metaStartDate");
            if (elS) elS.value = this.data.meta.dates.start || "";
            const elE = document.getElementById("metaEndDate");
            if (elE) elE.value = this.data.meta.dates.end || "";
        }

        if (this.welcomeEditor) {
            this.welcomeEditor.value(this.data.meta.introduction || "");
        } else {
            const elW = document.getElementById("metaIntroduction");
            if (elW) elW.value = this.data.meta.introduction || "";
        }

        this.renderContacts();

        const colors = this.data.meta.theme_colors || {};
        const colorDefaults = { main: '#0d6efd', header: '#34495e', accent: '#3498db' };
        const colorEls = { colorBrandMain: 'main', colorBrandHeader: 'header', colorBrandAccent: 'accent' };
        const colorVars = { main: '--brand-main', header: '--brand-header', accent: '--brand-accent' };
        Object.entries(colorEls).forEach(([elId, key]) => {
            const el = document.getElementById(elId);
            if (el) {
                el.value = colors[key] || colorDefaults[key];
                document.documentElement.style.setProperty(colorVars[key], el.value);
            }
        });
    },

    renderContacts: function () {
        const container = document.getElementById("contactsContainer");
        if (!container) return;

        const contacts = this.data.meta.contacts || [];

        if (contacts.length === 0) {
            container.innerHTML = `<div class="text-muted text-center small p-2">No contacts added.</div>`;
            return;
        }

        container.innerHTML = contacts.map((c, i) => `
            <div class="card mb-2 border">
                <div class="card-body p-2 position-relative">
                    <button class="btn btn-sm btn-link text-danger position-absolute top-0 end-0 p-1" onclick="composer.removeContact(${i})"><i class="fas fa-times"></i></button>
                    <input type="text" class="form-control form-control-sm mb-1 fw-bold border-0 bg-light" placeholder="Role (e.g. Medic)" value="${c.role || ''}" onchange="composer.updateContact(${i}, 'role', this.value)">
                    <input type="text" class="form-control form-control-sm mb-1 border-0" placeholder="Name" value="${c.name || ''}" onchange="composer.updateContact(${i}, 'name', this.value)">
                    <input type="email" class="form-control form-control-sm mb-1 border-0" placeholder="Email" value="${c.email || ''}" onchange="composer.updateContact(${i}, 'email', this.value)">
                    <input type="tel" class="form-control form-control-sm border-0" placeholder="Phone" value="${c.phone || ''}" onchange="composer.updateContact(${i}, 'phone', this.value)">
                </div>
            </div>
        `).join("");
    },

    addContact: function () {
        if (!this.data.meta.contacts) this.data.meta.contacts = [];
        this.data.meta.contacts.push({ role: "", name: "", email: "", phone: "" });
        this.renderContacts();
    },

    updateContact: function (index, field, value) {
        if (this.data.meta.contacts && this.data.meta.contacts[index]) {
            this.data.meta.contacts[index][field] = value;
        }
    },

    removeContact: function (index) {
        if (this.data.meta.contacts) {
            this.data.meta.contacts.splice(index, 1);
            this.renderContacts();
        }
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

    filterCatalog: function () {
        const query = document.getElementById('composer-catalog-search').value.toLowerCase();
        const items = document.querySelectorAll('#libraryModal #library-list .library-item');

        items.forEach(item => {
            const title = item.querySelector('.item-title')?.textContent.toLowerCase() || '';
            const tags = item.querySelector('.item-tags')?.textContent.toLowerCase() || '';

            if (title.includes(query) || tags.includes(query)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
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
                league: template.league || (path.includes("troop") ? "troop-challenges" : "patrol-games"),
                session: template.session !== undefined ? template.session : null,
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
            this._markDirty();
            this.renderGameLists();
            this.editGame(newId);
        } catch (e) {
            console.error("Failed to add game from library:", e);
            alert("Error adding game: " + e.message);
        }
    },

    renderGameLists: function () {
        const patrolList     = document.getElementById("patrolList");
        const troopList      = document.getElementById("troopList");
        const exhibitionList = document.getElementById("exhibitionList");
        const patrolCount     = document.getElementById("patrolCount");
        const troopCount      = document.getElementById("troopCount");
        const exhibitionCount = document.getElementById("exhibitionCount");

        if (!patrolList || !troopList) return;

        patrolList.innerHTML     = "";
        troopList.innerHTML      = "";
        if (exhibitionList) exhibitionList.innerHTML = "";

        let pCount = 0;
        let tCount = 0;
        let eCount = 0;

        if (this.data.games.length === 0) {
            patrolList.innerHTML = '<div class="text-center text-muted">No patrol games.</div>';
            troopList.innerHTML  = '<div class="text-center text-muted">No troop challenges.</div>';
            if (exhibitionList) exhibitionList.innerHTML = '<div class="text-center text-muted">No exhibition events.</div>';
            if (patrolCount)     patrolCount.innerText     = "0";
            if (troopCount)      troopCount.innerText      = "0";
            if (exhibitionCount) exhibitionCount.innerText = "0";
            return;
        }

        this.data.games.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        const leagueCounters = {};
        this.data.games.forEach(game => {
            const activeClass = game.id === this.activeGameId ? "active" : "";
            const leagueId = game.league || 'patrol-games';
            const targetList = leagueId === 'troop-challenges' ? troopList
                             : leagueId === 'exhibition' ? (exhibitionList || troopList)
                             : patrolList;

            if (leagueId === 'patrol-games') pCount++;
            else if (leagueId === 'troop-challenges') tCount++;
            else eCount++;

            const prefixLetter = leagueId === 'troop-challenges' ? 't' : leagueId === 'exhibition' ? 'e' : 'p';
            leagueCounters[prefixLetter] = (leagueCounters[prefixLetter] || 0) + 1;
            const displayPrefix = `${prefixLetter}${leagueCounters[prefixLetter]}`;

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

            const enabledIcon = game.enabled ? "fa-toggle-on text-success" : "fa-toggle-off text-secondary";
            const enabledTitle = game.enabled ? "Enabled — click to disable" : "Disabled — click to enable";
            item.innerHTML = `
                <div class="me-3 text-muted" style="cursor: grab;"><i class="fas fa-grip-vertical"></i></div>
                <div class="flex-grow-1 text-truncate">
                    <strong><span class="text-muted me-1">${displayPrefix}</span>${game.game_title || game.content?.title || "Untitled Game"}</strong><br>
                    <small class="text-muted">${game.content?.game_uuid || game.id}</small>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <button class="btn btn-sm border-0" title="${enabledTitle}"
                            onclick="event.stopPropagation(); composer.toggleGameEnabled('${game.id}')">
                        <i class="fas ${enabledIcon}"></i>
                    </button>
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

        if (patrolCount)     patrolCount.innerText     = pCount;
        if (troopCount)      troopCount.innerText      = tCount;
        if (exhibitionCount) exhibitionCount.innerText = eCount;
    },

    editGame: function (id) {
        this.activeGameId = id;
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;

        if (!game.league) game.league = (this.data.leagues || DEFAULT_LEAGUES)[0]?.id || "patrol-games";
        if (!game.game_title) game.game_title = game.content?.title || "";

        this.renderGameLists();
        this.showPane('editor-pane');

        const container = document.getElementById("editor-container");
        container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="mb-0">
            <i class="fas fa-edit"></i> <span id="headerTitle">${game.game_title || "Game Editor"}</span>
        </h4>
        <div class="d-flex flex-column align-items-end gap-2">
             <div class="btn-group w-100">
                 <button class="btn btn-outline-primary btn-sm d-none" id="previewBtnTop" onclick="composer.renderGuidePreview('${id}')">
                     <i class="fas fa-eye"></i> Preview Guide
                 </button>
                 <button class="btn btn-info text-white btn-sm fw-bold shadow-sm" onclick="composer.openThemeModal('${id}')">
                     ✨ AI Theme
                 </button>
                 <button class="btn btn-sm fw-bold shadow-sm" style="background:#6f42c1;color:#fff;" onclick="composer.openAiUpdateModal('${id}')">
                     <i class="fas fa-magic me-1"></i>AI Update
                 </button>
             </div>
             <button class="btn btn-warning btn-sm w-100 d-none" id="aiUpdateRevertBtn" onclick="composer.undoAiUpdate()">
                 <i class="fas fa-undo me-1"></i>Undo AI Update
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
                            <label class="form-label">League</label>
                            <select class="form-select" id="gameLeague">
                                ${(this.data.leagues || DEFAULT_LEAGUES).map(l =>
                                    `<option value="${l.id}"${game.league === l.id ? ' selected' : ''}>${l.label}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="col-md-7 mb-3">
                            <label class="form-label">Tags <small class="text-muted">(space or comma separated)</small></label>
                            <input type="text" class="form-control" id="gameTags" placeholder="#fire #knots #teamwork">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-12 mb-2">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <label class="form-label fw-bold mb-0">
                                    <i class="fas fa-code fa-fw text-muted me-1"></i> Game Variables
                                    <small class="text-muted fw-normal ms-1">— substituted into common field labels, e.g. <code>{{ten_essentials}}</code></small>
                                </label>
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="composer.addVariable('${game.id}')">
                                    <i class="fas fa-plus"></i> Add
                                </button>
                            </div>
                            <div id="variables-editor" class="border rounded bg-light p-2"></div>
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
                             <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="gameBracketMode"
                                       ${game.bracketMode ? "checked" : ""}
                                       onchange="composer.toggleBracketMode('${id}', this.checked)">
                                <label class="form-check-label fw-bold text-primary">Bracket Mode</label>
                            </div>
                        </div>
                        <div class="col-md-3 d-flex align-items-center border-start" title="Two-phase scoring: judges score each patrol individually (Phase 1), then rate all submissions comparatively (Phase 2).">
                             <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="gameScoringMode"
                                       ${game.scoring_mode === 'submission' ? "checked" : ""}
                                       onchange="composer.toggleScoringMode('${id}', this.checked)">
                                <label class="form-check-label fw-bold text-warning">Submission Mode</label>
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
                    <div id="common-prefix-preview" class="mb-2"></div>
                    <div id="scoring-editor" class="d-flex flex-column gap-3"></div>
                    <div id="common-suffix-preview" class="mt-2"></div>
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

        const leagueEl = document.getElementById("gameLeague");
        if (leagueEl) {
            leagueEl.onchange = (e) => {
                game.league = e.target.value;
                this._markDirty();
                this.normalizeGameSortOrders();
                this.renderGameLists();
            };
        }

        const methodEl = document.getElementById("gameScoringMethod");
        methodEl.value = game.scoring_model.method || "points_desc";
        methodEl.onchange = (e) => {
            game.scoring_model.method = e.target.value;
        };

        const scoringModeEl = document.getElementById("gameScoringMode");
        if (scoringModeEl) {
            scoringModeEl.checked = game.scoring_mode === 'submission';
        }

        this.renderScoringInputs(game.scoring_model.inputs, game.id, "game");
        this.renderCommonFieldsPreview(game);
        this.renderListEditor('rules', game.content.rules);
        this.renderVariables(game);

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

        // Restore undo button if an AI update snapshot exists for this game
        const aiRevertBtn = document.getElementById('aiUpdateRevertBtn');
        if (aiRevertBtn && this.aiUpdateSnapshot && this.aiUpdateSnapshot._gameId === id) {
            aiRevertBtn.classList.remove('d-none');
        }
    },

    renderListEditor: function (type, items) {
        const container = document.getElementById(`${type}-editor`);
        if (!container) return;

        container.innerHTML = '';
        (items || []).forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'input-group input-group-sm mb-1';
            row.draggable = true;
            row.dataset.index = index;
            row.innerHTML = `
                <span class="input-group-text drag-handle" style="cursor:grab;color:#aaa;" title="Drag to reorder">
                    <i class="fas fa-grip-vertical"></i>
                </span>
                <input type="text" class="form-control" value="${item.replace(/"/g, '&quot;')}"
                       oninput="composer.updateListItem('${type}', ${index}, this.value)">
                <button class="btn btn-outline-danger" type="button" onclick="composer.deleteListItem('${type}', ${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;

            row.addEventListener('dragstart', (e) => {
                if (e.target.tagName === 'INPUT') { e.preventDefault(); return; }
                this._listDragState = { type, fromIndex: index };
                row.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
            });

            row.addEventListener('dragend', () => {
                row.style.opacity = '';
                container.querySelectorAll('.list-drag-over').forEach(el => {
                    el.style.borderTop = '';
                    el.classList.remove('list-drag-over');
                });
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!this._listDragState || this._listDragState.type !== type) return;
                e.dataTransfer.dropEffect = 'move';
                container.querySelectorAll('.list-drag-over').forEach(el => {
                    el.style.borderTop = '';
                    el.classList.remove('list-drag-over');
                });
                if (this._listDragState.fromIndex !== index) {
                    row.classList.add('list-drag-over');
                    row.style.borderTop = '2px solid #0d6efd';
                }
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                if (!this._listDragState || this._listDragState.type !== type) return;
                const fromIndex = this._listDragState.fromIndex;
                const toIndex = index;
                this._listDragState = null;
                if (fromIndex === toIndex) return;

                const game = this.data.games.find(g => g.id === this.activeGameId);
                if (!game?.content[type]) return;

                const arr = game.content[type];
                const [moved] = arr.splice(fromIndex, 1);
                arr.splice(toIndex, 0, moved);
                this._markDirty();
                this.renderListEditor(type, arr);
            });

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

        if (this.aiUpdateSnapshot && this.aiUpdateSnapshot._gameId === this.activeGameId) {
            this._clearAiUpdateSnapshot();
        }

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

    renderVariables: function (game) {
        const container = document.getElementById('variables-editor');
        if (!container) return;
        const vars = game.variables || {};
        const entries = Object.entries(vars);
        if (entries.length === 0) {
            container.innerHTML = '<p class="text-muted small mb-0 p-1">No variables defined. Click Add to create one.</p>';
            return;
        }
        container.innerHTML = '';
        entries.forEach(([key, value]) => {
            const row = document.createElement('div');
            row.className = 'input-group input-group-sm mb-1';
            row.innerHTML = `
                <input type="text" class="form-control font-monospace" placeholder="variable_name"
                       value="${key.replace(/"/g, '&quot;')}"
                       onblur="composer.renameVariable('${game.id}', '${key.replace(/'/g, "\\'")}', this.value)">
                <span class="input-group-text text-muted small">=</span>
                <input type="text" class="form-control" placeholder="value"
                       value="${(value || '').replace(/"/g, '&quot;')}"
                       oninput="composer.setVariable('${game.id}', '${key.replace(/'/g, "\\'")}', this.value)">
                <button class="btn btn-outline-danger" type="button"
                        onclick="composer.removeVariable('${game.id}', '${key.replace(/'/g, "\\'")}')">
                    <i class="fas fa-times"></i>
                </button>`;
            container.appendChild(row);
        });
    },

    addVariable: function (gameId) {
        const game = this.data.games.find(g => g.id === gameId);
        if (!game) return;
        if (!game.variables) game.variables = {};
        let n = 1;
        while (game.variables[`variable_${n}`] !== undefined) n++;
        game.variables[`variable_${n}`] = '';
        this.renderVariables(game);
        const container = document.getElementById('variables-editor');
        if (container) {
            const inputs = container.querySelectorAll('input[type="text"]');
            if (inputs.length >= 2) { inputs[inputs.length - 2].focus(); inputs[inputs.length - 2].select(); }
        }
    },

    renameVariable: function (gameId, oldKey, newKey) {
        const game = this.data.games.find(g => g.id === gameId);
        if (!game || !game.variables) return;
        newKey = newKey.trim().replace(/\s+/g, '_');
        if (newKey === oldKey) return;
        if (!newKey) { this.renderVariables(game); return; }
        if (game.variables[newKey] !== undefined) {
            alert(`Variable "${newKey}" already exists.`);
            this.renderVariables(game);
            return;
        }
        const val = game.variables[oldKey];
        delete game.variables[oldKey];
        game.variables[newKey] = val;
        this.renderVariables(game);
    },

    setVariable: function (gameId, key, value) {
        const game = this.data.games.find(g => g.id === gameId);
        if (!game) return;
        if (!game.variables) game.variables = {};
        game.variables[key] = value;
    },

    removeVariable: function (gameId, key) {
        const game = this.data.games.find(g => g.id === gameId);
        if (!game || !game.variables) return;
        delete game.variables[key];
        this.renderVariables(game);
    },

    renderCommonFieldsPreview: function (game) {
        const prefixEl = document.getElementById('common-prefix-preview');
        const suffixEl = document.getElementById('common-suffix-preview');
        if (!prefixEl || !suffixEl) return;

        const typeDefaults = this.data.type_defaults || {};
        const defaults = typeDefaults[game.league];

        if (!defaults) {
            prefixEl.innerHTML = '';
            suffixEl.innerHTML = '';
            return;
        }

        const presetsById = Object.fromEntries((this.presets || []).map(p => [p.id, p]));

        const renderChips = (ids) => {
            if (!ids || ids.length === 0) return '<em class="text-muted small">None</em>';
            return ids.map(id => {
                const p = presetsById[id];
                if (!p) return `<span class="badge bg-secondary me-1">${id}</span>`;
                const badgeClass = p.kind === 'penalty' ? 'bg-danger' : p.audience === 'admin' ? 'bg-warning text-dark' : 'bg-success';
                return `<span class="badge ${badgeClass} me-1" title="${p.kind} | ${p.audience}">${p.label}</span>`;
            }).join('');
        };

        const prefixIds = defaults.prefix || [];
        const suffixIds = defaults.suffix || [];

        const leagueLabel = (this.data.leagues || DEFAULT_LEAGUES).find(l => l.id === game.league)?.label || game.league;
        const editBtn = `<button class="btn btn-outline-secondary btn-sm ms-2 py-0 px-2" style="font-size:0.7rem;" onclick="composer.openCommonFieldsModal('${game.league}')"><i class="fas fa-pencil-alt"></i> Edit</button>`;

        prefixEl.innerHTML = `
            <div class="border rounded px-2 py-1 bg-white mb-1" style="border-style: dashed !important; opacity: 0.85;">
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted fw-bold"><i class="fas fa-arrow-down fa-fw"></i> Injected Prefix (${leagueLabel}):</small>
                    ${editBtn}
                </div>
                <div class="mt-1">${prefixIds.length ? renderChips(prefixIds) : '<em class="text-muted small">None</em>'}</div>
            </div>`;

        suffixEl.innerHTML = `
            <div class="border rounded px-2 py-1 bg-white mt-1" style="border-style: dashed !important; opacity: 0.85;">
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted fw-bold"><i class="fas fa-arrow-up fa-fw"></i> Injected Suffix (${leagueLabel}):</small>
                    ${editBtn}
                </div>
                <div class="mt-1">${suffixIds.length ? renderChips(suffixIds) : '<em class="text-muted small">None</em>'}</div>
            </div>`;
    },

    resetThemeColors: function () {
        const defaults = { main: '#0d6efd', header: '#34495e', accent: '#3498db' };
        this.data.meta.theme_colors = { ...defaults };
        document.getElementById('colorBrandMain').value = defaults.main;
        document.getElementById('colorBrandHeader').value = defaults.header;
        document.getElementById('colorBrandAccent').value = defaults.accent;
        document.documentElement.style.setProperty('--brand-main', defaults.main);
        document.documentElement.style.setProperty('--brand-header', defaults.header);
        document.documentElement.style.setProperty('--brand-accent', defaults.accent);
    },

    openCommonFieldsModal: function (leagueId) {
        const typeDefaults = this.data.type_defaults || {};
        const eligiblePresets = (this.presets || []).filter(p => p.id !== 'bracket_result');
        const leagues = this.data.leagues || DEFAULT_LEAGUES;

        const renderSection = (lid, position, label) => {
            const currentIds = (typeDefaults[lid]?.[position] || []);
            const rows = eligiblePresets.map(p => {
                const checked = currentIds.includes(p.id) ? 'checked' : '';
                const badgeClass = p.kind === 'penalty' ? 'bg-danger' : p.audience === 'admin' ? 'bg-warning text-dark' : 'bg-success';
                return `<div class="form-check py-1 border-bottom d-flex align-items-center gap-2">
                    <input class="form-check-input cf-check" type="checkbox" id="cf_${lid}_${position}_${p.id}"
                           data-league="${lid}" data-position="${position}" data-preset="${p.id}" ${checked}>
                    <label class="form-check-label flex-grow-1 small" for="cf_${lid}_${position}_${p.id}">
                        <span class="badge ${badgeClass} me-1" style="font-size:0.65rem;">${p.kind}</span>
                        ${p.label}
                    </label>
                    <span class="text-muted" style="font-size:0.7rem;">${p.type}</span>
                </div>`;
            }).join('');
            return `<div class="mb-4">
                <h6 class="fw-bold text-muted text-uppercase small mb-2">${label}</h6>
                <div class="border rounded p-2 bg-light">${rows}</div>
            </div>`;
        };

        document.getElementById('common-fields-editor-body').innerHTML = leagues.map(l =>
            renderSection(l.id, 'prefix', `${l.label} — Prefix (before game fields)`) +
            renderSection(l.id, 'suffix', `${l.label} — Suffix (after game fields)`)
        ).join('');

        window.bootstrap.Modal.getOrCreateInstance(document.getElementById('commonFieldsModal')).show();
    },

    saveCommonFields: function () {
        const leagues = this.data.leagues || DEFAULT_LEAGUES;
        const typeDefaults = {};
        leagues.forEach(l => { typeDefaults[l.id] = { prefix: [], suffix: [] }; });

        document.querySelectorAll('.cf-check:checked').forEach(el => {
            const { league, position, preset } = el.dataset;
            if (typeDefaults[league] && typeDefaults[league][position]) {
                typeDefaults[league][position].push(preset);
            }
        });

        this.data.type_defaults = typeDefaults;
        this._markDirty();
        window.bootstrap.Modal.getOrCreateInstance(document.getElementById('commonFieldsModal')).hide();

        // Re-render preview for current game
        const game = this.data.games.find(g => g.id === this.activeGameId);
        if (game) this.renderCommonFieldsPreview(game);
    },

    updateGameField: function (field, value) {
        if (!this.activeGameId) return;
        const game = this.data.games.find(g => g.id === this.activeGameId);
        if (!game) return;

        if (this.aiUpdateSnapshot && this.aiUpdateSnapshot._gameId === this.activeGameId) {
            this._clearAiUpdateSnapshot();
        }

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

        this._markDirty();
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
            // Only bracket_result is bracket-specific; off_score/final_rank/overall_points
            // are common suffix fields injected by the Collator for all patrol/troop games.
            if (!game.scoring_model.inputs.find(c => c.id === "bracket_result")) {
                const preset = this.presets.find(p => p.id === "bracket_result") ||
                    SYSTEM_PRESETS.find(p => p.id === "bracket_result");
                if (preset) {
                    const copy = JSON.parse(JSON.stringify(preset));
                    copy.audience = "judge";
                    game.scoring_model.inputs.unshift(copy);
                }
            }
        }
        this._markDirty();
        this.renderScoringInputs(game.scoring_model.inputs, game.id, "game");
    },

    toggleScoringMode: function (gameId, isSubmission) {
        const game = this.data.games.find(g => g.id === gameId);
        if (!game) return;
        game.scoring_mode = isSubmission ? 'submission' : 'sequential';
        this._markDirty();
        // Re-render fields so the Phase selector appears/disappears
        this.renderScoringInputs(game.scoring_model.inputs, game.id, "game");
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

        // Determine if submission mode is active for this game
        const game = contextType === "game" ? this.data.games.find(g => g.id === contextId) : null;
        const isSubmissionMode = game?.scoring_mode === 'submission';

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
                        <label class="form-check-label small fw-bold text-muted d-block me-4" style="white-space:nowrap;">Official Only</label>
                      </div>
                      ${isSubmissionMode ? `
                      <div class="text-end">
                        <label class="small fw-bold text-muted d-block">Phase</label>
                        <select class="form-select form-select-sm" style="width:90px;"
                                onchange="composer.updateComponent('${contextId}', ${index}, 'phase', parseInt(this.value), '${contextType}')">
                          <option value="1" ${(comp.phase || 1) === 1 ? 'selected' : ''}>1 – Per Patrol</option>
                          <option value="2" ${comp.phase === 2 ? 'selected' : ''}>2 – Comparative</option>
                        </select>
                      </div>` : ''}
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

        this._markDirty();
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

        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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

        this._markDirty();
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
        this._markDirty();
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

            this._markDirty();
            this.renderScoringInputs(game.scoring_model.inputs, game.id, "game");
        }
        bootstrap.Modal.getInstance(document.getElementById("presetModal")).hide();
    },

    renderScoringPreview: function (id) {
        const game = this.data.games.find(g => g.id === (id || this.activeGameId));
        if (!game) return;

        const normalized = normalizeGameDefinition(game);

        // Inject common prefix/suffix fields from presets, mirroring Collator runtime behavior
        const typeDefaults = this.data.type_defaults || {};
        const defaults = typeDefaults[normalized.league] || {};
        const presetsById = Object.fromEntries((this.presets || []).map(p => [p.id, p]));
        const variables = normalized.variables || {};

        function applyTemplate(str) {
            if (!str) return str;
            return str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '___');
        }

        function resolvePreset(presetId) {
            const p = presetsById[presetId];
            if (!p) return null;
            const { config = {}, position, sortOrder, ...rest } = p;
            return {
                ...rest,
                label: applyTemplate(p.label),
                placeholder: applyTemplate(config.placeholder),
                ...(config.min !== undefined ? { min: config.min } : {}),
                ...(config.max !== undefined ? { max: config.max } : {}),
                ...(config.options ? { options: config.options } : {}),
                ...(config.defaultValue !== undefined ? { defaultValue: config.defaultValue } : {})
            };
        }

        const prefixFields = (defaults.prefix || []).map(resolvePreset).filter(Boolean);
        const suffixFields = (defaults.suffix || []).map(resolvePreset).filter(Boolean);
        const allFields = [...prefixFields, ...normalized.fields, ...suffixFields]
            .filter(f => f.audience !== 'admin');

        const html = allFields.map(f => generateFieldHTML(f)).join("");

        const modalBody = document.getElementById("previewModalBody");
        const modalTitle = document.getElementById("previewModalTitle");
        const dialog = document.getElementById("previewModalDialog");

        if (dialog) dialog.style.maxWidth = '400px';

        if (modalBody) modalBody.innerHTML = `<div class="p-2">${html}</div>`;
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

    openPrintGuidesModal: function () {
        const allGames = this.data.games
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        const patrol = allGames.filter(g => (g.league || 'patrol-games') === 'patrol-games');
        const troop  = allGames.filter(g => g.league === 'troop-challenges');

        if (!patrol.length && !troop.length) {
            alert('No games found.');
            return;
        }

        const renderGroup = (games, prefixLetter, label) => {
            if (!games.length) return '';
            const items = games.map((game, i) => {
                const title = game.content?.title || game.id;
                const prefix = `${prefixLetter}${i + 1}`;
                return `<div class="form-check ms-2">
                    <input class="form-check-input print-guide-check" type="checkbox"
                           value="${game.id}" id="pgc_${game.id}" checked
                           data-prefix="${prefix}">
                    <label class="form-check-label" for="pgc_${game.id}">
                        <span class="text-muted me-1 font-monospace small">${prefix}</span> ${title}
                    </label>
                </div>`;
            }).join('');
            return `<div class="mb-3">
                <div class="text-uppercase small fw-bold text-muted mb-1 border-bottom pb-1">${label}</div>
                ${items}
            </div>`;
        };

        document.getElementById('printGuidesGameList').innerHTML =
            renderGroup(patrol, 'p', 'Patrol Games') +
            renderGroup(troop,  't', 'Troop Challenges');

        new bootstrap.Modal(document.getElementById('printGuidesModal')).show();
    },

    toggleAllGuideChecks: function (checked) {
        document.querySelectorAll('.print-guide-check').forEach(cb => cb.checked = checked);
    },

    _printGuidesWindow: function (sections, title) {
        const sectionDivs = sections.map(s => `<div class="guide-section">${s}</div>`).join('\n');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { size: 8.5in 11in portrait; margin: 0.75in; }
  body { font-family: Georgia, serif; font-size: 11pt; color: #111; }
  .page-break { page-break-after: always; break-after: page; height: 0; }
  h1 { font-size: 18pt; margin-bottom: 4px; }
  h2 { font-size: 14pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  h3 { font-size: 12pt; }
  ul, ol { margin-left: 20px; }
  p { margin: 6px 0; }
</style>
</head>
<body>${sectionDivs}</body>
</html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (!win) { alert('Pop-up blocked — allow pop-ups for this page and try again.'); URL.revokeObjectURL(url); return; }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        win.addEventListener('load', () => {
            // CSS break-before:right is unreliable in Chrome — compute blank pages in JS instead.
            // Measure at print content width (8.5in - 2×0.75in = 7in = 672px at 96dpi) so
            // offsetHeight matches the print page height (11in - 2×0.75in = 9.5in = 912px).
            const PRINT_W = 672;
            const PAGE_H  = 912;
            const doc = win.document;

            // Force print-width layout for accurate height measurements.
            doc.body.style.cssText = `width:${PRINT_W}px;margin:0;padding:0;`;

            // Measure ALL sections before mutating the DOM. DOM insertions from
            // earlier iterations (page-break divs with break-after:page) can affect
            // layout of subsequent sections if measured inside the loop.
            const sections = [...doc.querySelectorAll('.guide-section')];
            const pageCounts = sections.map(sec => {
                // The gameguide template embeds inline page-break divs between its three
                // audience sections (Script / Official's Playbook / Logistics). Each break
                // forces a new printed page. A sub-section can independently overflow onto
                // a second page (e.g. P12 Clown Car with its long Stage descriptions).
                // Measuring the whole section's offsetHeight and dividing misses those
                // overflow pages because the embedded breaks contribute zero screen height.
                // Fix: measure each sub-section independently and sum their page counts.
                const pageBreakDivs = [...sec.querySelectorAll('div[style*="page-break-after"]')];
                if (pageBreakDivs.length === 0) {
                    return Math.max(1, Math.ceil(sec.offsetHeight / PAGE_H));
                }
                const secTop = sec.getBoundingClientRect().top;
                let total = 0;
                let prevY = 0; // distance from sec top to start of current sub-section
                pageBreakDivs.forEach(br => {
                    const brY = br.getBoundingClientRect().top - secTop;
                    total += Math.max(1, Math.ceil((brY - prevY) / PAGE_H));
                    prevY = brY; // embedded breaks have height 0, so top === bottom
                });
                // Final sub-section after the last embedded break
                total += Math.max(1, Math.ceil((sec.offsetHeight - prevY) / PAGE_H));
                return total;
            });

            // Restore body CSS before inserting breaks and printing.
            doc.body.style.cssText = '';

            let cumPages = 0;
            sections.forEach((sec, i) => {
                cumPages += pageCounts[i];

                // Mandatory break advances cursor to next page after this game's content.
                const br = doc.createElement('div');
                br.className = 'page-break';
                sec.after(br);

                // If cumulative page count is odd, the mandatory break lands on an even
                // (left-hand) page. One more break reaches the next odd (right-hand) page
                // so the next game starts on the front side of its folded packet.
                if (cumPages % 2 !== 0) {
                    const blank = doc.createElement('div');
                    blank.className = 'page-break';
                    br.after(blank);
                    cumPages++; // keep parity tracking correct for subsequent guides
                }
            });

            const s = doc.createElement('script');
            s.textContent = 'setTimeout(window.print, 250);';
            doc.body.appendChild(s);
        });
    },

    executePrintGuides: async function () {
        const checks = [...document.querySelectorAll('.print-guide-check:checked')];
        if (!checks.length) { alert('Select at least one game guide to print.'); return; }

        const prefixMap = {};
        checks.forEach(cb => { prefixMap[cb.value] = cb.dataset.prefix; });

        const selectedIds = new Set(Object.keys(prefixMap));
        const games = [...this.data.games]
            .filter(g => selectedIds.has(g.id))
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        bootstrap.Modal.getInstance(document.getElementById('printGuidesModal'))?.hide();

        try {
            if (!this._gameGuideTemplate) {
                const res = await fetch('/templates/gameguide.md');
                if (!res.ok) throw new Error("Could not fetch gameguide template");
                this._gameGuideTemplate = await res.text();
            }

            const template = Handlebars.compile(this._gameGuideTemplate);
            const workspaceId = this.data.meta.camporeeId || 'camp0002';

            const sections = games.map(game => {
                const context = { ...game, displayPrefix: prefixMap[game.id] };
                const markdown = template(context);
                return marked.parse(markdown, { baseUrl: `/api/camporee/${workspaceId}/games/` });
            });

            this._printGuidesWindow(sections, `Game Guides — ${this.data.meta.title || 'Camporee'}`);
        } catch (e) {
            console.error(e);
            alert("Error generating guides: " + e.message);
        }
    },

    printAllGuides: async function (leagueOrType) {
        // Accept legacy type strings passed from EJS buttons
        const legacyTypeMap = { patrol: 'patrol-games', troop: 'troop-challenges', exhibition: 'exhibition' };
        const leagueId = legacyTypeMap[leagueOrType] || leagueOrType;

        const games = this.data.games
            .filter(g => (g.league || 'patrol-games') === leagueId)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        if (!games.length) { alert(`No games found for this league.`); return; }

        try {
            if (!this._gameGuideTemplate) {
                const res = await fetch('/templates/gameguide.md');
                if (!res.ok) throw new Error("Could not fetch gameguide template");
                this._gameGuideTemplate = await res.text();
            }

            const template = Handlebars.compile(this._gameGuideTemplate);
            const workspaceId = this.data.meta.camporeeId || 'camp0002';

            const prefixLetter = leagueId === 'troop-challenges' ? 't' : leagueId === 'exhibition' ? 'e' : 'p';
            const sections = games.map((game, i) => {
                const context = { ...game, displayPrefix: `${prefixLetter}${i + 1}` };
                const markdown = template(context);
                return marked.parse(markdown, { baseUrl: `/api/camporee/${workspaceId}/games/` });
            });

            const league = (this.data.leagues || DEFAULT_LEAGUES).find(l => l.id === leagueId);
            const title = `${league?.label || leagueId} Guides — ${this.data.meta.title || 'Camporee'}`;
            this._printGuidesWindow(sections, title);
        } catch (e) {
            console.error(e);
            alert("Error generating guides: " + e.message);
        }
    },

    printSupplies: function (mode) {
        const sorted = (arr) => [...arr].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        const patrol = sorted(this.data.games.filter(g => (g.league || 'patrol-games') === 'patrol-games'));
        const troop  = sorted(this.data.games.filter(g => g.league === 'troop-challenges'));
        const other  = sorted(this.data.games.filter(g => g.league && g.league !== 'patrol-games' && g.league !== 'troop-challenges'));

        const games = [...patrol, ...troop, ...other];
        if (!games.length) { alert('No games to print.'); return; }

        // Build prefix map using same P#/T# convention as game guides
        const prefixMap = new Map();
        patrol.forEach((g, i) => prefixMap.set(g.id, `P${i + 1}`));
        troop.forEach((g, i)  => prefixMap.set(g.id, `T${i + 1}`));
        other.forEach(g       => prefixMap.set(g.id, ''));

        const camporeeTitle = this.data.meta.title || 'Camporee';
        const CONT_SPLIT = 30; // lines before inserting a cont. header in continuous mode

        const renderLines = (lines) => {
            if (!lines.length) return '<p class="no-supplies">No supplies listed.</p>';
            return '<ul class="supplies-list">' + lines.map(line => {
                const indented = /^\s/.test(line);
                return `<li${indented ? ' class="sub"' : ''}>${line.trim()}</li>`;
            }).join('') + '</ul>';
        };

        const gameHtml = games.map(game => {
            const prefix = prefixMap.get(game.id);
            const title = (prefix ? `${prefix} ` : '') + (game.content?.title || game.id);
            const suppliesRaw = (game.content?.supplies_text || '').trim();
            const lines = suppliesRaw ? suppliesRaw.split('\n') : [];

            if (mode === 'per-page') {
                return `<div class="game-section per-page">
                    <h2 class="game-title">${title}</h2>
                    ${renderLines(lines)}
                </div>`;
            }

            // Continuous: pre-split very long lists so cont. headers appear at predictable intervals
            if (lines.length <= CONT_SPLIT) {
                return `<div class="game-section">
                    <h2 class="game-title">${title}</h2>
                    ${renderLines(lines)}
                </div>`;
            }
            let html = '';
            for (let i = 0; i < lines.length; i += CONT_SPLIT) {
                const isCont = i > 0;
                html += `<div class="game-section">
                    <h2 class="game-title${isCont ? ' cont' : ''}">${title}${isCont ? ' <em class="cont-label">(cont.)</em>' : ''}</h2>
                    ${renderLines(lines.slice(i, i + CONT_SPLIT))}
                </div>`;
            }
            return html;
        }).join('\n');

        const suppliesHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Supplies List — ${camporeeTitle}</title>
<style>
  @page { size: portrait; margin: 0.75in; }
  body { font-family: Georgia, serif; font-size: 11pt; color: #111; }
  h1 { font-size: 16pt; border-bottom: 2px solid #333; padding-bottom: 6px; margin-bottom: 1.2em; }
  .game-section { margin-bottom: 1.2em; }
  .game-section.per-page { break-after: page; }
  .game-title { font-size: 14pt; font-weight: bold; margin: 0 0 0.3em 0; break-after: avoid; }
  .game-title.cont { color: #555; }
  .cont-label { font-style: italic; font-weight: normal; font-size: 11pt; }
  .supplies-list { margin: 0.2em 0 0 1.8em; padding: 0; }
  .supplies-list li { margin-bottom: 0.1em; }
  .supplies-list li.sub { margin-left: 1.5em; list-style-type: circle; }
  .no-supplies { color: #999; font-style: italic; margin-left: 1.8em; }
</style>
</head>
<body>
<h1>Supplies List — ${camporeeTitle}</h1>
${gameHtml}
<script>setTimeout(window.print, 250);<\/script>
</body>
</html>`;
        const blob = new Blob([suppliesHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (!win) { alert('Pop-up blocked — allow pop-ups for this page and try again.'); }
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    },

    printPreview: function () {
        const modalBody = document.getElementById('previewModalBody').innerHTML;
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
            body { padding: 20px; max-width: 800px; margin: 0 auto; font-family: sans-serif; }
        </style></head><body>
            <div>${modalBody}</div>
            <script>setTimeout(window.print, 250);<\/script>
        </body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (!win) { alert('Pop-up blocked — allow pop-ups for this page and try again.'); }
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    },

    openBrainstormModal: function () {
        if (!this.data.meta.theme) {
            alert("Please enter a Theme first!");
            return;
        }

        document.getElementById('brainstormLoading').classList.add('d-none');
        document.getElementById('brainstormResults').classList.add('d-none');
        document.getElementById('brainstormRefineInput').value = '';

        window.bootstrap.Modal.getOrCreateInstance(document.getElementById('brainstormModal')).show();
        this.runBrainstorm();
    },

    testAIKey: async function () {
        const btn = document.getElementById('testAIBtn');
        const icon = btn ? btn.querySelector('i') : null;
        if (icon) icon.className = "fas fa-spinner fa-spin";

        try {
            const data = await this.api.testAIKey();
            if (data.success) {
                alert("✅ " + data.message);
            } else {
                alert("❌ " + data.message);
            }
        } catch (err) {
            alert("❌ Error: " + err.message);
        }

        if (icon) icon.className = "fas fa-key";
    },

    runBrainstorm: async function () {
        const theme = this.data.meta.theme;
        const instruction = document.getElementById('brainstormRefineInput').value;

        document.getElementById('brainstormLoading').classList.remove('d-none');
        document.getElementById('brainstormResults').classList.add('d-none');

        try {
            const data = await this.api.brainstormTheme({ theme, instruction });

            document.getElementById('bsOptionAction').innerText = data.action || "No action option returned.";
            document.getElementById('bsOptionLore').innerText = data.lore || "No lore option returned.";
            document.getElementById('bsOptionSkill').innerText = data.skill || "No skill option returned.";

            document.getElementById('brainstormLoading').classList.add('d-none');
            document.getElementById('brainstormResults').classList.remove('d-none');
        } catch (err) {
            document.getElementById('brainstormLoading').classList.add('d-none');
            alert(err.message || "Failed to brainstorm. Check server logs or API key.");
        }
    },

    selectBrainstorm: function (type) {
        let text = "";
        if (type === 'action') text = document.getElementById('bsOptionAction').innerText;
        else if (type === 'lore') text = document.getElementById('bsOptionLore').innerText;
        else if (type === 'skill') text = document.getElementById('bsOptionSkill').innerText;

        this.data.meta.introduction = text;
        this.updateMetaUI();
        window.bootstrap.Modal.getInstance(document.getElementById('brainstormModal')).hide();
    },

    openThemeModal: function (id) {
        if (!this.data.meta.theme && !this.data.meta.introduction) {
            alert("Please provide a Camporee Theme or Introduction first so the AI has context!");
            return;
        }

        const game = this.data.games.find(g => g.id === id);
        if (!game) return;
        this.activeThemeGameId = id; // Track which game we are theming

        // Show context
        const contextStr = `${this.data.meta.theme || 'No Theme'} - ${this.data.meta.introduction || ''}`;
        document.getElementById('themeContextText').innerText = contextStr;

        // Setup initial UI state
        document.getElementById('themeLoading').classList.add('d-none');
        document.getElementById('themeResults').classList.add('d-none');
        document.getElementById('themeRevertBtn').classList.add('d-none');
        document.getElementById('themeCommitBtn').classList.add('d-none');
        document.getElementById('themeRefineInput').value = '';

        window.bootstrap.Modal.getOrCreateInstance(document.getElementById('themeModal')).show();
    },

    runThemeGame: async function () {
        const id = this.activeThemeGameId;
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;

        const instruction = document.getElementById('themeRefineInput').value;
        const camporeeContext = `Theme: ${this.data.meta.theme || 'N/A'}\nIntro: ${this.data.meta.introduction || 'N/A'}`;

        document.getElementById('themeLoading').classList.remove('d-none');
        document.getElementById('themeResults').classList.add('d-none');
        document.getElementById('themeCommitBtn').classList.add('d-none');

        try {
            // Give AI the generic snapshot if we have it, otherwise standard content
            const payloadGame = game.source_snapshot ? game.source_snapshot : game;

            const themedGame = await this.api.themeGame({
                camporeeContext,
                gameJson: payloadGame,
                instruction
            });

            this.pendingThemedDraft = themedGame; // Store iteration draft

            this.renderThemeComparison(payloadGame, themedGame);

            document.getElementById('themeLoading').classList.add('d-none');
            document.getElementById('themeResults').classList.remove('d-none');
            document.getElementById('themeCommitBtn').classList.remove('d-none');
        } catch (err) {
            document.getElementById('themeLoading').classList.add('d-none');
            alert(err.message || "Failed to theme game. Check server logs.");
        }
    },

    renderThemeComparison: function (original, themed) {
        // Simple markdown preview of fields
        const buildPreview = (g) => {
            let html = `<strong>Title:</strong> ${g.game_title || g.title || ''}<hr>`;
            if (g.content) {
                const parseField = (val) => {
                    if (Array.isArray(val)) return marked.parse(val.join('\n'));
                    return marked.parse(val || '');
                };
                html += `<strong>Story:</strong><br>${parseField(g.content.story)}<hr>`;
                html += `<strong>Briefing:</strong><br>${parseField(g.content.briefing)}<hr>`;
                html += `<strong>Rules:</strong><br>${parseField(g.content.rules)}<hr>`;
            }
            if (g.scoring_model && g.scoring_model.inputs) {
                html += `<strong>Scoring Labels:</strong><ul>`;
                g.scoring_model.inputs.forEach(i => {
                    html += `<li>${i.label} (${i.type})</li>`;
                });
                html += `</ul>`;
            }
            return html;
        };

        const origEl = document.getElementById('themeOriginalPreview');
        const draftEl = document.getElementById('themeDraftPreview');

        origEl.innerHTML = buildPreview(original);
        draftEl.innerHTML = buildPreview(themed);
    },

    commitTheme: function () {
        const id = this.activeThemeGameId;
        const game = this.data.games.find(g => g.id === id);
        if (!game || !this.pendingThemedDraft) return;

        // Ensure we preserve the snapshot before replacing content
        if (!game.source_snapshot) {
            game.source_snapshot = {
                content: JSON.parse(JSON.stringify(game.content)),
                scoring_model: JSON.parse(JSON.stringify(game.scoring_model))
            };
        }

        // Apply themed draft
        game.game_title = this.pendingThemedDraft.game_title || game.game_title;
        game.content = this.pendingThemedDraft.content || game.content;
        game.scoring_model = this.pendingThemedDraft.scoring_model || game.scoring_model;

        this.pendingThemedDraft = null;
        this.activeThemeGameId = null;

        this._markDirty();

        // Rerender editor
        this.editGame(id);

        window.bootstrap.Modal.getInstance(document.getElementById('themeModal')).hide();
    },

    revertTheme: function () {
        if (!confirm("Are you sure you want to revert this game back to your original generic template? All current custom themed text will be lost.")) {
            return;
        }

        const id = this.activeThemeGameId || this.activeGameId; // Allow calling from editor header later
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;

        if (game.source_snapshot) {
            game.content = JSON.parse(JSON.stringify(game.source_snapshot.content));
            if (game.source_snapshot.scoring_model) {
                game.scoring_model = JSON.parse(JSON.stringify(game.source_snapshot.scoring_model));
            }
            game.game_title = game.library_title || "Untitled Game";

            // Remove the snapshot since it is now generic again
            delete game.source_snapshot;

            this.editGame(id);

            // If modal happens to be open, close it
            const modalEl = document.getElementById('themeModal');
            if (modalEl && modalEl.classList.contains('show')) {
                window.bootstrap.Modal.getInstance(modalEl).hide();
            }

            setTimeout(() => alert("Game reverted to generic template."), 300);
        } else {
            alert("This game does not have an original generic snapshot to revert to.");
        }
    },

    // --- AI UPDATE ---

    _clearAiUpdateSnapshot: function () {
        this.aiUpdateSnapshot = null;
        const btn = document.getElementById('aiUpdateRevertBtn');
        if (btn) btn.classList.add('d-none');
    },

    openAiUpdateModal: function (id) {
        if (!id) id = this.activeGameId;
        if (!this.data.games.find(g => g.id === id)) return;

        document.getElementById('aiUpdatePrompt').value = '';
        document.getElementById('aiUpdateIncludeContent').checked = true;
        document.getElementById('aiUpdateModel').value = 'gemini-2.5-flash';
        document.getElementById('aiUpdateSubmitBtn').disabled = false;
        document.getElementById('aiUpdateSubmitBtn').innerHTML = '<i class="fas fa-bolt me-1"></i>Submit';
        document.getElementById('aiUpdateStatus').textContent = '';
        document.getElementById('aiUpdateStatus').className = 'mt-3 small text-center';

        window.bootstrap.Modal.getOrCreateInstance(document.getElementById('aiUpdateModal')).show();
    },

    submitAiUpdate: async function () {
        const id = this.activeGameId;
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;

        const prompt = document.getElementById('aiUpdatePrompt').value.trim();
        const statusEl = document.getElementById('aiUpdateStatus');
        if (!prompt) {
            statusEl.textContent = 'Please enter a prompt.';
            statusEl.className = 'mt-3 small text-center text-danger';
            return;
        }

        const includeContent = document.getElementById('aiUpdateIncludeContent').checked;
        const model = document.getElementById('aiUpdateModel').value;
        const currentContent = {
            game_title: game.game_title || '',
            challenge: game.content.challenge || '',
            story: game.content.story || '',
            description: game.content.description || '',
            rules: game.content.rules || [],
            time_and_scoring: game.content.time_and_scoring || '',
            scoring_notes: game.content.scoring_notes || '',
            staffing: game.content.staffing || '',
            setup: game.content.setup || '',
            reset: game.content.reset || '',
            supplies_text: game.content.supplies_text || '',
        };

        // Save snapshot for undo before making any changes
        this.aiUpdateSnapshot = { ...JSON.parse(JSON.stringify(currentContent)), _gameId: id };

        const submitBtn = document.getElementById('aiUpdateSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Working…';
        statusEl.textContent = 'Sending to AI…';
        statusEl.className = 'mt-3 small text-center text-muted';

        try {
            const result = await this.api.updateGame({
                prompt,
                model,
                includeContent,
                currentContent: includeContent ? currentContent : null
            });

            this.applyAiUpdate(id, result);
            window.bootstrap.Modal.getInstance(document.getElementById('aiUpdateModal')).hide();

        } catch (err) {
            statusEl.textContent = err.message || 'AI update failed. Check server logs.';
            statusEl.className = 'mt-3 small text-center text-danger';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-bolt me-1"></i>Submit';
            this.aiUpdateSnapshot = null;
        }
    },

    applyAiUpdate: function (id, data) {
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;

        if (data.game_title !== undefined) {
            game.game_title = data.game_title;
            if (game.content) game.content.title = data.game_title;
        }

        const contentFields = ['challenge', 'story', 'description', 'time_and_scoring',
            'scoring_notes', 'staffing', 'setup', 'reset', 'supplies_text'];
        contentFields.forEach(key => {
            if (data[key] !== undefined) game.content[key] = data[key];
        });

        if (Array.isArray(data.rules)) game.content.rules = data.rules;

        this._markDirty();
        this.editGame(id);
        // editGame re-renders the header, so show undo button after the DOM is rebuilt
        const revertBtn = document.getElementById('aiUpdateRevertBtn');
        if (revertBtn) revertBtn.classList.remove('d-none');
    },

    undoAiUpdate: function () {
        if (!this.aiUpdateSnapshot) return;
        const id = this.aiUpdateSnapshot._gameId;
        const game = this.data.games.find(g => g.id === id);
        if (!game) return;

        const snap = this.aiUpdateSnapshot;
        game.game_title = snap.game_title;
        if (game.content) game.content.title = snap.game_title;

        ['challenge', 'story', 'description', 'rules', 'time_and_scoring',
            'scoring_notes', 'staffing', 'setup', 'reset', 'supplies_text'].forEach(key => {
            game.content[key] = snap[key];
        });

        this._clearAiUpdateSnapshot();
        this._markDirty();
        this.editGame(id);
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

        // Fetch officials from server if in server mode
        let officials = [];
        if (this.isServerMode && this.data.meta.camporeeId) {
            try {
                officials = await this.api.getOfficials(this.data.meta.camporeeId);
            } catch (e) {
                console.warn('Failed to fetch officials for export:', e);
            }
        }

        const camporeeConfig = {
            schemaVersion: "3.0",
            meta: this.data.meta,
            terminology: this.data.terminology || null,
            leagues: this.data.leagues || DEFAULT_LEAGUES,
            sessions: this.data.sessions || [],
            rosters: this.data.rosters || { units: [], subunits: [], individuals: [] },
            officials: officials,
            playlist: playlist,
            type_defaults: this.data.type_defaults || DEFAULT_TYPE_DEFAULTS
        };

        zip.file("camporee.json", JSON.stringify(camporeeConfig, null, 2));
        zip.file("presets.json", JSON.stringify(this.presets, null, 2));

        const gamesFolder = zip.folder("games");
        this.data.games.forEach(g => {
            const gameFile = {
                id: g.id,
                league: g.league,
                session: g.session !== undefined ? g.session : null,
                sortOrder: g.sortOrder,
                schemaVersion: "3.0",
                content: g.content,
                scoring_model: {
                    ...g.scoring_model,
                    inputs: (g.scoring_model?.inputs || []).filter(f => !COMMON_FIELD_IDS.has(f.id))
                },
                match_label: g.match_label || ""
            };
            if (g.bracketMode) gameFile.bracketMode = true;
            if (g.variables) gameFile.variables = g.variables;

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
                this.data.leagues = config.leagues || JSON.parse(JSON.stringify(DEFAULT_LEAGUES));
                this.data.sessions = config.sessions || [];
                this.data.rosters = config.rosters || { units: [], subunits: [], individuals: [] };
                this.data.terminology = config.terminology || null;
                this.data.type_defaults = config.type_defaults || JSON.parse(JSON.stringify(DEFAULT_TYPE_DEFAULTS));

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
                    if (!g.league) g.league = "patrol-games";
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
                this._markClean();
                this._updateNavbar();
                this.updateMetaUI();
                this.renderGameLists();

                this.activeGameId = null;
                document.getElementById("editor-container").innerHTML = '<p class="text-muted">Select a game to edit.</p>';
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
                    this._markDirty();
                    this.renderGameLists();
                    this.editGame(game.id);
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
                    <small class="text-muted">${g.league || "patrol-games"}</small>
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
        this._markDirty();
        this.renderGameLists();
        bootstrap.Modal.getInstance(document.getElementById("importModal")).hide();
    }
};

window.composer = composer;
window.onload = async function () {
    await composer.init();
    if (window.DEMO_WORKSPACE_UUID) {
        await composer.loadFromServer(window.DEMO_WORKSPACE_UUID, true).catch(e => {
            console.warn('[demo] workspace auto-load failed:', e);
        });
    }
};