import { normalizeGameDefinition } from "../core/schema.js";
import { generateFieldHTML } from "../core/ui.js";
import { LibraryService } from "../core/library-service.js";
import { ApiClient } from "../core/api.js";

const SYSTEM_PRESETS = [
    {
        id: "p_flag",
        label: "Patrol Flag",
        type: "number",
        kind: "points",
        weight: 10,
        audience: "judge",
        config: { min: 0, max: 10, placeholder: "0-10 Points" }
    },
    {
        id: "p_yell",
        label: "Patrol Yell",
        type: "number",
        kind: "points",
        weight: 5,
        audience: "judge",
        config: { min: 0, max: 5, placeholder: "0-5 Points" }
    },
    {
        id: "p_spirit",
        label: "Scout Spirit",
        type: "number",
        kind: "points",
        weight: 10,
        audience: "judge",
        config: { min: 0, max: 10, placeholder: "0-10 Points" }
    },
    {
        id: "off_notes",
        label: "Judges Notes",
        type: "textarea",
        kind: "info",
        weight: 0,
        audience: "judge",
        config: { placeholder: "Issues, tie-breakers, etc." }
    },
    {
        id: "bracket_result",
        label: "Match Result",
        type: "text",
        kind: "info",
        weight: 0,
        audience: "judge",
        required: true,
        config: { placeholder: "Place:  1, 2, 3, 4....." }
    },
    {
        id: "final_rank",
        label: "Final Ranking",
        type: "select",
        kind: "info",
        weight: 0,
        audience: "admin",
        config: { options: ["1st Place", "2nd Place", "3rd Place", "4th Place", "Participant"] }
    },
    {
        id: "overall_points",
        label: "Overall Points",
        type: "number",
        kind: "points",
        weight: 1,
        audience: "admin",
        config: { placeholder: "e.g., 100, 90, 80..." }
    }
];

