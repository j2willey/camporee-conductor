import { SyncManager } from './sync-manager.js';

const syncManager = new SyncManager();

const state = {
    config: null,
    entities: [],
    currentStation: null,
    currentEntity: null,
    isOnline: navigator.onLine
};

// UI References
const views = {
    home: document.getElementById('view-home'),
    entity: document.getElementById('view-entity'),
    scoring: document.getElementById('view-scoring')
};

const els = {
    status: document.getElementById('status-indicator'),
    unsyncedCount: document.getElementById('unsynced-count'),
    stationList: document.getElementById('station-list'),
    entityList: document.getElementById('entity-list'),
    entitySearch: document.getElementById('entity-search'),
    entityHeader: document.getElementById('entity-header'),
    scoreForm: document.getElementById('score-form'),
    scoringTitle: document.getElementById('scoring-title'),
    scoringTeam: document.getElementById('scoring-team'),
    lastUpdated: document.getElementById('last-updated'),
    judgeName: document.getElementById('judge-name'),
    judgeEmail: document.getElementById('judge-email'),
    judgeUnit: document.getElementById('judge-unit')
};

// --- Initialization ---

async function init() {
    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // 1. Load Data from LocalStorage
    loadLocalData();

    // 2. Pre-fill Judge Info if it exists
    loadJudgeInfo();

    // 3. Render whatever we have immediately
    renderStationList();
    updateSyncCounts();

    // 4. If online, try to fetch fresh data
    if (state.isOnline) {
       await refreshData();
    }

    // Event Listeners
    document.getElementById('btn-sync').addEventListener('click', handleSync);
    document.getElementById('btn-reload-data').addEventListener('click', refreshData);
    els.entitySearch.addEventListener('input', (e) => renderEntityList(e.target.value));
    document.getElementById('btn-submit').addEventListener('click', submitScore);
}

function updateOnlineStatus() {
    state.isOnline = navigator.onLine;
    els.status.textContent = state.isOnline ? 'Online' : 'Offline';
    els.status.className = state.isOnline ? 'status-online' : 'status-offline';
}

function loadJudgeInfo() {
    try {
        const storedJudge = localStorage.getItem('judge_info');
        if (storedJudge) {
            const judge = JSON.parse(storedJudge);
            if (els.judgeName) els.judgeName.value = judge.name || '';
            if (els.judgeEmail) els.judgeEmail.value = judge.email || '';
            if (els.judgeUnit) els.judgeUnit.value = judge.unit || '';
        }
    } catch (e) {
        console.warn('Failed to load judge info', e);
    }
}

// --- Data Management ---

function loadLocalData() {
    try {
        const c = localStorage.getItem('coyote_config');
        const e = localStorage.getItem('coyote_entities');
        const t = localStorage.getItem('coyote_last_updated');

        if (c) state.config = JSON.parse(c);
        if (e) state.entities = JSON.parse(e);
        if (t) els.lastUpdated.textContent = 'Last updated: ' + new Date(parseInt(t)).toLocaleString();
    } catch (err) {
        console.error('Error loading local data', err);
    }
}

async function refreshData() {
    try {
        // We add '?t=' + Date.now() to force the browser to ignore its cache
        // and actually get the new 'common_scoring' data from the server.
        const [configRes, entitiesRes] = await Promise.all([
            fetch('/games.json?t=' + Date.now()),
            fetch('/api/entities?t=' + Date.now())
        ]);

        if (configRes.ok && entitiesRes.ok) {
            const serverConfig = await configRes.json();
            const entities = await entitiesRes.json();

            // Map server config to app state structure
            const config = {
                stations: serverConfig.games,
                common_scoring: serverConfig.common_scoring || []
            };

            console.log("Configuration Loaded:", config); // Debugging line

            state.config = config;
            state.entities = entities;

            localStorage.setItem('coyote_config', JSON.stringify(config));
            localStorage.setItem('coyote_entities', JSON.stringify(entities));
            localStorage.setItem('coyote_last_updated', Date.now().toString());

            if (els.lastUpdated) els.lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleString();

            renderStationList();
            // Optional: alert('Config & Roster Updated');
        } else {
            console.error('Fetch failed', configRes.status, entitiesRes.status);
        }
    } catch (err) {
        console.error('Network error refreshing data', err);
        // Only alert if we really have no data to show
        if (!state.config) alert('Could not load configuration. Please connect to WiFi.');
    }
}

function updateSyncCounts() {
    const counts = syncManager.getCounts();
    els.unsyncedCount.textContent = counts.unsynced;
}

async function handleSync() {
    if (!state.isOnline) {
        alert('Must be online to sync');
        return;
    }

    document.getElementById('btn-sync').textContent = 'Syncing...';
    try {
        const result = await syncManager.sync();
        alert(`Sync Complete\nSent: ${result.synced}\nErrors: ${result.errors}`);
        updateSyncCounts();
    } finally {
        document.getElementById('btn-sync').textContent = 'Sync Scores Now';
    }
}

