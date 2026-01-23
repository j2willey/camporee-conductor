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

    // Try to load from storage first
    loadLocalData();

    // If online, refresh data
    if (state.isOnline) {
       await refreshData();
    }

    renderStationList();
    updateSyncCounts();

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
        const [configRes, entitiesRes] = await Promise.all([
            fetch('/games/games.json'),
            fetch('/api/entities')
        ]);

        if (configRes.ok && entitiesRes.ok) {
            let config = await configRes.json();
            const entities = await entitiesRes.json();

            // Normalize Schema: Handle array or single object structure
            if (Array.isArray(config)) {
                 config = { stations: config, common_scoring: [] };
            } else if (config.id && config.fields) {
                 // Single game object provided
                 config = { stations: [config], common_scoring: [] };
            }

            state.config = config;
            state.entities = entities;

            localStorage.setItem('coyote_config', JSON.stringify(config));
            localStorage.setItem('coyote_entities', JSON.stringify(entities));
            localStorage.setItem('coyote_last_updated', Date.now().toString());

            els.lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleString();
            renderStationList();
            alert('Config & Roster Updated');
        } else {
            console.error('Fetch failed');
        }
    } catch (err) {
        console.error('Network error refreshing data', err);
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
    if (!state.config) {
        els.stationList.innerHTML = '<div class="card">No configuration loaded. <button onclick="app.refreshData()">Load Config</button></div>';
        return;
    }

    els.stationList.innerHTML = state.config.stations.map(station => `
        <button class="btn btn-large" onclick="app.selectStation('${station.id}')">
            ${station.name} <br>
            <small style="font-size:0.8rem; font-weight:normal">Type: ${station.type}</small>
        </button>
    `).join('');
}

function selectStation(stationId) {
    state.currentStation = state.config.stations.find(s => s.id === stationId);
    if (!state.currentStation) return;

    renderEntityList();
    navigate('entity');
}

function renderEntityList(filter = '') {
    if (!state.currentStation) return;

    const requiredType = state.currentStation.type;
    const term = filter.toLowerCase();

    const filtered = state.entities.filter(e => {
        if (e.type !== requiredType) return false;
        return e.name.toLowerCase().includes(term) || e.troop_number.includes(term);
    });

    els.entityHeader.textContent = `Select ${requiredType === 'patrol' ? 'Patrol' : 'Troop'} for ${state.currentStation.name}`;

    els.entityList.innerHTML = filtered.map(entity => `
        <div class="card" onclick="app.selectEntity(${entity.id})" style="cursor:pointer; border-left: 5px solid var(--primary)">
            <strong>${entity.name}</strong> <br>
            Troop ${entity.troop_number}
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

// --- Form Generator ---

function renderForm() {
    const station = state.currentStation;
    const entity = state.currentEntity;

    els.scoringTitle.textContent = station.name;
    els.scoringTeam.textContent = `${entity.name} (Troop ${entity.troop_number})`;

    let fields = [];

    // Add Game Specific Fields
    fields = [...station.fields];

    // Add Common Fields if Patrol
    if (station.type === 'patrol' && state.config.common_scoring) {
        // Prepend common fields or append? Usually common rubrics on patrols are standard.
        // Let's Append them to ensure game specific stuff is first (most important usually)
        // Or prepend if they are "check-in" items. Let's Append.
        fields = [...fields, ...state.config.common_scoring];
    }

    els.scoreForm.innerHTML = fields.map(field => generateFieldHTML(field)).join('');
}

function generateFieldHTML(field) {
    const id = field.id;
    const label = field.label;

    let inputHtml = '';

    switch(field.type) {
        case 'boolean':
             inputHtml = `
                <div style="display:flex; align-items:center; height: 3rem;">
                    <input type="checkbox" name="${id}" id="f_${id}" value="true" style="margin-right:1rem; transform: scale(1.5);">
                    <label for="f_${id}" style="margin:0; font-weight:normal">Yes / Pass</label>
                </div>`;
             break;

        case 'number':
             inputHtml = `<input type="number" name="${id}" id="f_${id}" placeholder="0">`;
             break;

        case 'range':
             inputHtml = `
                <input type="range" name="${id}" id="f_${id}" min="${field.min}" max="${field.max}" value="${Math.ceil(field.max/2)}" oninput="document.getElementById('disp_${id}').innerText = this.value">
                <div class="range-display">Value: <span id="disp_${id}">${Math.ceil(field.max/2)}</span></div>
             `;
             break;

         case 'time_mm_ss':
             inputHtml = `
                <div style="display:flex; gap:0.5rem">
                    <input type="number" id="f_${id}_mm" placeholder="MM" style="width:45%" min="0" onchange="app.combineTime('${id}')">
                    <span style="align-self:center; font-weight:bold">:</span>
                    <input type="number" id="f_${id}_ss" placeholder="SS" style="width:45%" min="0" max="59" onchange="app.combineTime('${id}')">
                    <input type="hidden" name="${id}" id="f_${id}_val">
                </div>
             `;
             break;

         case 'select':
             inputHtml = `
                <select name="${id}" id="f_${id}">
                    ${field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
             `;
             break;
    }

    return `<div class="form-group card">
        <label>${label}</label>
        ${inputHtml}
    </div>`;
}

function combineTime(fieldId) {
    const mm = document.getElementById(`f_${fieldId}_mm`).value || '00';
    const ss = document.getElementById(`f_${fieldId}_ss`).value || '00';
    // Pad with leading zeros
    const mStr = mm.toString().padStart(2, '0');
    const sStr = ss.toString().padStart(2, '0');
    document.getElementById(`f_${fieldId}_val`).value = `${mStr}:${sStr}`;
}

function generateUUID() {
    if (crypto.randomUUID) {
        try {
            return crypto.randomUUID();
        } catch (e) {
            console.warn('crypto.randomUUID failed, falling back');
        }
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

    // Manual Extraction to handle booleans and special logic
    // We basically need to iterate over the inputs we know exist

    let allFields = [...state.currentStation.fields];
    if (state.currentStation.type === 'patrol' && state.config.common_scoring) {
        allFields = [...allFields, ...state.config.common_scoring];
    }

    for (const field of allFields) {
        if (field.type === 'boolean') {
             scorePayload[field.id] = document.getElementById(`f_${field.id}`).checked;
        } else if (field.type === 'time_mm_ss') {
             // ensure composite value is set
             combineTime(field.id);
             scorePayload[field.id] = document.getElementById(`f_${field.id}_val`).value || "00:00";
        } else {
             scorePayload[field.id] = formData.get(field.id);
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

    // Save Judge Info
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
