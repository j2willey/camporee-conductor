/**
 * Coyote Camporee Designer Logic (v13 - Split Tabs)
 * Features: Patrol vs Troop Tabs, Game Types, Server Sync, Atomic Presets.
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
    pendingImportGames: [],

    // 2. INITIALIZATION
    init: function() {
        console.log("Designer Initialized");
        this.setupDynamicTabs(); // Rearrange the DOM for split view

        const fileInput = document.getElementById('fileInput');
        if(fileInput) fileInput.addEventListener('change', (e) => this.handleCamporeeImport(e));

        const gameInput = document.createElement('input');
        gameInput.type = 'file';
        gameInput.id = 'importGameInput';
        gameInput.accept = '.json,.zip';
        gameInput.style.display = 'none';
        gameInput.addEventListener('change', (e) => this.handleGameImport(e));
        document.body.appendChild(gameInput);

        ['metaTitle', 'metaTheme'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.addEventListener('input', (e) => {
                    const key = id === 'metaTitle' ? 'title' : 'theme';
                    this.data.meta[key] = e.target.value;
                });
            }
        });

        this.renderServerControls();
        this.renderGameLists(); // Now renders two lists
    },

    // 3. DYNAMIC UI SETUP (The "Split")
    setupDynamicTabs: function() {
        const navTabs = document.querySelector('.nav-tabs');
        const tabContent = document.querySelector('.tab-content');
        if(!navTabs || !tabContent) return;

        // A. Convert "Game Library" (usually 2nd child) to "Patrol Games"
        // We identify it by assuming standard order or by class/id if present in your index.ejs
        // To be safe, we look for the tab that isn't 'Info' or 'Presets'
        let libraryTab = document.getElementById('library-tab') || navTabs.children[1]?.querySelector('button');
        let libraryPane = document.getElementById('library-pane') || tabContent.children[1];

        if(libraryTab && libraryTab.innerText.includes('Library')) {
            // Transform to Patrol Tab
            libraryTab.id = 'patrol-tab';
            libraryTab.innerText = 'Patrol Games';
            libraryTab.setAttribute('data-bs-target', '#patrol-pane');

            libraryPane.id = 'patrol-pane';
            // Clear content and add container
            libraryPane.innerHTML = `<div id="patrolList" class="list-group p-3"></div>
                                     <div class="p-3"><button class="btn btn-primary w-100" onclick="designer.addGame('patrol')"><i class="fas fa-plus-circle"></i> Add Patrol Game</button></div>`;
        }

        // B. Inject "Troop Events" Tab (Insert after Patrol)
        if(!document.getElementById('troop-tab')) {
            const patrolLi = document.getElementById('patrol-tab')?.parentElement;
            if(patrolLi) {
                const li = document.createElement('li');
                li.className = 'nav-item';
                li.innerHTML = `<button class="nav-link" id="troop-tab" data-bs-toggle="tab" data-bs-target="#troop-pane" type="button">Troop Events</button>`;
                navTabs.insertBefore(li, patrolLi.nextSibling);
            }

            const patrolPane = document.getElementById('patrol-pane');
            if(patrolPane) {
                const div = document.createElement('div');
                div.className = 'tab-pane fade';
                div.id = 'troop-pane';
                div.innerHTML = `<div id="troopList" class="list-group p-3"></div>
                                 <div class="p-3"><button class="btn btn-success w-100" onclick="designer.addGame('troop')"><i class="fas fa-calendar-plus"></i> Add Troop Event</button></div>`;
                tabContent.insertBefore(div, patrolPane.nextSibling);
            }
        }

        // C. Inject "Presets" Tab (if missing)
        if(!document.getElementById('presets-tab')) {
            const li = document.createElement('li');
            li.className = 'nav-item';
            li.innerHTML = `<button class="nav-link" id="presets-tab" data-bs-toggle="tab" data-bs-target="#presets-pane" type="button">Presets</button>`;
            navTabs.appendChild(li);

            const pane = document.createElement('div');
            pane.className = 'tab-pane fade';
            pane.id = 'presets-pane';
            pane.innerHTML = `<div id="presets-container" class="p-3"></div>`;
            tabContent.appendChild(pane);
            document.getElementById('presets-tab').addEventListener('shown.bs.tab', () => this.renderPresetManager());
        }

        // D. Inject Modals (if missing)
        this.injectModals();
    },

    injectModals: function() {
        if (!document.getElementById('presetModal')) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="presetModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title">Insert Preset Field</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body"><div class="mb-3"><label class="form-label">Choose Field</label><select class="form-select" id="presetSelect"></select></div></div>
                        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn btn-primary" onclick="designer.confirmInsertPreset()">Insert</button></div>
                    </div>
                </div>
            </div>`);
        }
        if (!document.getElementById('importModal')) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="importModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title">Import Games from Zip</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                        <div class="modal-body"><p>Select games to import:</p><div class="list-group" id="importList"></div></div>
                        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn btn-success" onclick="designer.confirmGameImport()">Import Selected</button></div>
                    </div>
                </div>
            </div>`);
        }
    },

    renderServerControls: function() {
        const headerBtnGroup = document.querySelector('.d-flex.gap-2');
        if(headerBtnGroup && !document.getElementById('btnSaveServer')) {
            const div = document.createElement('div');
            div.className = "btn-group ms-2";
            div.innerHTML = `
                <button id="btnSaveServer" class="btn btn-outline-light" onclick="designer.saveToServer()" title="Save to Server"><i class="fas fa-cloud-upload-alt"></i></button>
                <button id="btnLoadServer" class="btn btn-outline-light" onclick="designer.loadFromServer()" title="Load from Server"><i class="fas fa-cloud-download-alt"></i></button>
            `;
            headerBtnGroup.appendChild(div);
        }
    },

    // 4. SERVER SYNC
    saveToServer: async function() {
        const payload = { meta: this.data.meta, games: this.data.games, presets: this.presets };
        try {
            const res = await fetch('/api/camporee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await res.json();
            alert(result.success ? "Saved to Server!" : "Error: " + result.message);
        } catch(e) { alert("Network Error"); }
    },

    loadFromServer: async function() {
        if(!confirm("Load from Server? Overwrites changes.")) return;
        try {
            const res = await fetch('/api/camporee');
            if(res.status === 404) { alert("No saved data found."); return; }
            const data = await res.json();
            this.data.meta = data.meta || this.data.meta;
            this.data.games = data.games || [];
            if(data.presets) this.presets = data.presets;
            this.updateMetaUI(); this.renderGameLists(); this.renderPresetManager();
            alert("Loaded from Server!");
        } catch(e) { alert("Network Error"); }
    },

    // 5. IMPORT/EXPORT
    triggerGameImport: function() {
        document.getElementById('importGameInput').value = null;
        document.getElementById('importGameInput').click();
    },

    handleGameImport: function(event) {
        const file = event.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        if(file.name.endsWith('.json')) {
            reader.onload = (e) => {
                try {
                    const game = JSON.parse(e.target.result);
                    game.id = `import_${Date.now()}`;
                    game.content.title += " (Imported)";
                    this.data.games.push(game);
                    this.renderGameLists();
                    this.editGame(game.id);
                    alert("Game Imported!");
                } catch(err) { alert("Invalid JSON"); }
            };
            reader.readAsText(file);
        } else if (file.name.endsWith('.zip')) {
            reader.onload = (e) => {
                JSZip.loadAsync(e.target.result).then(async (zip) => {
                    this.pendingImportGames = [];
                    const promises = [];
                    zip.folder("games").forEach((p, f) => promises.push(f.async("string").then(txt => { try { return JSON.parse(txt); } catch(e){return null;} })));
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
                <span><strong>${g.content?.title || g.id}</strong><br><small class="text-muted">${g.type || 'patrol'}</small></span>
            </label>`).join('');
        new bootstrap.Modal(document.getElementById('importModal')).show();
    },

    confirmGameImport: function() {
        document.querySelectorAll('#importList input:checked').forEach(chk => {
            const game = JSON.parse(JSON.stringify(this.pendingImportGames[parseInt(chk.value)]));
            game.id = `import_${Date.now()}_${chk.value}`;
            this.data.games.push(game);
        });
        this.renderGameLists();
        bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
    },

    exportSingleGame: function(gameId) {
        const game = this.data.games.find(g => g.id === gameId);
        if(game) saveAs(new Blob([JSON.stringify(game, null, 2)], {type: "application/json;charset=utf-8"}), `${game.id}.json`);
    },

    // 6. APP LOGIC (Split Rendering)
    newCamporee: function() {
        if(confirm("Start new Camporee?")) {
            this.data.games = [];
            this.data.meta = { title: "New Camporee", theme: "", year: new Date().getFullYear() };
            this.activeGameId = null;
            this.updateMetaUI(); this.renderGameLists();
            document.getElementById('editor-container').innerHTML = '<p class="text-muted">Select a game to edit.</p>';
        }
    },

    addGame: function(type = 'patrol') {
        const newId = `game_${Date.now()}`;
        const newGame = {
            id: newId,
            type: type,
            enabled: true,
            content: { title: type === 'patrol' ? "New Game" : "New Event", story: "", instructions: "" },
            scoring: { method: "points_desc", components: [{ id: "score_1", type: "number", kind: "points", label: "Points", weight: 1, audience: "judge", sortOrder: 0 }] }
        };
        this.data.games.push(newGame);
        this.renderGameLists();
        this.editGame(newId);
    },

    duplicateGame: function(gameId) {
        const original = this.data.games.find(g => g.id === gameId);
        if(!original) return;
        const clone = JSON.parse(JSON.stringify(original));
        clone.id = `game_${Date.now()}`;
        clone.content.title += " (Copy)";
        if(clone.scoring.components) clone.scoring.components.forEach(c => c.id = `${c.kind}_${Date.now()}_${Math.random().toString(36).substr(2,5)}`);
        this.data.games.push(clone);
        this.renderGameLists();
        this.editGame(clone.id);
    },

    deleteGame: function(gameId) {
        if(confirm("Delete this?")) {
            this.data.games = this.data.games.filter(g => g.id !== gameId);
            if (this.activeGameId === gameId) {
                this.activeGameId = null;
                document.getElementById('editor-container').innerHTML = '<p class="text-muted">Select to edit.</p>';
            }
            this.renderGameLists();
        }
    },

    updateMetaUI: function() {
        const t = document.getElementById('metaTitle'), th = document.getElementById('metaTheme');
        if(t) t.value = this.data.meta.title || "";
        if(th) th.value = this.data.meta.theme || "";
    },

    // REPLACES renderGameList
    renderGameLists: function() {
        const patrolList = document.getElementById('patrolList');
        const troopList = document.getElementById('troopList');

        // Safety check if tabs haven't initialized yet
        if(!patrolList || !troopList) return;

        patrolList.innerHTML = '';
        troopList.innerHTML = '';

        if (this.data.games.length === 0) {
            patrolList.innerHTML = '<div class="text-center text-muted">No patrol games.</div>';
            troopList.innerHTML = '<div class="text-center text-muted">No troop events.</div>';
            return;
        }

        this.data.games.forEach(game => {
            const isActive = game.id === this.activeGameId ? 'active' : '';
            const statusClass = game.enabled ? 'text-success' : 'text-secondary';
            const isPatrol = (!game.type || game.type === 'patrol');
            const targetList = isPatrol ? patrolList : troopList;

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
                    <button class="btn btn-sm btn-outline-secondary border-0" onclick="event.stopPropagation(); designer.exportSingleGame('${game.id}')"><i class="fas fa-file-download"></i></button>
                    <button class="btn btn-sm btn-outline-secondary border-0" onclick="event.stopPropagation(); designer.duplicateGame('${game.id}')"><i class="fas fa-copy"></i></button>
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="event.stopPropagation(); designer.deleteGame('${game.id}')"><i class="fas fa-trash"></i></button>
                </div>`;
            targetList.appendChild(item);
        });
    },

    // 7. GAME EDITOR
    editGame: function(gameId) {
        this.activeGameId = gameId;
        const game = this.data.games.find(g => g.id === gameId);
        if (!game) return;
        if(!game.type) game.type = 'patrol';

        // ACTIVATE EDITOR TAB
        const tabTriggerEl = document.querySelector('#editor-tab');
        if (tabTriggerEl && window.bootstrap) { new bootstrap.Tab(tabTriggerEl).show(); }

        const container = document.getElementById('editor-container');
        container.innerHTML = `
            <div class="card mb-4">
                <div class="card-header bg-light"><h5 class="mb-0">Game Metadata</h5></div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8 mb-3"><label class="form-label">Title</label><input type="text" class="form-control" id="gameTitle"></div>
                        <div class="col-md-4 mb-3"><label class="form-label">ID</label><input type="text" class="form-control" id="gameId" readonly></div>
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
                        <div class="col-md-8 mb-3"><label class="form-label">Premise</label><input type="text" class="form-control" id="gameStory"></div>
                    </div>
                     <div class="mb-3"><label class="form-label">Instructions</label><textarea class="form-control" rows="2" id="gameInstructions"></textarea></div>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="gameEnabled" ${game.enabled ? 'checked' : ''}>
                        <label class="form-check-label">Enabled</label>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Scoring Fields</h5>
                    <div class="d-flex align-items-center gap-2">
                        <small class="text-muted">Win Condition:</small>
                        <select class="form-select form-select-sm d-inline-block w-auto" id="gameScoringMethod">
                            <option value="points_desc">Highest Points</option>
                            <option value="timed_asc">Lowest Time</option>
                        </select>
                    </div>
                </div>
                <div class="card-body bg-light">
                    <div id="scoring-editor" class="d-flex flex-column gap-3"></div>
                    <div class="mt-4 text-center">
                         <div class="btn-group shadow-sm">
                            <button class="btn btn-primary" onclick="designer.addGenericField('${gameId}', 'game')"><i class="fas fa-plus-circle"></i> Add Field</button>
                            <button class="btn btn-outline-primary" onclick="designer.openPresetModal('${gameId}')"><i class="fas fa-magic"></i> Add Preset</button>
                         </div>
                    </div>
                </div>
            </div>`;

        ['gameTitle','gameId','gameStory','gameInstructions'].forEach(fid => {
             const prop = fid === 'gameId' ? 'id' : (fid === 'gameTitle' ? 'title' : (fid==='gameStory'?'story':'instructions'));
             const el = document.getElementById(fid);
             if(el) {
                 el.value = (prop === 'id' ? game.id : game.content[prop]) || '';
                 el.oninput = (e) => this.updateGameField(prop, e.target.value);
             }
        });

        const typeSelect = document.getElementById('gameType');
        typeSelect.value = game.type;
        typeSelect.onchange = (e) => { game.type = e.target.value; this.renderGameLists(); }; // Refresh to move game between tabs

        const methodSelect = document.getElementById('gameScoringMethod');
        methodSelect.value = game.scoring.method || 'points_desc';
        methodSelect.onchange = (e) => { game.scoring.method = e.target.value; };

        document.getElementById('gameEnabled').onchange = (e) => { game.enabled = e.target.checked; this.renderGameLists(); };

        this.renderScoringInputs(game.scoring.components, game.id, 'game');
    },

    updateGameField: function(field, value) {
        if (!this.activeGameId) return;
        const game = this.data.games.find(g => g.id === this.activeGameId);
        if (!game) return;
        if (field === 'id') { game.id = value; this.activeGameId = value; }
        else { game.content[field] = value; }
        if (field === 'title' || field === 'id') this.renderGameLists();
    },

    // 8. PRESET MANAGER
    renderPresetManager: function() {
        const container = document.getElementById('presets-container');
        if(!container) return;
        container.innerHTML = `
            <div class="card">
                <div class="card-header bg-light"><h5 class="mb-0">Preset Library</h5></div>
                <div class="card-body bg-light">
                    <div id="preset-editor-list" class="d-flex flex-column gap-3"></div>
                    <div class="mt-4 text-center"><button class="btn btn-primary" onclick="designer.addGenericField('global', 'preset_manager')"><i class="fas fa-plus-circle"></i> Add Field</button></div>
                </div>
            </div>`;
        this.renderScoringInputs(this.presets, 'global', 'preset_manager');
    },

    // 9. SCORING RENDERER (Shared)
    renderScoringInputs: function(components, contextId, contextType = 'game') {
        const containerId = contextType === 'preset_manager' ? 'preset-editor-list' : 'scoring-editor';
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        if (!components || components.length === 0) { container.innerHTML = '<div class="alert alert-white text-center border">No fields defined. Add one below.</div>'; return; }

        components.forEach((comp, index) => {
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
                  <input type="text" class="form-control form-control-sm fw-bold mb-2" value="${comp.label || ''}" oninput="designer.updateComponent('${contextId}', ${index}, 'label', this.value, '${contextType}')">
                  <label class="form-label small text-muted fw-bold mb-1">Description (for Judge)</label>
                  <input type="text" class="form-control form-control-sm text-muted" value="${comp.config?.placeholder || ''}" oninput="designer.updateConfig('${contextId}', ${index}, 'placeholder', this.value, '${contextType}')">
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
                        <input type="number" class="form-control" value="${comp.config?.min || ''}" onchange="designer.updateConfig('${contextId}', ${index}, 'min', this.value, '${contextType}')">
                        <span class="input-group-text text-muted">Max</span>
                        <input type="number" class="form-control" value="${comp.config?.max || ''}" onchange="designer.updateConfig('${contextId}', ${index}, 'max', this.value, '${contextType}')">
                        <span class="input-group-text fw-bold">Wgt</span>
                        <input type="number" class="form-control fw-bold" value="${comp.weight !== undefined ? comp.weight : 0}" onchange="designer.updateComponent('${contextId}', ${index}, 'weight', parseFloat(this.value), '${contextType}')">
                      </div>
                  </div>
                </div>
                <div class="d-flex flex-column align-items-end gap-3 mt-4" style="min-width: 110px;">
                  <div class="form-check form-switch text-end">
                    <input class="form-check-input float-end ms-2" type="checkbox" id="visSwitch${index}" ${comp.audience === 'admin' ? 'checked' : ''} onchange="designer.updateComponent('${contextId}', ${index}, 'audience', this.checked ? 'admin' : 'judge', '${contextType}')">
                    <label class="form-check-label small fw-bold text-muted d-block me-4">Official Only</label>
                  </div>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-secondary" onclick="designer.duplicateComponent('${contextId}', ${index}, '${contextType}')"><i class="fas fa-copy"></i></button>
                    <button class="btn btn-outline-danger" onclick="designer.removeComponent('${contextId}', ${index}, '${contextType}')"><i class="fas fa-trash"></i></button>
                  </div>
                </div>
              </div>`;

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

    getContainer: function(id, type) { return type === 'game' ? this.data.games.find(g => g.id === id)?.scoring : { components: this.presets }; },
    updateComponent: function(id, index, field, value, type = 'game') { const c = this.getContainer(id, type); if(c) c.components[index][field] = value; },
    updateConfig: function(id, index, field, value, type = 'game') { const c = this.getContainer(id, type); if(c) { if(!c.components[index].config) c.components[index].config = {}; c.components[index].config[field] = value; } },
    handleKindChange: function(id, index, newKind, type = 'game') { const c = this.getContainer(id, type); if(!c) return; const comp = c.components[index]; comp.kind = newKind; comp.weight = (newKind === 'points' ? 1 : (newKind === 'penalty' ? -1 : 0)); this.renderScoringInputs(c.components, id, type); },
    addGenericField: function(id, type = 'game') { const c = this.getContainer(id, type); if(!c) return; if(!c.components) c.components = []; c.components.push({ id: `field_${Date.now()}`, type: 'number', kind: 'points', label: 'Points', weight: 1, audience: 'judge', config: {} }); this.renderScoringInputs(c.components, id, type); },
    removeComponent: function(id, index, type = 'game') { const c = this.getContainer(id, type); if(c) { c.components.splice(index, 1); this.renderScoringInputs(c.components, id, type); } },
    duplicateComponent: function(id, index, type = 'game') { const c = this.getContainer(id, type); if(c) { const copy = JSON.parse(JSON.stringify(c.components[index])); copy.id = `copy_${Date.now()}`; copy.label += " (Copy)"; c.components.splice(index+1, 0, copy); this.renderScoringInputs(c.components, id, type); } },
    moveComponent: function(id, from, to, type = 'game') { const c = this.getContainer(id, type); if(c) { const [moved] = c.components.splice(from, 1); c.components.splice(to, 0, moved); this.renderScoringInputs(c.components, id, type); } },

    openPresetModal: function(gameId) { this.activeGameId = gameId; const select = document.getElementById('presetSelect'); select.innerHTML = this.presets.map(p => `<option value="${p.id}">${p.label}</option>`).join(''); new bootstrap.Modal(document.getElementById('presetModal')).show(); },
    confirmInsertPreset: function() { const preset = this.presets.find(p => p.id === document.getElementById('presetSelect').value); if(preset && this.activeGameId) { const game = this.data.games.find(g => g.id === this.activeGameId); const copy = JSON.parse(JSON.stringify(preset)); copy.id = `preset_${Date.now()}`; if(!game.scoring.components) game.scoring.components = []; game.scoring.components.push(copy); this.renderScoringInputs(game.scoring.components, game.id, 'game'); } bootstrap.Modal.getInstance(document.getElementById('presetModal')).hide(); },

    updateSortOrders: function() { this.data.games.forEach(g => { if(g.scoring.components) g.scoring.components.forEach((c,i) => c.sortOrder = i * 10); }); },
    exportCamporee: function() {
        this.updateSortOrders();
        const zip = new JSZip();
        const playlist = this.data.games.map((g, i) => ({ gameId: g.id, enabled: g.enabled, order: i + 1 }));
        const camporeeJson = { schemaVersion: "2.7", meta: this.data.meta, playlist: playlist };
        zip.file("camporee.json", JSON.stringify(camporeeJson, null, 2));
        zip.file("presets.json", JSON.stringify(this.presets, null, 2));
        const gamesFolder = zip.folder("games");
        this.data.games.forEach(game => {
            gamesFolder.file(`${game.id}.json`, JSON.stringify({ id: game.id, type: game.type, schemaVersion: "2.7", content: game.content, scoring: game.scoring }, null, 2));
        });
        zip.generateAsync({type:"blob"}).then(function(content) { saveAs(content, "CamporeeConfig.zip"); });
    },
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
                    if(!g.type) g.type = 'patrol';
                    this.data.games.push(g);
                });
                this.updateMetaUI(); this.renderGameLists();
                this.activeGameId = null;
                document.getElementById('editor-container').innerHTML = '<p class="text-muted">Select a game to edit.</p>';
                alert("Camporee Loaded Successfully!");
            });
        };
        reader.readAsArrayBuffer(file);
    }
};

window.onload = function() { designer.init(); };