// --- Navigation ---

function navigate(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    window.scrollTo(0,0);
}

// --- Renderers ---

function renderStationList() {
    // If no config, show a button to try loading it manually
    if (!state.config || !state.config.stations) {
        els.stationList.innerHTML = `
            <div class="text-center p-4">
                <p class="text-muted">No games loaded.</p>
                <button class="btn btn-primary" onclick="app.refreshData()">Load Games</button>
            </div>`;
        return;
    }

    els.stationList.innerHTML = state.config.stations.map(station => `
        <button class="btn btn-outline-dark w-100 mb-2 text-start p-3 shadow-sm" onclick="app.selectStation('${station.id}')">
            <div class="fw-bold">${station.name}</div>
            <small class="text-muted text-uppercase" style="font-size:0.75rem;">${station.type}</small>
        </button>
    `).join('');
}

function selectStation(stationId) {
    state.currentStation = state.config.stations.find(s => s.id === stationId);
    if (!state.currentStation) return;

    renderEntityList();
    navigate('entity');
}

// DENSE MODE
function renderEntityList(filter = '') {
    if (!state.currentStation) return;

    const requiredType = state.currentStation.type;
    const term = filter.toLowerCase();

    const filtered = state.entities.filter(e => {
        if (e.type !== requiredType) return false;
        return e.name.toLowerCase().includes(term) || e.troop_number.includes(term);
    });

    els.entityHeader.textContent = `Select ${requiredType === 'patrol' ? 'Patrol' : 'Troop'}`;

    els.entityList.innerHTML = filtered.map(entity => `
        <div class="list-group-item list-group-item-action p-2 d-flex justify-content-between align-items-center"
             onclick="app.selectEntity(${entity.id})"
             style="cursor:pointer; border-left: 4px solid var(--bs-primary); margin-bottom: 4px;">
            <div class="fw-bold text-truncate" style="max-width: 70%;">${entity.name}</div>
            <span class="badge bg-secondary rounded-pill">Tr ${entity.troop_number}</span>
        </div>
    `).join('');
}

function selectEntity(entityId) {
    state.currentEntity = state.entities.find(e => e.id === entityId);
    renderForm();
    navigate('scoring');
}

function showEntitySelect() {
    navigate('entity');
}

// --- Form Generator (Polished) ---

function renderForm() {
    const station = state.currentStation;
    const entity = state.currentEntity;

    els.scoringTitle.textContent = station.name;
    els.scoringTeam.textContent = `${entity.name} (Troop ${entity.troop_number})`;

    els.scoreForm.innerHTML = '';

    // 1. Render Game Fields
    if (station.fields && station.fields.length > 0) {
        station.fields.forEach(field => {
            els.scoreForm.innerHTML += generateFieldHTML(field);
        });
    }

    // 2. Render Common Scoring (with Separator)
    if (state.config.common_scoring && state.config.common_scoring.length > 0) {
        els.scoreForm.innerHTML += `
            <div class="mt-4 mb-3 pb-2 border-bottom border-2 text-primary fw-bold text-uppercase small">
                Standard Scoring
            </div>
        `;
        state.config.common_scoring.forEach(field => {
            els.scoreForm.innerHTML += generateFieldHTML(field);
        });
    }

    // --- 🔍 DEBUG SECTION ---
    // This will print the raw configuration data at the bottom of the form
    const debugData = {
        "Has Config?": !!state.config,
        "Common Scoring Count": state.config?.common_scoring?.length || 0,
        "Raw Common Data": state.config?.common_scoring || "MISSING"
    };

    const debugHtml = `
        <div class="mt-5 p-3 bg-dark text-warning font-monospace rounded shadow-sm" style="opacity: 0.9;">
            <h6 class="border-bottom border-secondary pb-2 mb-2">🐛 Debug Console</h6>
            <div><strong>Scoring Items Found:</strong> ${debugData["Common Scoring Count"]}</div>
            <div class="mt-2 small text-muted">Raw JSON Payload:</div>
            <pre style="font-size: 0.75rem; color: #adbac7; max-height: 200px; overflow-y: auto;">${JSON.stringify(debugData["Raw Common Data"], null, 2)}</pre>
        </div>
    `;

    els.scoreForm.innerHTML += debugHtml;
}

