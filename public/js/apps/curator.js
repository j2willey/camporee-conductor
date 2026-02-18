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
    api: new ApiClient(),

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
            this.catalog = catalogData.games || [];
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
                                <small class="text-muted" style="font-size:0.7em">${game.path}</small>
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

    newTemplate: function () {
        if (this.data && this.isDirty() && !confirm("Discard changes to current template?")) {
            return;
        }

        this.activeTemplatePath = null;
        this.data = {
            id: `tpl_${Date.now()}`,
            type: "patrol",
            enabled: true,
            bracketMode: false,
            content: {
                title: "New Template",
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
            },
            tags: [],
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

            // Normalize data structure
            this.data = {
                id: game.id || `tpl_${Date.now()}`,
                type: game.type || "patrol",
                enabled: true,
                bracketMode: !!game.bracketMode,
                match_label: game.match_label || "",
                content: {
                    title: game.base_title || game.content?.title || game.meta?.title || "Untitled",
                    story: game.meta?.description || game.content?.story || "",
                    instructions: game.meta?.instructions || game.content?.instructions || ""
                },
                tags: game.tags || game.meta?.tags || [],
                scoring: game.scoring_model ? {
                    method: "points_desc",
                    components: (game.scoring_model.inputs || []).map(input => ({
                        id: input.id || `f_${Math.random().toString(36).substr(2)}`,
                        label: input.label,
                        type: input.type === "timer" ? "stopwatch" : (input.type || "number"),
                        kind: input.type === "timer" ? "metric" : (input.type === "header" ? "info" : "points"),
                        weight: input.weight !== undefined ? input.weight : 1,
                        audience: "judge",
                        sortOrder: input.sortOrder || 0,
                        config: {
                            min: 0,
                            max: input.max_points || 0,
                            placeholder: input.placeholder || ""
                        }
                    }))
                } : (game.scoring || { method: "points_desc", components: [] }),
                variants: game.variants || []
            };

            if (game.scoring && !game.scoring_model) {
                this.data.scoring = game.scoring;
            }

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

        let path = this.activeTemplatePath;
        if (!path) {
            const filename = prompt("Enter filename (e.g. fire/matchless.json):");
            if (!filename) return;
            path = filename.endsWith(".json") ? filename : `${filename}.json`;
        }

        const payload = {
            path: path,
            data: {
                id: this.data.id,
                base_title: this.data.content.title,
                type: this.data.type,
                meta: {
                    title: this.data.content.title,
                    description: this.data.content.story,
                    instructions: this.data.content.instructions,
                    tags: this.data.tags
                },
                tags: this.data.tags,
                scoring: this.data.scoring,
                scoring_model: {
                    inputs: this.data.scoring.components.map(comp => ({
                        id: comp.id,
                        label: comp.label,
                        type: comp.type,
                        weight: comp.weight,
                        max_points: comp.config ? comp.config.max : 0,
                        placeholder: comp.config ? comp.config.placeholder : "",
                        sortOrder: comp.sortOrder || 0
                    }))
                },
                variants: this.data.variants
            }
        };

        try {
            const result = await this.api.saveLibraryGame(payload);
            if (result.success) {
                // alert("Template Saved!"); // Disabled per user request
                this.activeTemplatePath = path;
                this.catalog = result.catalog;

                // Update originalData to reflect saved state
                // Since saving might normalize things server-side, it's safer to re-fetch, 
                // but for now, assuming client state is correct:
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
                    <i class="fas fa-edit"></i> ${this.activeTemplatePath || "New Template"}
                </h4>
                <div>
                     <button class="btn btn-success" id="saveTemplateBtn" onclick="curator.saveTemplate()" disabled>
                        <i class="fas fa-save"></i> Save Template
                     </button>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header bg-light"><h5 class="mb-0">Metadata</h5></div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8 mb-3">
                            <label class="form-label">Title</label>
                            <input type="text" class="form-control" id="gameTitle">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Type</label>
                            <select class="form-select" id="gameType">
                                <option value="patrol">Patrol Competition</option>
                                <option value="troop">Troop Competition</option>
                                <option value="exhibition">Exhibition / Individual</option>
                            </select>
                        </div>
                    </div>
                    <div class="row border-bottom mb-3 pb-3">
                        <div class="col-12">
                            <label class="form-label text-muted">Instructions</label>
                            <textarea class="form-control" rows="1" id="gameInstructions" 
                                      placeholder="Judge-facing instructions..."></textarea>
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-12">
                             <label class="form-label">Tags</label>
                             <input type="text" class="form-control" id="gameTags" placeholder="#tag1 #tag2">
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Scoring Model</h5>
                    <div class="d-flex align-items-center gap-3">
                        <select class="form-select form-select-sm d-inline-block w-auto" id="gameScoringMethod">
                            <option value="points_desc">Highest Points</option>
                            <option value="timed_asc">Lowest Time</option>
                        </select>
                        <button class="btn btn-sm btn-outline-secondary" onclick="curator.renderPreview()">
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
        `;

        // Bind events
        const titleInput = document.getElementById("gameTitle");
        titleInput.value = data.content.title;
        titleInput.oninput = (e) => { data.content.title = e.target.value; this.updateSaveButton(); };

        const instructionsInput = document.getElementById("gameInstructions");
        instructionsInput.value = data.content.instructions;
        instructionsInput.oninput = (e) => { data.content.instructions = e.target.value; this.updateSaveButton(); };

        const tagsInput = document.getElementById("gameTags");
        tagsInput.value = data.tags.join(" ");
        tagsInput.oninput = (e) => { data.tags = e.target.value.split(/[ ,]+/).filter(t => t); this.updateSaveButton(); };

        const typeInput = document.getElementById("gameType");
        typeInput.value = data.type;
        typeInput.onchange = (e) => { data.type = e.target.value; this.updateSaveButton(); };

        const methodInput = document.getElementById("gameScoringMethod");
        methodInput.value = data.scoring.method;
        methodInput.onchange = (e) => { data.scoring.method = e.target.value; this.updateSaveButton(); };

        this.renderScoringInputs(data.scoring.components, "game");
        this.updateSaveButton();
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
                <div class="modal-dialog modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-light">
                            <h5 class="modal-title" id="previewModalTitle">Game Preview</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="previewModalBody"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
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
        this.data.scoring.components.push({
            id: `field_${Date.now()}`,
            label: "New Field",
            type: "number",
            kind: "points",
            weight: 1,
            audience: "judge",
            config: { min: 0, max: 10, placeholder: "" }
        });
        this.renderScoringInputs(this.data.scoring.components);
        this.updateSaveButton();
    },

    updateComponent: function (index, field, value) {
        if (!this.data) return;
        const comp = this.data.scoring.components[index];

        if (field === "weight") {
            comp.weight = parseFloat(value);
        } else {
            comp[field] = value;
        }

        if (field === "type") {
            this.renderScoringInputs(this.data.scoring.components);
        }
        this.updateSaveButton();
    },

    updateConfig: function (index, key, value) {
        if (!this.data) return;
        const comp = this.data.scoring.components[index];
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
        this.data.scoring.components[index].kind = value;
        this.renderScoringInputs(this.data.scoring.components);
        this.updateSaveButton();
    },

    deleteComponent: function (index) {
        if (confirm("Remove this field?") && this.data) {
            this.data.scoring.components.splice(index, 1);
            this.renderScoringInputs(this.data.scoring.components);
            this.updateSaveButton();
        }
    },

    duplicateComponent: function (index) {
        if (!this.data) return;
        const copy = JSON.parse(JSON.stringify(this.data.scoring.components[index]));
        copy.id = `copy_${Date.now()}`;
        copy.label += " (Copy)";
        this.data.scoring.components.splice(index + 1, 0, copy);
        this.renderScoringInputs(this.data.scoring.components);
        this.updateSaveButton();
    },

    moveComponent: function (srcIndex, destIndex) {
        if (!this.data) return;
        const list = this.data.scoring.components;
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
            this.data.scoring.components.push(copy);
            this.renderScoringInputs(this.data.scoring.components);
            this.updateSaveButton();
        }

        bootstrap.Modal.getInstance(document.getElementById("presetModal")).hide();
    },

    renderPreview: function () {
        if (!this.data) return;
        const normalized = normalizeGameDefinition(this.data);
        const html = normalized.fields.map(f => generateFieldHTML(f)).join("");

        const modalBody = document.getElementById("previewModalBody");
        const modalTitle = document.getElementById("previewModalTitle");

        if (modalBody) modalBody.innerHTML = html;
        if (modalTitle) modalTitle.innerText = "Preview: " + (this.data.content.title || "Game");

        if (window.bootstrap) {
            new bootstrap.Modal(document.getElementById("previewModal")).show();
        }

        const container = document.getElementById("preview-container");
        if (container && container.offsetParent !== null) {
            container.innerHTML = `<div class="card p-3">${html}</div>`;
        }
    }
};

window.curator = curator;
window.onload = function () {
    curator.init();
};