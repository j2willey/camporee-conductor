/**
 * Coyote Camporee Designer Logic (v9 - Unified Preset Editor)
 * Handles state, UI, Atomic Presets, and Zip Import/Export.
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

    // ATOMIC PRESETS: Flat list of single field definitions
    presets: [
        { id: 'p_flag', label: "Patrol Flag", type: "number", kind: "points", weight: 10, audience: "judge", config: { min: 0, max: 10, placeholder: "0-10 Points" } },
        { id: 'p_yell', label: "Patrol Yell", type: "number", kind: "points", weight: 5,  audience: "judge", config: { min: 0, max: 5,  placeholder: "0-5 Points" } },
        { id: 'p_spirit', label: "Scout Spirit", type: "number", kind: "points", weight: 10, audience: "judge", config: { min: 0, max: 10, placeholder: "0-10 Points" } },
        { id: 'off_notes', label: "Judges Notes", type: "textarea", kind: "info", weight: 0, audience: "judge", config: { placeholder: "Issues, tie-breakers, etc." } },
        { id: 'off_score', label: "Official Score", type: "number", kind: "points", weight: 1, audience: "admin", config: { placeholder: "Final Calculated Points" } }
    ],

    activeGameId: null,
    dragSrcIndex: null,

    // 2. INITIALIZATION
    init: function() {
        console.log("Designer Initialized");
        this.injectDynamicHTML();

        const fileInput = document.getElementById('fileInput');
        if(fileInput) fileInput.addEventListener('change', this.handleFileUpload.bind(this));

        ['metaTitle', 'metaTheme'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.addEventListener('input', (e) => {
                    const key = id === 'metaTitle' ? 'title' : 'theme';
                    this.data.meta[key] = e.target.value;
                });
            }
        });

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

        // C. Inject Modal
        if (!document.getElementById('presetModal')) {
            const modalHtml = `
            <div class="modal fade" id="presetModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Insert Preset Field</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Choose a Field to Copy</label>
                                <select class="form-select" id="presetSelect"></select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="designer.confirmInsertPreset()">Insert Field</button>
                        </div>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    },

    // 3. GAME MANAGEMENT
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

    renderGameList: function() {
        const listEl = document.getElementById('gameList');
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
                <div class="text-truncate" style="max-width: 60%;">
                    <strong>${game.content.title}</strong><br><small class="text-muted">${game.id}</small>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <i class="fas fa-circle ${statusClass} me-2" style="font-size: 0.5rem;"></i>
                    <button class="btn btn-sm btn-outline-secondary border-0" title="Duplicate Game"
                            onclick="event.stopPropagation(); designer.duplicateGame('${game.id}')">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger border-0" title="Delete Game"
                            onclick="event.stopPropagation(); designer.deleteGame('${game.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>`;
            listEl.appendChild(item);
        });
    },

    // 4. GAME EDITOR
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

        // Bind fields
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

    // 5. UNIFIED PRESET MANAGER
    renderPresetManager: function() {
        const container = document.getElementById('presets-container');
        if(!container) return;

        // Render a card structure similar to the Game Editor
        container.innerHTML = `
            <div class="card">
                <div class="card-header bg-light">
                    <h5 class="mb-0">Preset Library</h5>
                </div>
                <div class="card-body bg-light">
                    <div id="preset-editor-list" class="d-flex flex-column gap-3"></div>

                    <div class="mt-4 text-center">
                         <button class="btn btn-primary" onclick="designer.addGenericField('global', 'preset_manager')">
                            <i class="fas fa-plus-circle"></i> Add Field
                         </button>
                    </div>
                </div>
            </div>
        `;

        // Render the flattened list of presets
        // We pass 'global' as dummy ID, and 'preset_manager' as type
        this.renderScoringInputs(this.presets, 'global', 'preset_manager');
    },

    // 6. SHARED RENDERER (Game Fields & Presets)
    renderScoringInputs: function(components, contextId, contextType = 'game') {
        // Determine Target Container
        const containerId = contextType === 'preset_manager' ? 'preset-editor-list' : 'scoring-editor';
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (!components || components.length === 0) {
            container.innerHTML = '<div class="alert alert-white text-center border">No fields defined. Add one below.</div>';
            return;
        }

        components.forEach((comp, index) => {
            const isPointsOrPenalty = (comp.kind === 'points' || comp.kind === 'penalty');
            const isMetricOrTime = (comp.kind === 'metric' || comp.type === 'stopwatch' || comp.type === 'number');
            const disableWeight = !isPointsOrPenalty;
            const disableMinMax = !isMetricOrTime;

            // Visual Styles
            let borderClass = 'border-success';
            if (comp.kind === 'penalty') borderClass = 'border-danger';
            else if (comp.kind === 'info') borderClass = 'border-secondary';
            else if (comp.audience === 'admin') borderClass = 'border-info';

            const row = document.createElement('div');
            row.className = `card border-start border-4 shadow-sm ${borderClass}`;
            row.draggable = true;
            row.dataset.index = index;

            row.innerHTML = `
              <div class="card-body p-3 d-flex align-items-start">

                <div class="me-3 mt-4 text-muted" style="cursor: grab;"><i class="fas fa-grip-vertical fa-lg"></i></div>

                <div class="flex-grow-1 me-4">
                  <label class="form-label small text-muted fw-bold mb-1">Field Name (Label)</label>
                  <input type="text" class="form-control form-control-sm fw-bold mb-2" placeholder="e.g. Knot Time" value="${comp.label || ''}"
                        oninput="designer.updateComponent('${contextId}', ${index}, 'label', this.value, '${contextType}')">
                  <label class="form-label small text-muted fw-bold mb-1">Description (for Judge)</label>
                  <input type="text" class="form-control form-control-sm text-muted" placeholder="Instructions..." value="${comp.config?.placeholder || ''}"
                        oninput="designer.updateConfig('${contextId}', ${index}, 'placeholder', this.value, '${contextType}')">
                </div>

                <div class="d-flex flex-column gap-2 me-4" style="width: 340px;">
                  <div class="row g-2">
                    <div class="col-6">
                        <label class="form-label small text-muted fw-bold mb-1">Input Type</label>
                        <select class="form-select form-select-sm" onchange="designer.updateComponent('${contextId}', ${index}, 'type', this.value, '${contextType}')">
                            <option value="number" ${comp.type==='number'?'selected':''}>Number</option>
                            <option value="stopwatch" ${comp.type==='stopwatch'?'selected':''}>Stopwatch</option>
                            <option value="text" ${comp.type==='text'?'selected':''}>Text (Short)</option>
                            <option value="textarea" ${comp.type==='textarea'?'selected':''}>Text (Long)</option>
                            <option value="checkbox" ${comp.type==='checkbox'?'selected':''}>Checkbox</option>
                        </select>
                    </div>
                    <div class="col-6">
                        <label class="form-label small text-muted fw-bold mb-1">Scoring Purpose</label>
                        <select class="form-select form-select-sm" onchange="designer.handleKindChange('${contextId}', ${index}, this.value, '${contextType}')">
                            <option value="points" ${comp.kind==='points'?'selected':''}>Points (+)</option>
                            <option value="penalty" ${comp.kind==='penalty'?'selected':''}>Penalty (-)</option>
                            <option value="metric" ${comp.kind==='metric'?'selected':''}>Metric (Raw)</option>
                            <option value="info" ${comp.kind==='info'?'selected':''}>Info (No Score)</option>
                        </select>
                    </div>
                  </div>
                  <div>
                      <label class="form-label small text-muted fw-bold mb-1">Limits & Weight</label>
                      <div class="input-group input-group-sm">
                        <span class="input-group-text text-muted" style="font-size: 0.75rem;">Min</span>
                        <input type="number" class="form-control" placeholder="-" value="${comp.config?.min || ''}" ${disableMinMax ? 'disabled' : ''}
                            onchange="designer.updateConfig('${contextId}', ${index}, 'min', this.value, '${contextType}')">
                        <span class="input-group-text text-muted" style="font-size: 0.75rem;">Max</span>
                        <input type="number" class="form-control" placeholder="-" value="${comp.config?.max || ''}" ${disableMinMax ? 'disabled' : ''}
                            onchange="designer.updateConfig('${contextId}', ${index}, 'max', this.value, '${contextType}')">
                        <span class="input-group-text fw-bold" style="font-size: 0.75rem;">Wgt</span>
                        <input type="number" class="form-control fw-bold" value="${comp.weight !== undefined ? comp.weight : 0}" ${disableWeight ? 'disabled' : ''}
                            onchange="designer.updateComponent('${contextId}', ${index}, 'weight', parseFloat(this.value), '${contextType}')">
                      </div>
                  </div>
                </div>

                <div class="d-flex flex-column align-items-end gap-3 mt-4" style="min-width: 110px;">
                  <div class="form-check form-switch text-end" title="Visible only to Officials?">
                    <input class="form-check-input float-end ms-2" type="checkbox" id="visSwitch${index}" ${comp.audience === 'admin' ? 'checked' : ''}
                        onchange="designer.updateComponent('${contextId}', ${index}, 'audience', this.checked ? 'admin' : 'judge', '${contextType}')">
                    <label class="form-check-label small fw-bold text-muted d-block me-4" for="visSwitch${index}">Official Only</label>
                  </div>

                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-secondary" onclick="designer.duplicateComponent('${contextId}', ${index}, '${contextType}')" title="Duplicate"><i class="fas fa-copy"></i></button>
                    <button class="btn btn-outline-danger" onclick="designer.removeComponent('${contextId}', ${index}, '${contextType}')" title="Delete"><i class="fas fa-trash"></i></button>
                  </div>

                </div>
              </div>`;

            // Drag Events (Now enabled for BOTH Game and Presets)
            row.addEventListener('dragstart', (e) => { this.dragSrcIndex = index; e.dataTransfer.effectAllowed = 'move'; row.classList.add('opacity-50'); });
            row.addEventListener('dragend', (e) => { row.classList.remove('opacity-50'); this.dragSrcIndex = null; });
            row.addEventListener('dragover', (e) => { e.preventDefault(); return false; });
            row.addEventListener('drop', (e) => {
                e.stopPropagation();
                if (this.dragSrcIndex !== null && this.dragSrcIndex !== index) {
                    this.moveComponent(contextId, this.dragSrcIndex, index, contextType);
                }
                return false;
            });

            container.appendChild(row);
        });
    },

    // --- DATA HELPERS ---
    getContainer: function(id, type) {
        if(type === 'game') return this.data.games.find(g => g.id === id)?.scoring;
        // For presets, we wrap the array in an object so we can access .components
        if(type === 'preset_manager') return { components: this.presets };
        return null;
    },

    // Updates a specific component in the list
    updateComponent: function(id, index, field, value, type = 'game') {
        const container = this.getContainer(id, type);
        if(container && container.components[index]) {
            container.components[index][field] = value;
        }
    },

    updateConfig: function(id, index, field, value, type = 'game') {
        const container = this.getContainer(id, type);
        if(container && container.components[index]) {
            if(!container.components[index].config) container.components[index].config = {};
            container.components[index].config[field] = value;
        }
    },

    handleKindChange: function(id, index, newKind, type = 'game') {
        const container = this.getContainer(id, type);
        if(!container) return;
        const comp = container.components[index];
        comp.kind = newKind;
        if(newKind === 'points') comp.weight = 1;
        if(newKind === 'penalty') comp.weight = -1;
        if(newKind === 'metric' || newKind === 'info') comp.weight = 0;

        this.renderScoringInputs(container.components, id, type);
    },

    // ACTIONS (Shared logic for Add/Remove/Dup/Move)
    addGenericField: function(id, type = 'game') {
        const container = this.getContainer(id, type);
        if(!container) return;
        if(!container.components) container.components = [];

        container.components.push({
            id: `field_${Date.now()}`, type: 'number', kind: 'points', label: 'Points', weight: 1, audience: 'judge', config: {}
        });
        this.renderScoringInputs(container.components, id, type);
    },

    removeComponent: function(id, index, type = 'game') {
        const container = this.getContainer(id, type);
        if(container) {
            container.components.splice(index, 1);
            this.renderScoringInputs(container.components, id, type);
        }
    },

    duplicateComponent: function(id, index, type = 'game') {
        const container = this.getContainer(id, type);
        if(container) {
            const copy = JSON.parse(JSON.stringify(container.components[index]));
            copy.id = `copy_${Date.now()}`;
            copy.label += " (Copy)";
            container.components.splice(index + 1, 0, copy);
            this.renderScoringInputs(container.components, id, type);
        }
    },

    moveComponent: function(id, from, to, type = 'game') {
        const container = this.getContainer(id, type);
        if(container) {
            const [moved] = container.components.splice(from, 1);
            container.components.splice(to, 0, moved);
            this.renderScoringInputs(container.components, id, type);
        }
    },

    // 7. PRESET MODAL
    openPresetModal: function(gameId) {
        this.activeGameId = gameId;
        const modalEl = document.getElementById('presetModal');
        const select = document.getElementById('presetSelect');
        select.innerHTML = this.presets.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    },

    confirmInsertPreset: function() {
        const select = document.getElementById('presetSelect');
        const presetId = select.value;
        const preset = this.presets.find(p => p.id === presetId);

        if(preset && this.activeGameId) {
            const game = this.data.games.find(g => g.id === this.activeGameId);
            const copy = JSON.parse(JSON.stringify(preset));
            // New unique ID for the game context
            copy.id = `preset_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;

            if(!game.scoring.components) game.scoring.components = [];
            game.scoring.components.push(copy);
            this.renderScoringInputs(game.scoring.components, game.id, 'game');
        }

        const modalEl = document.getElementById('presetModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    },

    // 8. ZIP EXPORT / IMPORT
    updateSortOrders: function() {
        this.data.games.forEach(g => {
            if(g.scoring.components) g.scoring.components.forEach((c,i) => c.sortOrder = i * 10);
        });
    },

    exportCamporee: function() {
        this.updateSortOrders();
        const zip = new JSZip();

        const playlist = this.data.games.map((g, i) => ({
            gameId: g.id,
            enabled: g.enabled,
            order: i + 1
        }));

        const camporeeJson = {
            schemaVersion: "2.5",
            meta: this.data.meta,
            playlist: playlist
        };
        zip.file("camporee.json", JSON.stringify(camporeeJson, null, 2));

        // Save Atomic Presets
        zip.file("presets.json", JSON.stringify(this.presets, null, 2));

        const gamesFolder = zip.folder("games");
        this.data.games.forEach(game => {
            const gameFile = {
                id: game.id,
                schemaVersion: "2.5",
                content: game.content,
                scoring: game.scoring
            };
            gamesFolder.file(`${game.id}.json`, JSON.stringify(gameFile, null, 2));
        });

        zip.generateAsync({type:"blob"}).then(function(content) {
            saveAs(content, "CamporeeConfig.zip");
        });
    },

    handleFileUpload: function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            JSZip.loadAsync(e.target.result).then(async (zip) => {
                const metaFile = await zip.file("camporee.json").async("string");
                const metaObj = JSON.parse(metaFile);

                this.data.meta = metaObj.meta;

                if(zip.file("presets.json")) {
                    const presetsFile = await zip.file("presets.json").async("string");
                    this.presets = JSON.parse(presetsFile);
                }

                this.data.games = [];
                const gamePromises = [];
                zip.folder("games").forEach((relativePath, file) => {
                    gamePromises.push(file.async("string").then(c => JSON.parse(c)));
                });

                const loadedGames = await Promise.all(gamePromises);
                loadedGames.forEach(g => {
                    const playlistItem = metaObj.playlist.find(p => p.gameId === g.id);
                    g.enabled = playlistItem ? playlistItem.enabled : false;
                    if(!g.scoring.components) g.scoring.components = [];
                    this.data.games.push(g);
                });

                this.updateMetaUI();
                this.renderGameList();
                this.activeGameId = null;
                document.getElementById('editor-container').innerHTML = '<p class="text-muted">Select a game to edit.</p>';
                alert("Camporee Loaded Successfully!");
            });
        };
        reader.readAsArrayBuffer(file);
    }
};

window.onload = function() {
    designer.init();
};