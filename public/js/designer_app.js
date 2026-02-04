/**
 * Coyote Camporee Designer Logic (v11 - Server Sync & Advanced Import/Export)
 * Features: Server Save/Load, Zip Import Picker, Single Game Export.
 */

const designer = {
    // 1. THE STATE
    data: {
        meta: {
            title: "New Camporee",
            theme: "",
            year: new Date().getFullYear(),
            director: ""
        },
        games: []
    },

    presets: [
        { id: 'p_flag', label: "Patrol Flag", type: "number", kind: "points", weight: 10, audience: "judge", config: { min: 0, max: 10, placeholder: "0-10 Points" } },
        { id: 'p_yell', label: "Patrol Yell", type: "number", kind: "points", weight: 5,  audience: "judge", config: { min: 0, max: 5,  placeholder: "0-5 Points" } },
        { id: 'p_spirit', label: "Scout Spirit", type: "number", kind: "points", weight: 10, audience: "judge", config: { min: 0, max: 10, placeholder: "0-10 Points" } },
        { id: 'off_notes', label: "Judges Notes", type: "textarea", kind: "info", weight: 0, audience: "judge", config: { placeholder: "Issues, tie-breakers, etc." } },
        { id: 'off_score', label: "Official Score", type: "number", kind: "points", weight: 1, audience: "admin", config: { placeholder: "Final Calculated Points" } }
    ],

    activeGameId: null,
    activePresetId: null,
    pendingImportGames: [], // Temp store for Zip import

    // 2. INITIALIZATION
    init: function() {
        console.log("Designer Initialized");
        this.injectDynamicHTML();

        // Bind File Inputs
        const fileInput = document.getElementById('fileInput'); // The main "Load Zip" button
        if(fileInput) fileInput.addEventListener('change', (e) => this.handleCamporeeImport(e));

        // Create a hidden input for "Import Game"
        const gameInput = document.createElement('input');
        gameInput.type = 'file';
        gameInput.id = 'importGameInput';
        gameInput.accept = '.json,.zip';
        gameInput.style.display = 'none';
        gameInput.addEventListener('change', (e) => this.handleGameImport(e));
        document.body.appendChild(gameInput);

        // Bind Meta Fields
        ['metaTitle', 'metaTheme'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.addEventListener('input', (e) => {
                    const key = id === 'metaTitle' ? 'title' : 'theme';
                    this.data.meta[key] = e.target.value;
                });
            }
        });

        // Add Server Controls to Header
        this.renderServerControls();
        this.renderGameList();
    },

    injectDynamicHTML: function() {
        // A. Inject Tab Link
        const navTabs = document.querySelector('.nav-tabs');
        if(navTabs && !document.getElementById('presets-tab')) {
            const li = document.createElement('li');
            li.className = 'nav-item';
            li.innerHTML = `<button class="nav-link" id="presets-tab" data-bs-toggle="tab" data-bs-target="#presets-pane" type="button">Presets</button>`;
            navTabs.appendChild(li);
        }

        // B. Inject Tab Pane
        const tabContent = document.querySelector('.tab-content');
        if(tabContent && !document.getElementById('presets-pane')) {
            const pane = document.createElement('div');
            pane.className = 'tab-pane fade';
            pane.id = 'presets-pane';
            pane.innerHTML = `<div id="presets-container" class="p-3"></div>`;
            tabContent.appendChild(pane);
            document.getElementById('presets-tab').addEventListener('shown.bs.tab', () => this.renderPresetManager());
        }

        // C. Inject Presets Modal
        if (!document.getElementById('presetModal')) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="presetModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title">Insert Preset Field</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body">
                            <div class="mb-3"><label class="form-label">Choose Field</label><select class="form-select" id="presetSelect"></select></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="designer.confirmInsertPreset()">Insert</button>
                        </div>
                    </div>
                </div>
            </div>`);
        }

        // D. Inject Game Import Modal (For Zips)
        if (!document.getElementById('importModal')) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="importModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title">Import Games from Zip</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body">
                            <p>Select the games you want to import into your current project:</p>
                            <div class="list-group" id="importList"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-success" onclick="designer.confirmGameImport()">Import Selected</button>
                        </div>
                    </div>
                </div>
            </div>`);
        }
    },

    renderServerControls: function() {
        const headerBtnGroup = document.querySelector('.d-flex.gap-2'); // Finds the top right button area
        if(headerBtnGroup && !document.getElementById('btnSaveServer')) {
            const div = document.createElement('div');
            div.className = "btn-group ms-2";
            div.innerHTML = `
                <button id="btnSaveServer" class="btn btn-outline-light" onclick="designer.saveToServer()" title="Save to Server">
                    <i class="fas fa-cloud-upload-alt"></i>
                </button>
                <button id="btnLoadServer" class="btn btn-outline-light" onclick="designer.loadFromServer()" title="Load from Server">
                    <i class="fas fa-cloud-download-alt"></i>
                </button>
            `;
            headerBtnGroup.appendChild(div);
        }
    },

    // 3. SERVER SYNC LOGIC
    saveToServer: async function() {
        const payload = {
            meta: this.data.meta,
            games: this.data.games,
            presets: this.presets
        };
        try {
            const res = await fetch('/api/camporee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if(result.success) alert("Saved to Server successfully!");
            else alert("Error saving: " + result.message);
        } catch(e) {
            console.error(e);
            alert("Network Error: Could not reach server.");
        }
    },

    loadFromServer: async function() {
        if(!confirm("Load from Server? This will overwrite unsaved changes.")) return;
        try {
            const res = await fetch('/api/camporee');
            if(res.status === 404) { alert("No saved data found on server."); return; }
            const data = await res.json();

            this.data.meta = data.meta || this.data.meta;
            this.data.games = data.games || [];
            if(data.presets) this.presets = data.presets;

            this.updateMetaUI();
            this.renderGameList();
            this.renderPresetManager(); // Refresh preset tab if open
            alert("Loaded from Server!");
        } catch(e) {
            console.error(e);
            alert("Network Error: Could not reach server.");
        }
    },

    // 4. IMPORT / EXPORT GAMES (Single or Zip)

    // Trigger the file picker
    triggerGameImport: function() {
        document.getElementById('importGameInput').value = null;
        document.getElementById('importGameInput').click();
    },

    handleGameImport: function(event) {
        const file = event.target.files[0];
        if(!file) return;

        const reader = new FileReader();
        if(file.name.endsWith('.json')) {
            // SINGLE JSON IMPORT
            reader.onload = (e) => {
                try {
                    const game = JSON.parse(e.target.result);
                    // Generate new ID to avoid collision
                    game.id = `import_${Date.now()}`;
                    game.content.title += " (Imported)";
                    this.data.games.push(game);
                    this.renderGameList();
                    this.editGame(game.id);
                    alert("Game Imported Successfully!");
                } catch(err) { alert("Invalid JSON file"); }
            };
            reader.readAsText(file);
        } else if (file.name.endsWith('.zip')) {
            // ZIP IMPORT (Picker)
            reader.onload = (e) => {
                JSZip.loadAsync(e.target.result).then(async (zip) => {
                    this.pendingImportGames = [];
                    const promises = [];

                    zip.folder("games").forEach((path, file) => {
                        promises.push(file.async("string").then(txt => {
                            try { return JSON.parse(txt); } catch(e) { return null; }
                        }));
                    });

                    const games = await Promise.all(promises);
                    this.pendingImportGames = games.filter(g => g !== null);
                    this.showImportModal();
                });
            };
            reader.readAsArrayBuffer(file);
        }
    },

    showImportModal: function() {
        const list = document.getElementById('importList');
        list.innerHTML = this.pendingImportGames.map((g, i) => `
            <label class="list-group-item d-flex gap-2">
                <input class="form-check-input flex-shrink-0" type="checkbox" value="${i}" checked>
                <span>
                    <strong>${g.content?.title || g.id}</strong>
                    <br><small class="text-muted">${g.id} - ${g.scoring?.components?.length || 0} fields</small>
                </span>
            </label>
        `).join('');

        const modal = new bootstrap.Modal(document.getElementById('importModal'));
        modal.show();
    },

    confirmGameImport: function() {
        const checkboxes = document.querySelectorAll('#importList input:checked');
        checkboxes.forEach(chk => {
            const idx = parseInt(chk.value);
            const original = this.pendingImportGames[idx];

            // Clone and re-ID
            const game = JSON.parse(JSON.stringify(original));
            game.id = `import_${Date.now()}_${idx}`;
            // Optional: Mark as imported
            // game.content.title += " (Imported)";

            this.data.games.push(game);
        });

        this.renderGameList();
        bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
        alert(`Imported ${checkboxes.length} games.`);
    },

    exportSingleGame: function(gameId) {
        const game = this.data.games.find(g => g.id === gameId);
        if(!game) return;

        const blob = new Blob([JSON.stringify(game, null, 2)], {type: "application/json;charset=utf-8"});
        saveAs(blob, `${game.id}.json`);
    },


    // 5. STANDARD APP LOGIC (Renderers, etc)

    newCamporee: function() {
        if(confirm("Start a new Camporee? Unsaved changes will be lost.")) {
            this.data.games = [];
            this.data.meta = { title: "New Camporee", theme: "", year: new Date().getFullYear() };
            this.activeGameId = null;
            this.updateMetaUI();
            this.renderGameList();
            document.getElementById('editor-container').innerHTML = '<p class="text-muted">Select a game to edit.</p>';
        }
    },

    addGame: function() {
        const newId = `game_${Date.now()}`;
        const newGame = {
            id: newId,
            enabled: true,
            content: { title: "New Game", story: "", instructions: "" },
            scoring: {
                method: "points_desc",
                components: [{ id: "score_1", type: "number", kind: "points", label: "Points", weight: 1, audience: "judge", sortOrder: 0 }]
            }
        };
        this.data.games.push(newGame);
        this.renderGameList();
        this.editGame(newId);
    },

    duplicateGame: function(gameId) {
        const original = this.data.games.find(g => g.id === gameId);
        if(!original) return;
        const clone = JSON.parse(JSON.stringify(original));
        clone.id = `game_${Date.now()}`;
        clone.content.title += " (Copy)";
        if(clone.scoring.components) {
            clone.scoring.components.forEach(c => {
                c.id = `${c.kind}_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
            });
        }
        this.data.games.push(clone);
        this.renderGameList();
        this.editGame(clone.id);
    },

    deleteGame: function(gameId) {
        if(confirm("Delete this game?")) {
            this.data.games = this.data.games.filter(g => g.id !== gameId);
            if (this.activeGameId === gameId) {
                this.activeGameId = null;
                document.getElementById('editor-container').innerHTML = '<p class="text-muted">Select a game to edit.</p>';
            }
            this.renderGameList();
        }
    },

    updateMetaUI: function() {
        const titleEl = document.getElementById('metaTitle');
        const themeEl = document.getElementById('metaTheme');
        if(titleEl) titleEl.value = this.data.meta.title || "";
        if(themeEl) themeEl.value = this.data.meta.theme || "";
    },

    renderGameList: function() {
        const listEl = document.getElementById('gameList');
        // Add Import Button to Header of List
        if(listEl.previousElementSibling && !listEl.previousElementSibling.querySelector('.btn-import')) {
             listEl.previousElementSibling.innerHTML += `
                <button class="btn btn-sm btn-outline-primary btn-import float-end" onclick="designer.triggerGameImport()">
                    <i class="fas fa-file-import"></i> Import Game
                </button>`;
        }

        listEl.innerHTML = '';
        if (this.data.games.length === 0) {
            listEl.innerHTML = '<div class="text-center text-muted p-4">No games loaded.</div>';
            return;
        }
        this.data.games.forEach(game => {
            const isActive = game.id === this.activeGameId ? 'active' : '';
            const statusClass = game.enabled ? 'text-success' : 'text-secondary';
            const item = document.createElement('a');
            item.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isActive}`;
            item.href = "#";
            item.onclick = (e) => { e.preventDefault(); this.editGame(game.id); };

            item.innerHTML = `
                <div class="text-truncate" style="max-width: 50%;">
                    <strong>${game.content.title}</strong><br><small class="text-muted">${game.id}</small>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <i class="fas fa-circle ${statusClass} me-2" style="font-size: 0.5rem;"></i>
                    <button class="btn btn-sm btn-outline-secondary border-0" title="Export JSON"
                            onclick="event.stopPropagation(); designer.exportSingleGame('${game.id}')">
                        <i class="fas fa-file-download"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary border-0" title="Duplicate"
                            onclick="event.stopPropagation(); designer.duplicateGame('${game.id}')">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger border-0" title="Delete"
                            onclick="event.stopPropagation(); designer.deleteGame('${game.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>`;
            listEl.appendChild(item);
        });
    },

    // 6. GAME EDITOR
    editGame: function(gameId) {
        this.activeGameId = gameId;
        const game = this.data.games.find(g => g.id === gameId);
        if (!game) return;

        const tabTriggerEl = document.querySelector('#editor-tab');
        if (tabTriggerEl && window.bootstrap) { new bootstrap.Tab(tabTriggerEl).show(); }

        const container = document.getElementById('editor-container');
        container.innerHTML = `
            <div class="card mb-4">
                <div class="card-header bg-light"><h5 class="mb-0">Game Metadata</h5></div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8 mb-3"><label class="form-label">Game Title</label><input type="text" class="form-control" id="gameTitle"></div>
                        <div class="col-md-4 mb-3"><label class="form-label">Game ID</label><input type="text" class="form-control" id="gameId" readonly></div>
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3"><label class="form-label">Story / Premise</label><textarea class="form-control" rows="3" id="gameStory"></textarea></div>
                        <div class="col-md-6 mb-3"><label class="form-label">Instructions</label><textarea class="form-control" rows="3" id="gameInstructions"></textarea></div>
                    </div>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="gameEnabled" ${game.enabled ? 'checked' : ''}>
                        <label class="form-check-label">Game Enabled in Playlist</label>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Scoring Fields</h5>
                    <div class="d-flex align-items-center gap-2">
                        <small class="text-muted">Win Condition:</small>
                        <select class="form-select form-select-sm d-inline-block w-auto" id="gameScoringMethod">
                            <option value="points_desc">Highest Points Wins</option>
                            <option value="timed_asc">Lowest Time Wins</option>
                        </select>
                    </div>
                </div>
                <div class="card-body bg-light">
                    <div id="scoring-editor" class="d-flex flex-column gap-3"></div>
                    <div class="mt-4 text-center">
                         <div class="btn-group shadow-sm">
                            <button class="btn btn-primary" onclick="designer.addGenericField('${gameId}', 'game')">
                                <i class="fas fa-plus-circle"></i> Add Field
                            </button>
                            <button class="btn btn-outline-primary" onclick="designer.openPresetModal('${gameId}')">
                                <i class="fas fa-magic"></i> Add Preset
                            </button>
                         </div>
                    </div>
                </div>
            </div>
        `;

        ['gameTitle','gameId','gameStory','gameInstructions'].forEach(fid => {
             const prop = fid === 'gameId' ? 'id' : (fid === 'gameTitle' ? 'title' : (fid==='gameStory'?'story':'instructions'));
             const el = document.getElementById(fid);
             if(el) {
                 el.value = (prop === 'id' ? game.id : game.content[prop]) || '';
                 el.oninput = (e) => this.updateGameField(prop, e.target.value);
             }
        });

        const methodSelect = document.getElementById('gameScoringMethod');
        if(methodSelect) {
            methodSelect.value = game.scoring.method || 'points_desc';
            methodSelect.onchange = (e) => { game.scoring.method = e.target.value; };
        }

        const enabledSwitch = document.getElementById('gameEnabled');
        if(enabledSwitch) {
            enabledSwitch.onchange = (e) => { game.enabled = e.target.checked; this.renderGameList(); };
        }

        this.renderScoringInputs(game.scoring.components, game.id, 'game');
    },

    updateGameField: function(field, value) {
        if (!this.activeGameId) return;
        const game = this.data.games.find(g => g.id === this.activeGameId);
        if (!game) return;
        if (field === 'id') { game.id = value; this.activeGameId = value; }
        else { game.content[field] = value; }
        if (field === 'title' || field === 'id') this.renderGameList();
    },

    // 7. PRESET MANAGER & EDITOR
    renderPresetManager: function() {
        const container = document.getElementById('presets-container');
        if(!container) return;
        container.innerHTML = `
            <div class="card">
                <div class="card-header bg-light"><h5 class="mb-0">Preset Library</h5></div>
                <div class="card-body bg-light">
                    <div id="preset-editor-list" class="d-flex flex-column gap-3"></div>
                    <div class="mt-4 text-center">
                         <button class="btn btn-primary" onclick="designer.addGenericField('global', 'preset_manager')">
                            <i class="fas fa-plus-circle"></i> Add Field
                         </button>
                    </div>
                </div>
            </div>`;
        this.renderScoringInputs(this.presets, 'global', 'preset_manager');
    },

    renderScoringInputs: function(components, contextId, contextType = 'game') {
        const containerId = contextType === 'preset_manager' ? 'preset-editor-list' : 'scoring-editor';
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (!components || components.length === 0) {
            container.innerHTML = '<div class="alert alert-white text-center border">No fields defined. Add one below.</div>';
            return;
        }

        components.forEach((comp, index) => {
            let borderClass = 'border-success';
            if (comp.kind === 'penalty') borderClass = 'border-danger';
            else if (comp.kind === 'info') borderClass = 'border-secondary';
            else if (comp.audience === 'admin') borderClass = 'border-info';

            const row = document.createElement('div');
            row.className = `card border-start border-4 shadow-sm ${borderClass}`;
            row.draggable = true;
            row.dataset.index = index;

            // Simplified innerHTML generation for brevity (same structure as before)
            row.innerHTML = `
              <div class="card-body p-3 d-flex align-items-start">
                <div class="me-3 mt-4 text-muted" style="cursor: grab;"><i class="fas fa-grip-vertical fa-lg"></i></div>
                <div class="flex-grow-1 me-4">
                  <label class="form-label small text-muted fw-bold mb-1">Field Name (Label)</label>
                  <input type="text" class="form-control form-control-sm fw-bold mb-2" value="${comp.label || ''}"
                        oninput="designer.updateComponent('${contextId}', ${index}, 'label', this.value, '${contextType}')">
                  <label class="form-label small text-muted fw-bold mb-1">Description (for Judge)</label>
                  <input type="text" class="form-control form-control-sm text-muted" value="${comp.config?.placeholder || ''}"
                        oninput="designer.updateConfig('${contextId}', ${index}, 'placeholder', this.value, '${contextType}')">
                </div>
                <div class="d-flex flex-column gap-2 me-4" style="width: 340px;">
                  <div class="row g-2">
                    <div class="col-6">
                        <label class="form-label small text-muted fw-bold mb-1">Input Type</label>
                        <select class="form-select form-select-sm" onchange="designer.updateComponent('${contextId}', ${index}, 'type', this.value, '${contextType}')">
                            ${['number','stopwatch','text','textarea','checkbox'].map(t => `<option value="${t}" ${comp.type===t?'selected':''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-6">
                        <label class="form-label small text-muted fw-bold mb-1">Scoring Purpose</label>
                        <select class="form-select form-select-sm" onchange="designer.handleKindChange('${contextId}', ${index}, this.value, '${contextType}')">
                            ${['points','penalty','metric','info'].map(k => `<option value="${k}" ${comp.kind===k?'selected':''}>${k}</option>`).join('')}
                        </select>
                    </div>
                  </div>
                  <div>
                      <label class="form-label small text-muted fw-bold mb-1">Limits & Weight</label>
                      <div class="input-group input-group-sm">
                        <span class="input-group-text text-muted">Min</span>
                        <input type="number" class="form-control" value="${comp.config?.min || ''}"
                            onchange="designer.updateConfig('${contextId}', ${index}, 'min', this.value, '${contextType}')">
                        <span class="input-group-text text-muted">Max</span>
                        <input type="number" class="form-control" value="${comp.config?.max || ''}"
                            onchange="designer.updateConfig('${contextId}', ${index}, 'max', this.value, '${contextType}')">
                        <span class="input-group-text fw-bold">Wgt</span>
                        <input type="number" class="form-control fw-bold" value="${comp.weight !== undefined ? comp.weight : 0}"
                            onchange="designer.updateComponent('${contextId}', ${index}, 'weight', parseFloat(this.value), '${contextType}')">
                      </div>
                  </div>
                </div>
                <div class="d-flex flex-column align-items-end gap-3 mt-4" style="min-width: 110px;">
                  <div class="form-check form-switch text-end">
                    <input class="form-check-input float-end ms-2" type="checkbox" id="visSwitch${index}" ${comp.audience === 'admin' ? 'checked' : ''}
                        onchange="designer.updateComponent('${contextId}', ${index}, 'audience', this.checked ? 'admin' : 'judge', '${contextType}')">
                    <label class="form-check-label small fw-bold text-muted d-block me-4">Official Only</label>
                  </div>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-secondary" onclick="designer.duplicateComponent('${contextId}', ${index}, '${contextType}')"><i class="fas fa-copy"></i></button>
                    <button class="btn btn-outline-danger" onclick="designer.removeComponent('${contextId}', ${index}, '${contextType}')"><i class="fas fa-trash"></i></button>
                  </div>
                </div>
              </div>`;

            // Drag Events
            row.addEventListener('dragstart', (e) => { this.dragSrcIndex = index; e.dataTransfer.effectAllowed = 'move'; row.classList.add('opacity-50'); });
            row.addEventListener('dragend', (e) => { row.classList.remove('opacity-50'); this.dragSrcIndex = null; });
            row.addEventListener('dragover', (e) => { e.preventDefault(); return false; });
            row.addEventListener('drop', (e) => {
                e.stopPropagation();
                if (this.dragSrcIndex !== null && this.dragSrcIndex !== index) this.moveComponent(contextId, this.dragSrcIndex, index, contextType);
                return false;
            });
            container.appendChild(row);
        });
    },

    // --- SHARED DATA HELPERS ---
    getContainer: function(id, type) {
        if(type === 'game') return this.data.games.find(g => g.id === id)?.scoring;
        if(type === 'preset_manager') return { components: this.presets };
        return null;
    },
    updateComponent: function(id, index, field, value, type = 'game') {
        const c = this.getContainer(id, type); if(c) c.components[index][field] = value;
    },
    updateConfig: function(id, index, field, value, type = 'game') {
        const c = this.getContainer(id, type);
        if(c) {
            if(!c.components[index].config) c.components[index].config = {};
            c.components[index].config[field] = value;
        }
    },
    handleKindChange: function(id, index, newKind, type = 'game') {
        const c = this.getContainer(id, type); if(!c) return;
        const comp = c.components[index];
        comp.kind = newKind;
        comp.weight = (newKind === 'points' ? 1 : (newKind === 'penalty' ? -1 : 0));
        this.renderScoringInputs(c.components, id, type);
    },
    addGenericField: function(id, type = 'game') {
        const c = this.getContainer(id, type); if(!c) return;
        if(!c.components) c.components = [];
        c.components.push({ id: `field_${Date.now()}`, type: 'number', kind: 'points', label: 'Points', weight: 1, audience: 'judge', config: {} });
        this.renderScoringInputs(c.components, id, type);
    },
    removeComponent: function(id, index, type = 'game') {
        const c = this.getContainer(id, type); if(c) { c.components.splice(index, 1); this.renderScoringInputs(c.components, id, type); }
    },
    duplicateComponent: function(id, index, type = 'game') {
        const c = this.getContainer(id, type); if(c) {
            const copy = JSON.parse(JSON.stringify(c.components[index]));
            copy.id = `copy_${Date.now()}`; copy.label += " (Copy)";
            c.components.splice(index+1, 0, copy);
            this.renderScoringInputs(c.components, id, type);
        }
    },
    moveComponent: function(id, from, to, type = 'game') {
        const c = this.getContainer(id, type); if(c) {
            const [moved] = c.components.splice(from, 1);
            c.components.splice(to, 0, moved);
            this.renderScoringInputs(c.components, id, type);
        }
    },

    // 8. PRESET MODAL
    openPresetModal: function(gameId) {
        this.activeGameId = gameId;
        const select = document.getElementById('presetSelect');
        select.innerHTML = this.presets.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
        new bootstrap.Modal(document.getElementById('presetModal')).show();
    },
    confirmInsertPreset: function() {
        const preset = this.presets.find(p => p.id === document.getElementById('presetSelect').value);
        if(preset && this.activeGameId) {
            const game = this.data.games.find(g => g.id === this.activeGameId);
            const copy = JSON.parse(JSON.stringify(preset));
            copy.id = `preset_${Date.now()}`;
            if(!game.scoring.components) game.scoring.components = [];
            game.scoring.components.push(copy);
            this.renderScoringInputs(game.scoring.components, game.id, 'game');
        }
        bootstrap.Modal.getInstance(document.getElementById('presetModal')).hide();
    },

    // 9. EXPORT LOGIC
    updateSortOrders: function() {
        this.data.games.forEach(g => { if(g.scoring.components) g.scoring.components.forEach((c,i) => c.sortOrder = i * 10); });
    },
    exportCamporee: function() {
        this.updateSortOrders();
        const zip = new JSZip();
        const playlist = this.data.games.map((g, i) => ({ gameId: g.id, enabled: g.enabled, order: i + 1 }));
        const camporeeJson = { schemaVersion: "2.6", meta: this.data.meta, playlist: playlist };
        zip.file("camporee.json", JSON.stringify(camporeeJson, null, 2));
        zip.file("presets.json", JSON.stringify(this.presets, null, 2));
        const gamesFolder = zip.folder("games");
        this.data.games.forEach(game => {
            gamesFolder.file(`${game.id}.json`, JSON.stringify({ id: game.id, schemaVersion: "2.6", content: game.content, scoring: game.scoring }, null, 2));
        });
        zip.generateAsync({type:"blob"}).then(function(content) { saveAs(content, "CamporeeConfig.zip"); });
    },
    // Handler for main file input (Zip)
    handleCamporeeImport: function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            JSZip.loadAsync(e.target.result).then(async (zip) => {
                const metaFile = await zip.file("camporee.json").async("string");
                const metaObj = JSON.parse(metaFile);
                this.data.meta = metaObj.meta;
                if(zip.file("presets.json")) this.presets = JSON.parse(await zip.file("presets.json").async("string"));
                this.data.games = [];
                const promises = [];
                zip.folder("games").forEach((p, f) => promises.push(f.async("string").then(c => JSON.parse(c))));
                const loaded = await Promise.all(promises);
                loaded.forEach(g => {
                    const pItem = metaObj.playlist.find(p => p.gameId === g.id);
                    g.enabled = pItem ? pItem.enabled : false;
                    if(!g.scoring.components) g.scoring.components = [];
                    this.data.games.push(g);
                });
                this.updateMetaUI(); this.renderGameList();
                this.activeGameId = null;
                document.getElementById('editor-container').innerHTML = '<p class="text-muted">Select a game to edit.</p>';
                alert("Camporee Loaded Successfully!");
            });
        };
        reader.readAsArrayBuffer(file);
    }
};

window.onload = function() { designer.init(); };