function generateFieldHTML(field) {
    const id = field.id;
    const label = field.label;
    const help = field.helperText ? `<div class="form-text small">${field.helperText}</div>` : '';

    let inputHtml = '';

    switch(field.type) {
        case 'boolean':
             // Big toggle switch
             inputHtml = `
                <div class="form-check form-switch p-3 border rounded bg-light d-flex align-items-center justify-content-between">
                    <label class="form-check-label fw-bold mb-0" for="f_${id}">${label}</label>
                    <input class="form-check-input" type="checkbox" name="${id}" id="f_${id}" style="transform: scale(1.4); margin-left: 1rem;">
                </div>`;
             // Early return for unique layout
             return `<div class="mb-3">${inputHtml}</div>`;

        case 'number':
             inputHtml = `<input type="number" class="form-control form-control-lg" name="${id}" id="f_${id}" placeholder="0" min="${field.min||0}" max="${field.max||999}">`;
             break;

        case 'range':
             const mid = Math.ceil((field.max || 10) / 2);
             inputHtml = `
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bold text-muted">${field.min || 0}</span>
                    <input type="range" class="form-range flex-grow-1" name="${id}" id="f_${id}"
                           min="${field.min || 0}" max="${field.max || 10}" value="${mid}"
                           oninput="document.getElementById('disp_${id}').innerText = this.value">
                    <span class="fw-bold text-muted">${field.max || 10}</span>
                </div>
                <div class="text-center fw-bold text-primary mt-1">Score: <span id="disp_${id}" style="font-size:1.2rem">${mid}</span></div>
             `;
             break;

         case 'time_mm_ss':
             inputHtml = `
                <div class="input-group input-group-lg">
                    <input type="number" class="form-control text-center" id="f_${id}_mm" placeholder="MM" min="0" onchange="app.combineTime('${id}')">
                    <span class="input-group-text fw-bold">:</span>
                    <input type="number" class="form-control text-center" id="f_${id}_ss" placeholder="SS" min="0" max="59" onchange="app.combineTime('${id}')">
                </div>
                <input type="hidden" name="${id}" id="f_${id}_val">
             `;
             break;

         case 'select':
             inputHtml = `
                <select class="form-select form-select-lg" name="${id}" id="f_${id}">
                    ${field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
             `;
             break;

         default:
            inputHtml = `<input type="text" class="form-control form-control-lg" name="${id}" id="f_${id}">`;
    }

    return `
        <div class="mb-3">
            <label class="form-label fw-bold">${label}</label>
            ${inputHtml}
            ${help}
        </div>`;
}

function combineTime(fieldId) {
    const mm = document.getElementById(`f_${fieldId}_mm`).value || '00';
    const ss = document.getElementById(`f_${fieldId}_ss`).value || '00';
    const mStr = mm.toString().padStart(2, '0');
    const sStr = ss.toString().padStart(2, '0');
    const valField = document.getElementById(`f_${fieldId}_val`);
    if(valField) valField.value = `${mStr}:${sStr}`;
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- Submission ---

function submitScore(e) {
    e.preventDefault();
    if (!state.currentStation || !state.currentEntity) return;

    // Gather Data
    const formData = new FormData(els.scoreForm);
    const scorePayload = {};

    // We must iterate over config fields to properly handle booleans and composite times
    let allFields = [...(state.currentStation.fields || [])];
    if (state.config.common_scoring && Array.isArray(state.config.common_scoring)) {
        allFields = [...allFields, ...state.config.common_scoring];
    }

    for (const field of allFields) {
        const el = document.getElementById(`f_${field.id}`);
        if (!el) continue; // Safety check

        if (field.type === 'boolean') {
             scorePayload[field.id] = el.checked;
        } else if (field.type === 'time_mm_ss') {
             combineTime(field.id);
             scorePayload[field.id] = document.getElementById(`f_${field.id}_val`).value || "00:00";
        } else {
             // For sliders and text, formData.get works, but direct element value is safer given our custom IDs
             scorePayload[field.id] = el.value;
        }
    }

    const packet = {
        uuid: generateUUID(),
        game_id: state.currentStation.id,
        entity_id: state.currentEntity.id,
        score_payload: scorePayload,
        timestamp: Date.now(),
        judge_name: els.judgeName ? els.judgeName.value : null,
        judge_email: els.judgeEmail ? els.judgeEmail.value : null,
        judge_unit: els.judgeUnit ? els.judgeUnit.value : null
    };

    // Save Judge Info for next time
    if (packet.judge_name || packet.judge_email) {
        localStorage.setItem('judge_info', JSON.stringify({
            name: packet.judge_name,
            email: packet.judge_email,
            unit: packet.judge_unit
        }));
    }

    // Queue
    syncManager.addToQueue(packet);

    updateSyncCounts();
    alert('Score Saved!');
    app.navigate('home');

    // Attempt background sync if online
    if (state.isOnline) {
        syncManager.sync().then(updateSyncCounts);
    }
}

// --- Exports ---
window.app = {
    init,
    navigate,
    refreshData,
    selectStation,
    selectEntity,
    showEntitySelect,
    combineTime,
    submitScore
};

// Start
init();