const curator = {
    activeTemplatePath: null,
    catalog: [],
    data: null,
    originalData: null,
    presets: JSON.parse(JSON.stringify(SYSTEM_PRESETS)),
    api: new ApiClient('/composer/api'),

    generateUUID: function () {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    isDirty: function () {
        if (!this.data) return false;
        return JSON.stringify(this.data) !== this.originalData;
    },

    init: async function () {
        console.log("Curator App Initialized");
        await this.loadCatalog();
        this.injectModals();
        if (!this.data) {
            this.newTemplate();
        }
    },

    loadCatalog: async function () {
        const libService = new LibraryService();
        try {
            const catalogData = await libService.getCatalog();
            this.catalog = catalogData.components || [];
            this.renderLibrary();
        } catch (e) {
            console.error("Failed to load catalog:", e);
            document.getElementById('library-status').innerHTML =
                `<span class="text-danger">Error: ${e.message}</span>`;
            alert("Catalog Load Error: " + e.message);
        }
    },

    renderLibrary: function () {
        const listEl = document.getElementById("library-list");
        const statusEl = document.getElementById("library-status");

        if (listEl) {
            listEl.innerHTML = "";
            if (this.catalog.length > 0) {
                this.catalog.forEach(game => {
                    const li = document.createElement("li");
                    li.className = "library-item px-3 py-2 border-bottom";

                    if (this.activeTemplatePath === game.path) {
                        li.classList.add("bg-light");
                    }

                    const tagsHtml = (game.tags || []).map(tag =>
                        `<span class="badge bg-secondary me-1" style="font-size: 0.65rem;">${tag}</span>`
                    ).join("");

                    li.innerHTML = `
                        <div class="d-flex justify-content-between align-items-start" 
                             style="cursor:pointer" 
                             onclick="curator.loadTemplate('${game.path}')">
                            <div class="flex-grow-1">
                                <span class="item-title d-block fw-bold ${this.activeTemplatePath === game.path ? "text-primary" : ""}">
                                    ${game.title}
                                </span>
                                <div class="item-tags mt-1">${tagsHtml}</div>
                            </div>
                        </div>
                    `;
                    listEl.appendChild(li);
                });
                if (statusEl) {
                    statusEl.innerText = `${this.catalog.length} templates`;
                }
            } else {
                if (statusEl) {
                    statusEl.innerText = "Catalog empty";
                }
            }
        }
    },

    filterCatalog: function () {
        const query = document.getElementById('catalog-search').value.toLowerCase();
        const items = document.querySelectorAll('#library-list .library-item');

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

    newTemplate: function () {
        if (this.data && this.isDirty() && !confirm("Discard changes to current template?")) {
            return;
        }

        this.activeTemplatePath = null;
        this.data = {
            id: this.generateUUID(),
            library_title: "New Template",
            game_title: "New Template",
            type: "patrol",
            category: "Teamwork",
            content: {
                story: "",
                challenge: "",
                description: "",
                rules: [],
                time_and_scoring: "",
                scoring_notes: "",
                staffing: "",
                setup: "",
                reset: "",
                supplies: []
            },
            tags: [],
            scoring_model: {
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
                        config: { min: 0, max: 10, placeholder: "" }
                    }
                ]
            },
            variants: []
        };
        this.originalData = JSON.stringify(this.data);
        this.renderEditor();
        this.renderLibrary();
    },

    loadTemplate: async function (path) {
        if (this.activeTemplatePath === path) return;
        if (this.activeTemplatePath && this.isDirty() && !confirm("Discard changes to current template?")) return;

        const libService = new LibraryService();
        try {
            const game = await libService.getGame(path);

            // Normalize data structure (Hybrid Schema)
            // Handle legacy fields by mapping them to new structure
            this.data = {
                id: game.id || game.library_uuid || this.generateUUID(),
                library_title: game.library_title || game.base_title || game.title || "Untitled",
                game_title: game.game_title || game.title || game.content?.title || game.library_title || "Untitled",
                type: game.type || "patrol",
                category: game.category || "Teamwork",
                content: {
                    story: game.content?.story || game.content?.legend || game.story || game.meta?.story || "",
                    challenge: game.content?.challenge || game.content?.quest || game.description || "",
                    description: game.content?.description || game.content?.briefing || game.instructions || game.meta?.instructions || "",
                    rules: game.content?.rules || game.rules || [],
                    time_and_scoring: game.content?.time_and_scoring || game.content?.scoring_overview || "",
                    scoring_notes: game.content?.scoring_notes || game.content?.judging_notes || "",
                    staffing: game.content?.staffing || game.content?.logistics?.staffing || "",
                    setup: game.content?.setup || game.content?.logistics?.setup || "",
                    reset: game.content?.reset || game.content?.logistics?.reset || "",
                    supplies: game.content?.supplies || game.content?.logistics?.supplies || game.supplies || []
                },
                tags: game.tags || game.meta?.tags || [],
                scoring_model: {
                    method: game.scoring_model?.method || game.scoring?.method || "points_desc",
                    inputs: (game.scoring_model?.inputs || game.scoring?.components || []).map(input => ({
                        id: input.id || `f_${Math.random().toString(36).substr(2)}`,
                        label: input.label,
                        type: input.type === "timer" ? "stopwatch" : (input.type || "number"),
                        kind: input.type === "timer" ? "metric" : (input.type === "header" ? "info" : (input.kind || "points")),
                        weight: input.weight !== undefined ? input.weight : 1,
                        audience: input.audience || "judge",
                        sortOrder: input.sortOrder || 0,
                        config: {
                            min: input.config?.min || 0,
                            max: input.config?.max || input.max_points || 0,
                            placeholder: input.config?.placeholder || input.placeholder || "",
                            options: input.config?.options || []
                        }
                    }))
                },
                variants: game.variants || []
            };

            this.originalData = JSON.stringify(this.data);
            this.activeTemplatePath = path;
            this.renderEditor();
            this.renderLibrary();
        } catch (e) {
            alert("Failed to load template: " + e.message);
        }
    },

    saveTemplate: async function () {
        if (!this.data) return;

        // Ensure tags have hash prefix
        if (this.data.tags && Array.isArray(this.data.tags)) {
            this.data.tags = this.data.tags.map(t => t.startsWith('#') ? t : `#${t}`);
        }

        let path = this.activeTemplatePath;
        if (!path) {
            const filename = prompt("Enter filename (e.g. fire/matchless.json):");
            if (!filename) return;
            path = filename.endsWith(".json") ? filename : `${filename}.json`;
        }

        // Hybrid Schema Payload
        const payload = {
            path: path,
            data: {
                id: this.data.id,
                library_title: this.data.library_title,
                game_title: this.data.game_title,
                type: this.data.type,
                category: this.data.category,
                tags: this.data.tags,
                content: this.data.content, // Save nested content object directly
                scoring_model: {
                    method: this.data.scoring_model.method,
                    inputs: this.data.scoring_model.inputs.map(comp => ({
                        id: comp.id,
                        label: comp.label,
                        type: comp.type,
                        kind: comp.kind,
                        weight: comp.weight,
                        audience: comp.audience,
                        sortOrder: comp.sortOrder,
                        config: comp.config
                    }))
                },
                variants: this.data.variants
            }
        };

        try {
            const result = await this.api.saveLibraryGame(payload);
            if (result.success) {
                this.activeTemplatePath = path;
                this.catalog = result.catalog;
                this.originalData = JSON.stringify(this.data);
                this.renderLibrary();
                this.updateSaveButton();
            } else {
                alert("Error: " + result.error);
            }
        } catch (e) {
            alert("Save Failed: " + e.message);
        }
    },

    updateSaveButton: function () {
        const btn = document.getElementById("saveTemplateBtn");
        if (btn) {
            btn.disabled = !this.isDirty();
        }
    },

    renderEditor: function () {
        const container = document.getElementById("editor-container");
        if (!this.data) {
            container.innerHTML = '<div class="text-center p-5 text-muted">No template loaded</div>';
            return;
        }

        const data = this.data;
        container.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="mb-0">
                    <i class="fas fa-edit"></i> <span id="headerTitle">${data.library_title || "New Template"}</span>
                </h4>
                <div class="d-flex flex-column align-items-end gap-2">
                     <button class="btn btn-success w-100" id="saveTemplateBtn" onclick="curator.saveTemplate()" disabled>
                        <i class="fas fa-save"></i> Save Game
                     </button>
                     <button class="btn btn-outline-primary btn-sm w-100 d-none" id="previewBtnTop" onclick="curator.renderGuidePreview()">
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
                    <div class="card">
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-3 mb-3">
                                    <label class="form-label">Game UUID</label>
                                    <input type="text" class="form-control" id="gameId" value="${data.id || ""}">
                                </div>
                                <div class="col-md-3 mb-3">
                                    <label class="form-label text-muted">File Path</label>
                                    <input type="text" class="form-control bg-light text-muted" value="${this.activeTemplatePath || 'Unsaved'}" disabled readonly>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label" title="Original unthemed name in catalog">Library Title <i class="fas fa-info-circle text-muted"></i></label>
                                    <input type="text" class="form-control" id="libraryTitle" value="${data.library_title || ""}">
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label" title="Themed display name for this instance">Game Title <i class="fas fa-info-circle text-muted"></i></label>
                                    <input type="text" class="form-control fw-bold bg-light" id="gameTitle" value="${data.game_title || ""}" disabled readonly>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Type</label>
                                    <select class="form-select" id="gameType">
                                        <option value="patrol" ${data.type === 'patrol' ? 'selected' : ''}>Patrol Competition</option>
                                        <option value="troop" ${data.type === 'troop' ? 'selected' : ''}>Troop Competition</option>
                                        <option value="exhibition" ${data.type === 'exhibition' ? 'selected' : ''}>Exhibition / Individual</option>
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Category</label>
                                    <input type="text" class="form-control" id="gameCategory" list="categoryOptions" value="${data.category || ""}">
                                    <datalist id="categoryOptions">
                                        <option value="Fire Building">
                                        <option value="Cooking">
                                        <option value="Knots/Lashing">
                                        <option value="First Aid">
                                        <option value="Teamwork">
                                        <option value="Sports">
                                    </datalist>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Tags</label>
                                <input type="text" class="form-control" id="gameTags" placeholder="#tag1 #tag2" value="${(data.tags || []).join(" ")}">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- GAME GUIDE TAB (Content) -->
                <div class="tab-pane fade" id="content" role="tabpanel">
                     <div class="accordion accordion-flush border rounded mb-3" id="gameGuideAccordion">
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
                                        <input type="text" class="form-control" id="gameChallenge" placeholder="e.g. Boil water within 10 minutes" value="${data.content.challenge || ""}">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Story (Thematic Lore)</label>
                                        <textarea class="form-control" rows="6" id="gameStory" placeholder="Read this to the patrol...">${data.content.story || ""}</textarea>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Description (Instructions)</label>
                                        <textarea class="form-control" rows="6" id="gameDescription" placeholder="Specific instructions...">${data.content.description || ""}</textarea>
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
                                    <button class="btn btn-sm btn-outline-secondary mb-3" onclick="curator.addListItem('rules')">
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
                                        <textarea class="form-control" rows="6" id="gameTimeAndScoring" placeholder="General explanation...">${data.content.time_and_scoring || ""}</textarea>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Scoring Notes (Tips)</label>
                                        <textarea class="form-control" rows="6" id="gameScoringNotes" placeholder="Tips for the judge...">${data.content.scoring_notes || ""}</textarea>
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
                                        <textarea class="form-control" rows="6" id="gameStaffing">${data.content.staffing || ""}</textarea>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Setup Instructions</label>
                                        <textarea class="form-control" rows="6" id="gameSetup">${data.content.setup || ""}</textarea>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Reset Instructions</label>
                                        <textarea class="form-control" rows="6" id="gameReset">${data.content.reset || ""}</textarea>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Supplies Needed (Text)</label>
                                        <textarea class="form-control" rows="6" id="gameSuppliesText" placeholder="List of supplies...">${data.content.supplies_text || ""}</textarea>
                                    </div>
                                    <hr>
                                    <label class="form-label fw-bold">Itemized Supplies</label>
                                    <div class="alert alert-warning small">TODO: Implement structured supply list editor. For now, this is read-only in this view.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SCORING TAB -->
                <div class="tab-pane fade" id="scoring" role="tabpanel">
                    <div class="card">
                        <div class="card-header bg-light d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">Scoring Model</h5>
                            <div class="d-flex align-items-center gap-2">
                                <select class="form-select form-select-sm d-inline-block w-auto" id="gameScoringMethod">
                                    <option value="points_desc" ${data.scoring_model.method === 'points_desc' ? 'selected' : ''}>Highest Points</option>
                                    <option value="timed_asc" ${data.scoring_model.method === 'timed_asc' ? 'selected' : ''}>Lowest Time</option>
                                </select>
                                <button class="btn btn-sm btn-outline-secondary" onclick="curator.renderScoringPreview()">
                                    <i class="fas fa-eye"></i> Preview
                                </button>
                            </div>
                        </div>
                        <div class="card-body bg-light">
                            <div id="scoring-editor" class="d-flex flex-column gap-3"></div>
                            <div class="mt-4 text-center">
                                <div class="btn-group shadow-sm">
                                    <button class="btn btn-primary" onclick="curator.addGenericField('game')">
                                        <i class="fas fa-plus-circle"></i> Add Field
                                    </button>
                                    <button class="btn btn-outline-primary" onclick="curator.openPresetModal('game')">
                                        <i class="fas fa-magic"></i> Add Preset
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Bind events
        document.getElementById("gameId").oninput = (e) => { this.data.id = e.target.value; this.updateSaveButton(); };
        document.getElementById("libraryTitle").oninput = (e) => {
            const val = e.target.value;
            this.data.library_title = val;
            this.data.game_title = val; // Mirror changes to Game Title
            document.getElementById("gameTitle").value = val;
            document.getElementById("headerTitle").innerText = val || "New Template";
            this.updateSaveButton();
        };
        // gameTitle is now disabled, no need for oninput


        document.getElementById("gameType").onchange = (e) => { this.data.type = e.target.value; this.updateSaveButton(); };
        document.getElementById("gameCategory").oninput = (e) => { this.data.category = e.target.value; this.updateSaveButton(); };

        document.getElementById("gameTags").oninput = (e) => {
            this.data.tags = e.target.value.split(/[ ,]+/).filter(t => t);
            this.updateSaveButton();
        };

        document.getElementById("gameScoringMethod").onchange = (e) => {
            this.data.scoring_model.method = e.target.value;
            this.updateSaveButton();
        };

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
                        previewBtn.onclick = () => curator.renderScoringPreview();
                    } else {
                        previewBtn.classList.remove('d-none');
                        previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview Guide';
                        previewBtn.onclick = () => curator.renderGuidePreview();
                    }
                }
            });
        });

        // Content bindings
        document.getElementById("gameChallenge").oninput = (e) => { this.data.content.challenge = e.target.value; this.updateSaveButton(); };

        if (this.markdownEditors) {
            Object.values(this.markdownEditors).forEach(e => {
                if (e.toTextArea) e.toTextArea();
            });
        }
        this.markdownEditors = {};

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

                if (window.EasyMDE) {
                    const mde = new EasyMDE({
                        element: el,
                        spellChecker: false,
                        status: false,
                        minHeight: "100px",
                        initialValue: this.data.content[key] || "",
                        toolbar: ["bold", "italic", "heading", "|", "unordered-list", "ordered-list", "|", "link", "image", "|", "preview", "side-by-side", "fullscreen"]
                    });

                    mde.codemirror.on("change", () => {
                        this.data.content[key] = mde.value();
                        this.updateSaveButton();
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
                    el.oninput = (e) => {
                        this.data.content[key] = e.target.value;
                        this.updateSaveButton();
                    };
                }
            }
        });

        this.renderScoringInputs(data.scoring_model.inputs, "game");
        this.renderListEditor('rules', data.content.rules);
        // this.renderListEditor('supplies', data.content.supplies); // TODO: Structured supplies

        this.updateSaveButton();
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
                       oninput="curator.updateListItem('${type}', ${index}, this.value)">
                <button class="btn btn-outline-danger" onclick="curator.deleteListItem('${type}', ${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(row);
        });
    },

    addListItem: function (type) {
        if (!this.data.content[type]) this.data.content[type] = [];
        this.data.content[type].push("");
        this.renderListEditor(type, this.data.content[type]);
        this.updateSaveButton();
    },

    updateListItem: function (type, index, value) {
        if (this.data.content[type]) {
            this.data.content[type][index] = value;
            this.updateSaveButton();
        }
    },

    deleteListItem: function (type, index) {
        if (this.data.content[type]) {
            this.data.content[type].splice(index, 1);
            this.renderListEditor(type, this.data.content[type]);
            this.updateSaveButton();
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
                            <button type="button" class="btn btn-primary" onclick="curator.confirmInsertPreset()">
                                Insert
                            </button>
                        </div>
                    </div>
                </div>
            </div>`,
            `<div class="modal fade" id="previewModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-scrollable" id="previewModalDialog" style="max-width: min(95vw, 8.5in);">
                    <div class="modal-content">
                        <div class="modal-header bg-light">
                            <h5 class="modal-title" id="previewModalTitle">Game Preview</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="previewModalBody"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary d-none" id="previewPrintBtn" onclick="curator.printPreview()"><i class="fas fa-print"></i> Print</button>
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
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

    renderScoringInputs: function (components, contextId = "game") {
        const container = document.getElementById("scoring-editor");
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

                // HTML Generation for the component card
                card.innerHTML = `
                  <div class="card-body p-3 d-flex align-items-start">
                    <div class="me-3 mt-4 text-muted" style="cursor: grab;">
                        <i class="fas fa-grip-vertical fa-lg"></i>
                    </div>
                    
                    <div class="flex-grow-1 me-4">
                      <label class="form-label small text-muted fw-bold mb-1">Label</label>
                      <input type="text" class="form-control form-control-sm fw-bold mb-2" 
                             value="${comp.label || ""}" 
                             oninput="curator.updateComponent(${index}, 'label', this.value)">
                             
                      <label class="form-label small text-muted fw-bold mb-1">Description</label>
                      <input type="text" class="form-control form-control-sm text-muted" 
                             value="${comp.config?.placeholder || ""}" 
                             oninput="curator.updateConfig(${index}, 'placeholder', this.value)">
                    </div>
                    
                    <div class="d-flex flex-column gap-2 me-4" style="width: 340px;">
                      <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label small text-muted fw-bold mb-1">Type</label>
                            <select class="form-select form-select-sm" 
                                    onchange="curator.updateComponent(${index}, 'type', this.value)">
                                ${["number", "stopwatch", "text", "textarea", "checkbox", "select"]
                        .map(t => `<option value="${t}" ${comp.type === t ? "selected" : ""}>${t}</option>`)
                        .join("")}
                            </select>
                        </div>
                        <div class="col-6">
                            <label class="form-label small text-muted fw-bold mb-1">Kind</label>
                            <select class="form-select form-select-sm" 
                                    onchange="curator.handleKindChange(${index}, this.value)">
                                ${["points", "penalty", "metric", "info"]
                        .map(k => `<option value="${k}" ${comp.kind === k ? "selected" : ""}>${k}</option>`)
                        .join("")}
                            </select>
                        </div>
                      </div>
                      
                      <div>
                          <label class="form-label small text-muted fw-bold mb-1">
                            ${isSelect ? "Options" : "Limits & Weight"}
                          </label>
                          ${isSelect ?
                        `<input type="text" class="form-control form-control-sm" 
                                      placeholder="Option A, Option B..." 
                                      value="${(comp.config?.options || []).join(", ")}" 
                                      onchange="curator.updateConfig(${index}, 'options', this.value.split(',').map(s=>s.trim()))">`
                        :
                        `<div class="input-group input-group-sm">
                                <span class="input-group-text text-muted">Min</span>
                                <input type="number" class="form-control" 
                                       value="${comp.config?.min || ""}" 
                                       onchange="curator.updateConfig(${index}, 'min', this.value)">
                                <span class="input-group-text text-muted">Max</span>
                                <input type="number" class="form-control" 
                                       value="${comp.config?.max || ""}" 
                                       onchange="curator.updateConfig(${index}, 'max', this.value)">
                                <span class="input-group-text fw-bold">Wgt</span>
                                <input type="number" class="form-control fw-bold" 
                                       value="${comp.weight !== undefined ? comp.weight : 0}" 
                                       onchange="curator.updateComponent(${index}, 'weight', parseFloat(this.value))">
                              </div>`}
                      </div>
                    </div>
                    
                    <div class="d-flex flex-column align-items-end gap-3 mt-4" style="min-width: 110px;">
                      <div class="form-check form-switch text-end">
                        <input class="form-check-input float-end ms-2" type="checkbox" 
                               id="visSwitch${index}" 
                               ${comp.audience === "admin" ? "checked" : ""} 
                               onchange="curator.updateComponent(${index}, 'audience', this.checked ? 'admin' : 'judge')">
                        <label class="form-check-label small fw-bold text-muted d-block me-4">Official Only</label>
                      </div>
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" onclick="curator.duplicateComponent(${index})">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="curator.deleteComponent(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>`;

                // Drag and drop handlers
                card.addEventListener("dragstart", e => {
                    e.dataTransfer.setData("text/plain", index);
                    e.dataTransfer.effectAllowed = "move";
                    card.classList.add("opacity-50");
                });

                card.addEventListener("dragend", () => {
                    card.classList.remove("opacity-50");
                });

                card.addEventListener("dragover", e => {
                    e.preventDefault();
                });

                card.addEventListener("drop", e => {
                    e.preventDefault();
                    const srcIndex = parseInt(e.dataTransfer.getData("text/plain"));
                    if (!isNaN(srcIndex)) {
                        curator.moveComponent(srcIndex, index);
                    }
                });

                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<div class="alert alert-white text-center border">No fields defined. Add one below.</div>';
        }
    },

    addGenericField: function () {
        if (!this.data) return;
        this.data.scoring_model.inputs.push({
            id: `field_${Date.now()}`,
            label: "New Field",
            type: "number",
            kind: "points",
            weight: 1,
            audience: "judge",
            config: { min: 0, max: 10, placeholder: "" }
        });
        this.renderScoringInputs(this.data.scoring_model.inputs);
        this.updateSaveButton();
    },

    updateComponent: function (index, field, value) {
        if (!this.data) return;
        const comp = this.data.scoring_model.inputs[index];

        if (field === "weight") {
            comp.weight = parseFloat(value);
        } else {
            comp[field] = value;
        }

        if (field === "type") {
            this.renderScoringInputs(this.data.scoring_model.inputs);
        }
        this.updateSaveButton();
    },

    updateConfig: function (index, key, value) {
        if (!this.data) return;
        const comp = this.data.scoring_model.inputs[index];
        if (!comp.config) comp.config = {};

        if (key === "min" || key === "max") {
            comp.config[key] = parseInt(value);
        } else {
            comp.config[key] = value;
        }
        this.updateSaveButton();
    },

    handleKindChange: function (index, value) {
        if (!this.data) return;
        this.data.scoring_model.inputs[index].kind = value;
        this.renderScoringInputs(this.data.scoring_model.inputs);
        this.updateSaveButton();
    },

    deleteComponent: function (index) {
        if (confirm("Remove this field?") && this.data) {
            this.data.scoring_model.inputs.splice(index, 1);
            this.renderScoringInputs(this.data.scoring_model.inputs);
            this.updateSaveButton();
        }
    },

    duplicateComponent: function (index) {
        if (!this.data) return;
        const copy = JSON.parse(JSON.stringify(this.data.scoring_model.inputs[index]));
        copy.id = `copy_${Date.now()}`;
        copy.label += " (Copy)";
        this.data.scoring_model.inputs.splice(index + 1, 0, copy);
        this.renderScoringInputs(this.data.scoring_model.inputs);
        this.updateSaveButton();
    },

    moveComponent: function (srcIndex, destIndex) {
        if (!this.data) return;
        const list = this.data.scoring_model.inputs;
        const [moved] = list.splice(srcIndex, 1);
        list.splice(destIndex, 0, moved);
        this.renderScoringInputs(list);
        this.updateSaveButton();
    },

    openPresetModal: function () {
        const select = document.getElementById("presetSelect");
        select.innerHTML = this.presets.map(p =>
            `<option value="${p.id}">${p.label}</option>`
        ).join("");

        new bootstrap.Modal(document.getElementById("presetModal")).show();
    },

    confirmInsertPreset: function () {
        const presetId = document.getElementById("presetSelect").value;
        const preset = this.presets.find(p => p.id === presetId);

        if (preset && this.data) {
            const copy = JSON.parse(JSON.stringify(preset));
            copy.id = `preset_${Date.now()}`;
            this.data.scoring_model.inputs.push(copy);
            this.renderScoringInputs(this.data.scoring_model.inputs);
            this.updateSaveButton();
        }

        bootstrap.Modal.getInstance(document.getElementById("presetModal")).hide();
    },

    renderScoringPreview: function () {
        if (!this.data) return;
        const normalized = normalizeGameDefinition(this.data);
        const html = normalized.fields.map(f => generateFieldHTML(f)).join("");

        const modalBody = document.getElementById("previewModalBody");
        const modalTitle = document.getElementById("previewModalTitle");
        const dialog = document.getElementById("previewModalDialog");

        if (dialog) dialog.style.maxWidth = '400px';

        if (modalBody) modalBody.innerHTML = `<div class="p-2">${html}</div>`;
        if (modalTitle) modalTitle.innerText = "Judge View: " + (this.data.game_title || "Game");

        const printBtn = document.getElementById("previewPrintBtn");
        if (printBtn) printBtn.classList.add("d-none"); // Hide print for scoring preview

        if (window.bootstrap) {
            new bootstrap.Modal(document.getElementById("previewModal")).show();
        }
    },

    renderGuidePreview: async function () {
        if (!this.data) return;
        try {
            // Fetch the template if not cached
            if (!this._gameGuideTemplate) {
                const res = await fetch('/templates/gameguide.md');
                if (!res.ok) throw new Error("Could not fetch gameguide template");
                this._gameGuideTemplate = await res.text();
            }

            // Compile with Handlebars
            const template = Handlebars.compile(this._gameGuideTemplate);
            const markdown = template(this.data);

            // Convert to HTML with Marked
            const html = marked.parse(markdown);

            const modalBody = document.getElementById("previewModalBody");
            const modalTitle = document.getElementById("previewModalTitle");
            const dialog = document.getElementById("previewModalDialog");

            if (dialog) dialog.style.maxWidth = 'min(95vw, 8.5in)';

            if (modalBody) modalBody.innerHTML = html;
            if (modalTitle) modalTitle.innerText = "Guide Preview: " + (this.data.game_title || "Game");

            const printBtn = document.getElementById("previewPrintBtn");
            if (printBtn) printBtn.classList.remove("d-none"); // Show print button

            if (window.bootstrap) {
                new bootstrap.Modal(document.getElementById("previewModal")).show();
            }
        } catch (err) {
            console.error("Preview render failed:", err);
            alert("Failed to render preview. Check console for details.");
        }
    },

    printPreview: function () {
        const modalBody = document.getElementById("previewModalBody");
        if (!modalBody) return;

        // Open a new window and print the contents
        const printWindow = window.open('', '', 'height=800,width=800');
        printWindow.document.write('<html><head><title>Print Guide</title>');
        // minimal styles
        printWindow.document.write('<style>body { font-family: sans-serif; padding: 20px; line-height: 1.6; } h1,h2 { color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; } blockquote { background: #f9f9f9; padding: 10px; border-left: 5px solid #ccc; } table { border-collapse: collapse; width: 100%; margin-bottom: 20px; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; }</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write(modalBody.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();

        // Let it load styles then print
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    }
};

window.curator = curator;
window.onload = function () {
    curator.init();
};