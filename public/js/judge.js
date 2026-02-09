import { SyncManager } from './sync-manager.js';
import { generateFieldHTML } from './core/ui.js';
import { formatGameTitle, getEventStatus, generateUUID, getOrdinalSuffix } from './core/schema.js';

const syncManager = new SyncManager();

const state = {
    config: null,
    entities: [],
    currentStation: null,
    currentEntity: null,
    isOnline: navigator.onLine,
    viewMode: 'patrol',
    drafts: {},
    // Bracket State
    bracketMode: 'main', // 'main' or 'consolation'
    bracketData: JSON.parse(localStorage.getItem('camporee_bracket_data') || '{}'),
    currentRoundIdx: 0,
    currentHeatId: null
};

// UI References
const els = {
    status: document.getElementById('status-indicator'),
    unsyncedCount: document.getElementById('unsynced-count'),
    backBtn: document.getElementById('header-back-btn'),
    profileBtn: document.getElementById('judge-profile-btn'),
    stationList: document.getElementById('station-list'),
    entityList: document.getElementById('entity-list'),
    entitySearch: document.getElementById('entity-search'),
    entityHeader: document.getElementById('entity-header'),
    scoreForm: document.getElementById('score-form'),
    scoringTitle: document.getElementById('scoring-title'),
    scoringTeam: document.getElementById('scoring-team'),
    judgeName: document.getElementById('judge-name'),
    judgeEmail: document.getElementById('judge-email'),
    judgeUnit: document.getElementById('judge-unit'),
    // Bracket Refs
    lobbyList: document.getElementById('bracket-lobby-list'),
    roundPool: document.getElementById('bracket-round-pool'),
    heatList: document.getElementById('bracket-heat-list'),
    heatContainer: document.getElementById('heat-scoring-container')
};

const views = {
    home: document.getElementById('view-home'),
    entity: document.getElementById('view-entity'),
    scoring: document.getElementById('view-scoring'),
    // Bracket Views
    bracketLobby: document.getElementById('view-bracket-lobby'),
    bracketRound: document.getElementById('view-bracket-round'),
    bracketHeat: document.getElementById('view-bracket-heat')
};

// --- Initialization ---

async function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('judge_email')) {
        const j = {
            name: params.get('judge_name') || '',
            email: params.get('judge_email') || '',
            unit: params.get('judge_unit') || ''
        };
        localStorage.setItem('judge_info', JSON.stringify(j));
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    loadLocalData();
    loadJudgeInfo();
    injectModeTabs();

    if (state.isOnline) await refreshData();

    renderStationList();
    updateSyncCounts();

    els.status.addEventListener('click', handleSync);
    els.entitySearch.addEventListener('input', (e) => renderEntityList(e.target.value));
    document.getElementById('btn-submit').addEventListener('click', submitScore);

    navigate('home');
}

// --- DATA MANAGEMENT ---

function resetAppData() {
    if(!confirm("⚠️ RESET WARNING ⚠️\n\nThis will wipe all local tournament brackets and draft scores.\nIt effectively 'Fresh Installs' the app.\n\nData already sent to the server is safe.\n\nProceed?")) return;

    // 1. Preserve Judge Identity
    const judge = localStorage.getItem('judge_info');

    // 2. Nuke everything else
    localStorage.clear();

    // 3. Restore Judge Identity
    if(judge) localStorage.setItem('judge_info', judge);

    // 4. Reload to fetch fresh server state
    window.location.reload();
}

// --- Navigation ---

function navigate(viewName) {
    state.view = viewName;
    Object.values(views).forEach(el => {
        if(el) el.classList.add('hidden');
    });
    if(views[viewName]) views[viewName].classList.remove('hidden');

    const isHome = viewName === 'home';
    els.backBtn.classList.toggle('hidden', isHome);
    els.status.classList.toggle('hidden', !isHome);
    els.profileBtn.classList.toggle('hidden', !isHome);

    if (viewName !== 'scoring') {
        const header = document.querySelector('header');
        header.style.backgroundColor = '';
        header.style.color = '';
        const sub = document.getElementById('header-subtitle');
        if(sub) sub.style.display = 'none';
    }

    if (isHome) {
        document.getElementById('header-title').textContent = 'Camporee Collator';
        const syncLine = document.getElementById('header-sync-line');
        if(syncLine) syncLine.style.display = 'block';
        document.body.style.paddingBottom = '0';
    } else {
        const syncLine = document.getElementById('header-sync-line');
        if(syncLine) syncLine.style.display = 'none';
    }
    window.scrollTo(0,0);
}

function handleBack() {
    // 1. Heat -> Round
    if (state.view === 'bracketHeat') {
        renderBracketRound();
        navigate('bracketRound');
        return;
    }

    // 2. Round Navigation (Deep -> Shallow -> Lobby)
    if (state.view === 'bracketRound') {
        // If we are deep in the tournament (Round 2, 3, etc.), just go back one round.
        if (state.currentRoundIdx > 0) {
            state.currentRoundIdx--;
            renderBracketRound();
            return; // STOP here. Do not navigate away.
        }

        // Move confirmation to Round 1 (Exit from the manager back to the lobby)
        if (confirm("Exit Bracket Manager?")) {
            renderBracketLobby();
            navigate('bracketLobby');
        }
        return;
    }

    // 3. Lobby -> Home (Direct Exit)
    if (state.view === 'bracketLobby') {
        navigate('home');
        if (state.isOnline) refreshData();
        else renderStationList();
        return;
    }

    // 4. Default Handling (Scoring screens, etc.)
    const history = state.navHistory || [];
    if (history.length > 0) {
        const prev = history.pop(); // Remove current
        const target = history.pop(); // Get previous
        if (target) navigate(target);
        else navigate('home');
    } else {
        navigate('home');
    }
}


// --- Mode Tabs & Station Selection ---

function injectModeTabs() {
    const stationList = document.getElementById('station-list');
    if (!stationList) return;
    const container = stationList.parentNode;
    const h3 = stationList.previousElementSibling;

    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = "display: flex; gap: 8px; margin-bottom: 1rem; align-items: stretch;";

    tabContainer.innerHTML = `
        <div style="flex: 1.25">
            <input type="radio" name="vmode" id="mode-patrol" style="display:none" ${state.viewMode === 'patrol' ? 'checked' : ''}>
            <label class="btn px-1 ${state.viewMode === 'patrol' ? '' : 'btn-outline'}" id="btn-mode-patrol" for="mode-patrol" onclick="app.setMode('patrol')" style="height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; margin-bottom: 0;">Patrol Events</label>
        </div>
        <div style="flex: 1.25">
            <input type="radio" name="vmode" id="mode-troop" style="display:none" ${state.viewMode === 'troop' ? 'checked' : ''}>
            <label class="btn px-1 ${state.viewMode === 'troop' ? '' : 'btn-outline'}" id="btn-mode-troop" for="mode-troop" onclick="app.setMode('troop')" style="height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; margin-bottom: 0;">Troop Events</label>
        </div>
        <div style="flex: 0.75">
            <button class="btn btn-outline px-1" id="btn-reload-data" onclick="app.refreshData()" style="height: 100%; width: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; margin-bottom: 0;">Reload</button>
        </div>
    `;
    container.insertBefore(tabContainer, h3 || stationList);
}

function setMode(mode) {
    state.viewMode = mode;
    const pBtn = document.getElementById('btn-mode-patrol');
    const tBtn = document.getElementById('btn-mode-troop');
    if (pBtn && tBtn) {
        if (mode === 'patrol') {
            pBtn.classList.remove('btn-outline');
            tBtn.classList.add('btn-outline');
        } else {
            pBtn.classList.add('btn-outline');
            tBtn.classList.remove('btn-outline');
        }
    }
    renderStationList();
}

function selectStation(id) {
    state.currentStation = state.config.stations.find(s => s.id === id);
    if(!state.currentStation) return;

    if (state.currentStation.bracketMode) {
        const bData = initBracketState(id);
        if (bData.active && bData.rounds.length > 0) {
            state.currentRoundIdx = bData.rounds.length - 1;
            renderBracketRound();
            navigate('bracketRound');
        } else {
            renderBracketLobby();
            navigate('bracketLobby');
        }
    } else {
        renderEntityList();
        navigate('entity');
    }
}

// --- HELPER: Smart Name Formatting ---
function formatEntityLabel(e) {
    if (!e) return '';
    // Normalize
    const tNum = String(e.troop_number || '').trim();
    const name = String(e.name || '').trim();
    const type = e.type || 'patrol';

    // Regex to detect redundant names (e.g. "13", "T13", "Tr 13", "Troop 13")
    const isRedundant = new RegExp(`^(t|tr|troop)?\\s*${tNum}$`, 'i').test(name);

    if (type === 'troop') {
        // Troop Mode: "Troop 13" or "Troop 13 - The Avengers"
        const base = `Troop ${tNum}`;
        if (isRedundant || !name) return base;
        return `${base} - ${name}`;
    } else {
        // Patrol Mode: "T101" or "T101 Flaming Arrows"
        const base = `T${tNum}`;
        if (isRedundant || !name) return base;
        return `${base} ${name}`;
    }
}

// --- Standard Entity & Form Logic ---

function renderStationList() {
    if (!state.config || !state.config.stations) {
        els.stationList.innerHTML = `<div class="p-4 text-center text-muted">Loading games...</div>`;
        return;
    }
    const filteredStations = state.config.stations.filter(s => !s.type || s.type === state.viewMode);
    if (filteredStations.length === 0) {
        els.stationList.innerHTML = `<div class="alert alert-info text-center">No ${state.viewMode} games found.</div>`;
        return;
    }
    els.stationList.innerHTML = filteredStations.map(s => {
        // --- Status Detection ---
        const status = getEventStatus(s.id, state.bracketData);
        let statusHtml = '';
        if (status === 'results') {
            statusHtml = '<span class="badge bg-success" style="font-size:0.75rem;">Results</span>';
        } else if (status === 'active') {
            statusHtml = '<span class="badge bg-primary" style="font-size:0.75rem;">Resume</span>';
        }

        return `
        <button class="btn btn-outline-dark w-100 mb-2 text-start p-3 shadow-sm d-flex justify-content-between align-items-center" onclick="app.selectStation('${s.id}')">
            <div>
                <div class="fw-bold">${formatGameTitle(s)}</div>
                <small class="text-muted text-uppercase" style="font-size:0.75rem;">${s.type || (s.bracketMode ? 'Tournament' : 'General')}</small>
            </div>
            ${statusHtml}
        </button>`;
    }).join('');
}

function renderEntityList(filter = '') {
    if (!state.currentStation) return;
    const requiredType = state.currentStation.type || state.viewMode;
    const term = filter.toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('camporee_drafts') || '{}');
    const queue = syncManager.getQueue();
    const scoredIds = new Set(queue.filter(s => s.game_id === state.currentStation.id).map(s => s.entity_id));

    const filtered = state.entities.filter(e =>
        e.type === requiredType && (e.name.toLowerCase().includes(term) || e.troop_number.includes(term))
    );

    filtered.sort((a, b) => {
        const doneA = scoredIds.has(a.id);
        const doneB = scoredIds.has(b.id);
        if (doneA !== doneB) return doneA ? 1 : -1;
        return (parseInt(a.troop_number)||0) - (parseInt(b.troop_number)||0);
    });

    els.entityHeader.textContent = `Select ${requiredType === 'patrol' ? 'Patrol' : 'Troop'}`;
    const addButton = `<button class="list-group-item list-group-item-action p-3 text-center text-primary fw-bold" onclick="app.promptNewEntity('${requiredType}')" style="border: 2px dashed var(--bs-primary); margin-bottom: 8px;"><span style="font-size: 1.2rem;">➕ Register New ${requiredType}</span></button>`;

    els.entityList.innerHTML = addButton + filtered.map(e => {
        const isDone = scoredIds.has(e.id);
        const draftKey = `${state.currentStation.id}_${e.id}`;
        const hasDraft = !!drafts[draftKey];
        const displayLabel = formatEntityLabel(e); // USE FORMATTER

        return `
            <div class="list-group-item list-group-item-action p-3 d-flex justify-content-between align-items-center"
                onclick="app.selectEntity('${e.id}')"
                style="cursor:pointer; border-left: 5px solid ${isDone ? '#adb5bd' : (hasDraft ? '#ffc107' : '#0d6efd')}; margin-bottom: 6px; ${isDone ? 'background-color: #f1f3f5; opacity: 0.6;' : 'background-color: #fff;'}">
                <div class="fw-bold text-truncate" style="max-width: 85%; font-size: 1.05rem;">${isDone ? `<del class="text-muted">${displayLabel}</del>` : displayLabel}</div>
                <div>${hasDraft && !isDone ? '<span class="badge bg-warning text-dark me-1">Draft</span>' : ''}${isDone ? '<span class="badge bg-light text-dark border">Done</span>' : ''}</div>
            </div>`;
    }).join('');
}

function selectEntity(id) {
    state.currentEntity = state.entities.find(e => e.id === id);
    const queue = syncManager.getQueue();
    const existingScore = queue.find(s => s.game_id === state.currentStation.id && s.entity_id === id);
    renderForm(existingScore);
    navigate('scoring');
}

function renderForm(existingScore = null) {
    const s = state.currentStation;
    const e = state.currentEntity;
    const btnSubmit = document.getElementById('btn-submit');
    const header = document.querySelector('header');

    let draftData = null;
    if (!existingScore) {
        const drafts = JSON.parse(localStorage.getItem('camporee_drafts') || '{}');
        draftData = drafts[`${s.id}_${e.id}`];
    }

    if (existingScore) {
        document.getElementById('header-title').textContent = `EDIT: ${formatGameTitle(s)}`;
        header.style.backgroundColor = '#f39c12';
        header.style.color = '#fff';
        btnSubmit.innerText = 'Re-Submit Score';
        btnSubmit.classList.add('btn-warning');
    } else {
        document.getElementById('header-title').textContent = formatGameTitle(s);
        header.style.backgroundColor = '';
        header.style.color = '';
        btnSubmit.innerText = 'Submit Score';
        btnSubmit.classList.remove('btn-warning');
        btnSubmit.classList.add('btn-secondary');
    }

    document.getElementById('header-subtitle').textContent = formatEntityLabel(e); // USE FORMATTER
    document.getElementById('header-subtitle').style.display = 'block';

    els.scoreForm.innerHTML = '';
    const fields = [...(s.fields||[]), ...(state.config.common_scoring||[])].filter(f => f.audience === 'judge');

    if (fields.length > 0) {
        fields.forEach(f => {
            let val = null;
            if (existingScore) val = existingScore.score_payload[f.id];
            else if (draftData) val = draftData[f.id];
            els.scoreForm.innerHTML += generateFieldHTML(f, val);
        });
    }

    els.scoreForm.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('input', () => saveDraft());
    });
}

function saveDraft() {
    if (!state.currentStation || !state.currentEntity) return;
    const draftKey = `${state.currentStation.id}_${state.currentEntity.id}`;
    const payload = {};
    const allFields = [...(state.currentStation.fields||[]), ...(state.config.common_scoring||[])];
    for(const f of allFields) {
        const el = document.getElementById(`f_${f.id}`);
        if (f.type === 'timed' || f.type === 'stopwatch') {
            const mm = document.getElementById(`f_${f.id}_mm`)?.value || '';
            const ss = document.getElementById(`f_${f.id}_ss`)?.value || '';
            if (mm || ss) payload[f.id] = `${mm.padStart(2,'0')}:${ss.padStart(2,'0')}`;
        } else if (f.type === 'boolean') payload[f.id] = el?.checked;
        else if (el) payload[f.id] = el.value;
    }
    const drafts = JSON.parse(localStorage.getItem('camporee_drafts') || '{}');
    drafts[draftKey] = payload;
    localStorage.setItem('camporee_drafts', JSON.stringify(drafts));
}

async function submitScore(e) {
    if (e && e.preventDefault) e.preventDefault();
    if(!state.currentStation || !state.currentEntity) return;
    const payload = {};
    const fields = [...(state.currentStation.fields||[]), ...(state.config.common_scoring||[])];
    fields.forEach(f => {
        const el = document.getElementById(`f_${f.id}`);
        if(f.type === 'boolean') payload[f.id] = el?.checked;
        else if(f.type === 'timed' || f.type === 'stopwatch') {
            combineTime(f.id);
            payload[f.id] = document.getElementById(`f_${f.id}_val`).value;
        }
        else if(el) payload[f.id] = el.value;
    });
    const queue = syncManager.getQueue();
    const existing = queue.find(s => s.game_id === state.currentStation.id && s.entity_id === state.currentEntity.id);
    const packet = {
        uuid: existing ? existing.uuid : generateUUID(),
        game_id: state.currentStation.id,
        entity_id: state.currentEntity.id,
        score_payload: payload,
        timestamp: Date.now(),
        judge_name: els.judgeName.value,
        judge_email: els.judgeEmail.value,
        judge_unit: els.judgeUnit.value
    };
    if(packet.judge_email) localStorage.setItem('judge_info', JSON.stringify({name:packet.judge_name, email:packet.judge_email, unit:packet.judge_unit}));
    syncManager.addToQueue(packet);
    const draftKey = `${state.currentStation.id}_${state.currentEntity.id}`;
    const drafts = JSON.parse(localStorage.getItem('camporee_drafts') || '{}');
    delete drafts[draftKey];
    localStorage.setItem('camporee_drafts', JSON.stringify(drafts));

    try {
        if(state.isOnline) {
            await syncManager.sync();
        }
        updateSyncCounts();
        renderEntityList();
        alert('Score Saved!');
        navigate('entity');
    } catch (err) {
        console.error("Sync Error:", err);
        updateSyncCounts();
        renderEntityList();
        alert("⚠️ Score Saved Locally\n\nHowever, it failed to sync to the server:\n" + err.message);
        navigate('entity');
    }
}

// --- STOPWATCH LOGIC ---
let activeTimerId = null;
let activeTimerInterval = null;
let activeTimerStartedAt = 0;
let activeTimerOffset = 0;
let isPaused = false;

function startStopwatch(id) {
    if (activeTimerId && activeTimerId !== id) {
        if(!confirm("Another timer is running. Stop it and start this one?")) return;
        stopStopwatch();
    }
    const dock = document.getElementById('stopwatch-dock');
    const btnPause = document.getElementById('dock-btn-pause');
    const btnReset = document.getElementById('dock-btn-reset');
    const btnStop = document.getElementById('dock-btn-stop');

    if (activeTimerId !== id) {
        activeTimerId = id;
        activeTimerOffset = 0;
        isPaused = false;
        activeTimerStartedAt = Date.now();
        document.getElementById(`f_${id}_mm`).value = '';
        document.getElementById(`f_${id}_ss`).value = '';
    } else if (isPaused) {
        isPaused = false;
        activeTimerStartedAt = Date.now();
    }
    dock.classList.add('active');
    document.body.style.paddingBottom = '100px';
    btnPause.innerText = "PAUSE";
    btnPause.classList.remove('btn-success');
    btnPause.classList.add('btn-warning');
    btnStop.onclick = () => stopStopwatch();
    btnPause.onclick = () => {
        if (isPaused) {
            isPaused = false;
            activeTimerStartedAt = Date.now();
            btnPause.innerText = "PAUSE";
            btnPause.classList.remove('btn-success');
            btnPause.classList.add('btn-warning');
            activeTimerInterval = setInterval(tick, 100);
        } else {
            isPaused = true;
            clearInterval(activeTimerInterval);
            activeTimerOffset += (Date.now() - activeTimerStartedAt);
            btnPause.innerText = "RESUME";
            btnPause.classList.remove('btn-warning');
            btnPause.classList.add('btn-success');
        }
    };
    btnReset.onclick = () => {
        if(confirm("Reset timer to 00:00?")) {
            activeTimerOffset = 0;
            activeTimerStartedAt = Date.now();
            if(isPaused) document.getElementById('dock-display').innerText = "00:00";
        }
    };
    if (activeTimerInterval) clearInterval(activeTimerInterval);
    activeTimerInterval = setInterval(tick, 100);
}

function tick() {
    if (isPaused) return;
    const now = Date.now();
    const totalMs = (now - activeTimerStartedAt) + activeTimerOffset;
    const totSec = Math.floor(totalMs / 1000);
    const m = Math.floor(totSec / 60);
    const s = totSec % 60;
    document.getElementById('dock-display').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function stopStopwatch() {
    if(!activeTimerId) return;
    if (!isPaused) activeTimerOffset += (Date.now() - activeTimerStartedAt);
    const finalSec = Math.floor(activeTimerOffset / 1000);
    const m = Math.floor(finalSec / 60);
    const s = finalSec % 60;
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
    isPaused = false;
    document.getElementById('stopwatch-dock').classList.remove('active');
    document.body.style.paddingBottom = '0';
    const mmInput = document.getElementById(`f_${activeTimerId}_mm`);
    const ssInput = document.getElementById(`f_${activeTimerId}_ss`);
    if(mmInput && ssInput) {
        mmInput.value = m;
        ssInput.value = s;
        combineTime(activeTimerId);
    }
    activeTimerId = null;
}

function combineTime(id) {
    const m = document.getElementById(`f_${id}_mm`).value || '00';
    const s = document.getElementById(`f_${id}_ss`).value || '00';
    document.getElementById(`f_${id}_val`).value = `${m.padStart(2,'0')}:${s.padStart(2,'0')}`;
    saveDraft();
}

// --- BRACKET LOGIC (UPDATED) ---

function initBracketState(gameId) {
    if (!state.bracketData[gameId]) {
        state.bracketData[gameId] = { rounds: [], active: false };
    }
    return state.bracketData[gameId];
}

function saveBracketState() {
    localStorage.setItem('camporee_bracket_data', JSON.stringify(state.bracketData));

    // Sync to Server
    if (state.currentStation) {
        const gameId = state.currentStation.id;
        const bracket = state.bracketData[gameId];
        if (bracket) {
            const packet = {
                type: 'bracket_sync',
                uuid: `bracket_${gameId}`, // Unique per game to allow overwriting unsynced updates
                game_id: gameId,
                bracket_data: JSON.parse(JSON.stringify(bracket)), // Deep clone for safety
                timestamp: Date.now(),
                // Metadata for SyncManager's deduplication logic
                entity_id: 'SYSTEM_BRACKET'
            };
            syncManager.addToQueue(packet);
        }
    }
}

function getBracketRoundList(gameId) {
    const bracket = state.bracketData[gameId];
    if (!bracket) return [];
    if (state.bracketMode === 'consolation') {
        if (!bracket.consolation_rounds) bracket.consolation_rounds = [{ name: "Consolation Rd 1", pool: [], heats: [] }];
        return bracket.consolation_rounds;
    }
    return bracket.rounds || [];
}

// 1. LOBBY
function renderBracketLobby() {
    const s = state.currentStation;

    // Update Header
    document.getElementById('header-title').textContent = `${s.name} (Lobby)`;

    // 1. Detect if Event is already running
    const bracket = state.bracketData[s.id];
    const activeIds = new Set();
    let isRunning = false;

    if (bracket && bracket.rounds.length > 0) {
        isRunning = true;
        // Collect all teams currently in the active round (Pool + Heats)
        const round = bracket.rounds[state.currentRoundIdx];
        if (round) {
            round.pool.forEach(id => activeIds.add(id));
            round.heats.forEach(h => h.teams.forEach(id => activeIds.add(id)));
        }
    }

    // 2. Render Team List
    const requiredType = s.type || state.viewMode;
    const entities = state.entities.filter(e => e.type === requiredType).sort((a,b) => (parseInt(a.troop_number)||0) - (parseInt(b.troop_number)||0));

    els.lobbyList.innerHTML = entities.map(e => {
        const isChecked = activeIds.has(e.id) ? 'checked' : '';
        return `
        <label class="list-group-item d-flex gap-3 align-items-center py-3">
            <input class="form-check-input flex-shrink-0 bracket-lobby-checkbox" type="checkbox" value="${e.id}" ${isChecked} style="transform: scale(1.3);">
            <div>
                <div class="fw-bold" style="font-size: 1.1rem;">${formatEntityLabel(e)}</div>
                <div class="small text-muted">ID: #${e.id}</div>
            </div>
        </label>`;
    }).join('');

    // 3. Dynamic Button Logic
    const btnStart = document.querySelector('#view-bracket-lobby .btn-success');

    if (btnStart) {
        if (!isRunning) {
            // Case A: Fresh Start
            btnStart.textContent = "Bracket Manager";
            btnStart.classList.remove('btn-outline-primary');
            btnStart.classList.add('btn-success');
        } else {
            // Case B: Running Event (Dynamic Labels)

            // Helper function to check state
            const updateButtonState = () => {
                const checkedInputs = document.querySelectorAll('.bracket-lobby-checkbox:checked');
                const checkedIds = Array.from(checkedInputs).map(cb => cb.value);

                // Check if any CHECKED team is NOT in the ACTIVE set (i.e. New Addition)
                const hasNewTeams = checkedIds.some(id => !activeIds.has(id));

                if (hasNewTeams) {
                    btnStart.textContent = "Update Bracket";
                    btnStart.classList.remove('btn-outline-primary');
                    btnStart.classList.add('btn-success');
                } else {
                    btnStart.textContent = "Return to Bracket";
                    btnStart.classList.remove('btn-success');
                    btnStart.classList.add('btn-outline-primary'); // Neutral color
                }
            };

            // Run once immediately
            updateButtonState();

            // Attach listeners to all checkboxes
            document.querySelectorAll('.bracket-lobby-checkbox').forEach(cb => {
                cb.addEventListener('change', updateButtonState);
            });

            // Hook into "Select All" and "Clear" buttons
            // We overwrite the onclick to ensure we trigger the update check
            const btnSelectAll = document.querySelector('#view-bracket-lobby button[onclick*="bracketSelectAll(true)"]');
            const btnClear = document.querySelector('#view-bracket-lobby button[onclick*="bracketSelectAll(false)"]');

            if (btnSelectAll) {
                btnSelectAll.onclick = () => { app.bracketSelectAll(true); updateButtonState(); };
            }
            if (btnClear) {
                btnClear.onclick = () => { app.bracketSelectAll(false); updateButtonState(); };
            }
        }
    }
}

function bracketSelectAll(checked) {
    els.lobbyList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checked);
}

function bracketStartEvent() {
    const s = state.currentStation;
    const checked = [...document.querySelectorAll('#bracket-lobby-list input:checked')].map(i => i.value);

    if (checked.length < 2) return alert("Select at least 2 teams.");

    let bracket = state.bracketData[s.id];
    let roundList = getBracketRoundList(s.id);

    if (roundList.length === 0) {
        // CASE A: NEW EVENT (or New Mode)
        const newRound = { name: (state.bracketMode === 'consolation' ? 'Consolation ' : '') + "Round 1", pool: checked, heats: [] };
        if (state.bracketMode === 'consolation') {
            bracket.consolation_rounds = [newRound];
        } else {
            bracket.rounds = [newRound];
        }
        state.currentRoundIdx = 0;
    } else {
        // CASE B: LATE ADD (Update Existing)
        const round = roundList[state.currentRoundIdx];

        // 1. Identify who is already here
        const existing = new Set([...round.pool]);
        round.heats.forEach(h => h.teams.forEach(t => existing.add(t)));

        // 2. Find the "New" folks
        const newTeams = checked.filter(id => !existing.has(id));

        if (newTeams.length > 0) {
            // 3. Add them to the pool
            round.pool.push(...newTeams);
            alert(`✅ Added ${newTeams.length} new team(s) to ${round.name}.`);
        } else {
            // No new teams found. (User might have just clicked "Update" without changing anything)
            // We just proceed.
        }
    }

    saveBracketState();
    renderBracketRound();
    navigate('bracketRound');
}

function bracketDirectEntry() {
    const checked = [...document.querySelectorAll('#bracket-lobby-list input:checked')].map(i => i.value);

    if (checked.length < 1) return alert("Select at least 1 team to enter records for.");

    state.currentStandings = checked.map(eid => ({
        id: eid,
        rank: null,
        note: 'Direct Entry',
        roundIdx: 0
    }));

    renderPodiumTable();
    togglePodiumModal(true);
}

// 2. ROUND MANAGER
function renderBracketRound() {
    const gameId = state.currentStation.id;
    const bracket = state.bracketData[gameId];

    // SELECT DATA SOURCE BASED ON MODE
    let roundList = getBracketRoundList(gameId);
    if (state.bracketMode === 'consolation') {
        document.getElementById('header-title').textContent = `${state.currentStation.name} (2nd Try)`;
    } else {
        document.getElementById('header-title').textContent = state.currentStation.name;
    }

    // Safety check
    if (!roundList[state.currentRoundIdx]) {
        state.currentRoundIdx = 0;
    }
    const round = roundList[state.currentRoundIdx];

    // --- ALERT SYSTEM (Unchanged) ---
    const alertBox = document.getElementById('bracket-alerts');
    if (alertBox) {
        const warnings = [];
        for (let i = 0; i < state.currentRoundIdx; i++) {
            const r = roundList[i];
            let pendingCount = r.pool.length;
            r.heats.forEach(h => { if (!h.complete) pendingCount += h.teams.length; });
            if (pendingCount > 0) warnings.push(`⚠️ <strong>${r.name}:</strong> ${pendingCount} teams left to compete.`);
        }
        if (warnings.length > 0) {
            alertBox.innerHTML = `<div class="alert alert-warning mb-0 rounded-0 text-center border-bottom border-warning shadow-sm" style="font-size: 0.9rem;">${warnings.join('<br>')}</div>`;
            alertBox.classList.remove('hidden');
        } else {
            alertBox.innerHTML = '';
            alertBox.classList.add('hidden');
        }
    }

    // Header Updates
    document.getElementById('bracket-round-title').innerText = round.name;
    document.getElementById('bracket-pool-count').innerText = round.pool.length;

    const label = state.currentStation.match_label || 'Match';
    const createBtn = document.getElementById('btn-bracket-create-heat');
    if (createBtn) createBtn.innerText = `+ New ${label}`;

    const instructions = document.getElementById('bracket-create-instructions');
    if (instructions) {
        instructions.innerHTML = `Select teams below to create a ${label.toLowerCase()}. <span class="badge bg-secondary rounded-pill" id="bracket-pool-count">${round.pool.length}</span> remaining.`;
    }

    const container = document.getElementById('bracket-unified-list');
    let html = '';

    // SECTION A: The Pool (Unchanged)
    if (round.pool.length > 0) {
        html += `<h6 class="text-uppercase text-muted fw-bold small mt-2 mb-2 ps-1">Holding Pool</h6>`;
        html += '<div class="list-group mb-4 shadow-sm">';
        html += round.pool.map(eid => {
            const e = state.entities.find(x => x.id === eid);
            const label = formatEntityLabel(e);
            return `
            <label class="list-group-item d-flex justify-content-between align-items-center p-3">
                <div class="d-flex align-items-center gap-3 overflow-hidden">
                    <input class="form-check-input form-check-pool flex-shrink-0" type="checkbox" value="${eid}" style="transform: scale(1.3);">
                    <div class="fw-bold text-truncate">${label}</div>
                </div>
                <div class="d-flex gap-2">
                     <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="event.preventDefault(); app.bracketScratchTeam('${eid}')" style="font-size: 0.8rem;">Scratch</button>
                     <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="event.preventDefault(); app.bracketGrantBye('${eid}')" style="font-size: 0.8rem;">Bye</button>
                </div>
            </label>`;
        }).join('');
        html += '</div>';
    } else {
        if (round.heats.length > 0) {
            const label = state.currentStation.match_label || 'Match';
            html += `<div class="alert alert-light text-center text-muted border border-dashed mb-4">All teams assigned to ${label.toLowerCase()}s.</div>`;
        } else {
            if (state.bracketMode === 'consolation') html += `<div class="alert alert-light text-center text-muted border border-dashed mb-4">Waiting for teams to be eliminated from Main Event.</div>`;
            else html += `<div class="alert alert-light text-center text-muted border border-dashed mb-4">No teams in this round.</div>`;
        }
    }

    // SECTION B: The Heats (Updated with Final Round Logic)
    if (round.heats.length > 0) {
        const label = state.currentStation.match_label || 'Match';
        html += `<h6 class="text-uppercase text-muted fw-bold small mb-2 ps-1 border-top pt-3">Active ${label}s</h6>`;
        const sortedHeats = [...round.heats].sort((a,b) => (a.complete === b.complete) ? 0 : a.complete ? 1 : -1);

        html += sortedHeats.map((heat) => {
            const originalIdx = round.heats.findIndex(h => h.id === heat.id);
            const teamListHtml = heat.teams.map(eid => {
                const e = state.entities.find(x => x.id === eid);
                const label = formatEntityLabel(e);
                const res = heat.results[eid] || {};

                // --- NEW LOGIC START ---
                let actionHtml = '';
                let rowClass = '';

                if (round.isFinalRound) {
                    // FINAL ROUND: Show Rank Input
                    const rankVal = res.rank || '';
                    actionHtml = `
                        <div class="d-flex align-items-center" onclick="event.stopPropagation()">
                            <span class="small text-muted me-2">Rank:</span>
                            <input type="number" class="form-control form-control-sm text-center fw-bold border-secondary"
                                value="${rankVal}" min="1" max="99" style="width: 50px;"
                                onchange="app.bracketUpdateRank(${originalIdx}, '${eid}', this.value)" placeholder="#">
                        </div>`;
                    if (rankVal == 1) rowClass = 'bg-warning-subtle'; // Gold for 1st
                    else if (rankVal == 2) rowClass = 'bg-secondary-subtle'; // Silver
                    else if (rankVal == 3) rowClass = 'bg-danger-subtle'; // Bronze-ish
                } else {
                    // NORMAL ROUND: Show Advance Toggle
                    const advIcon = res.advance ? '⏩' : '⏹️';
                    const advClass = res.advance ? 'active' : '';
                    rowClass = res.advance ? 'bg-success-subtle' : '';
                    actionHtml = `<span class="advance-star ${advClass}" onclick="app.bracketToggleAdvance(${originalIdx}, '${eid}', event)" title="Toggle Advance" style="font-size: 1.4rem;">${advIcon}</span>`;
                }
                // --- NEW LOGIC END ---

                return `
                    <div class="d-flex justify-content-between align-items-center py-2 px-2 border-bottom ${rowClass}">
                        <span>${label}</span>
                        ${actionHtml}
                    </div>`;
            }).join('');

            let statusAction = '';
            let borderClass = '';

            if (heat.complete) {
                statusAction = '<span class="badge bg-success">Scored</span>';
                borderClass = 'border-success';
            } else {
                statusAction = `
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2 w-auto flex-grow-0 shadow-none" onclick="event.stopPropagation(); app.bracketQuickSave(${originalIdx})" title="Quick Save Results" style="line-height: 1.5;">
                        💾 Save
                    </button>`;
                borderClass = 'border-warning';
            }

            return `
            <div class="card shadow-sm mb-3 border-start border-4 ${borderClass}" onclick="app.bracketOpenHeat(${originalIdx})">
                <div class="card-header bg-white d-flex justify-content-between align-items-center py-2">
                    <span class="fw-bold text-truncate me-2">${heat.name}</span>
                    ${statusAction}
                </div>
                <div class="card-body p-0">
                    ${teamListHtml}
                </div>
            </div>`;
        }).join('');
    }

    container.innerHTML = html;

    // SECTION C: Footer (Unchanged)
    const footerOpts = document.getElementById('bracket-footer-options');
    const advanceBtn = document.getElementById('btn-bracket-advance');

    if (footerOpts && advanceBtn) {
        const isSingleHeatAndEmpty = (round.heats.length === 1 && round.pool.length === 0);
        const showOptions = isSingleHeatAndEmpty || (round.isFinalRound === true);

        if (showOptions) {
            if (round.isFinalRound === undefined) round.isFinalRound = true;
            const checkedAttr = round.isFinalRound ? 'checked' : '';
            footerOpts.innerHTML = `
                <div class="form-check form-switch d-flex justify-content-center align-items-center gap-2 p-2 bg-light rounded border">
                    <input class="form-check-input" type="checkbox" id="chk-is-final" ${checkedAttr} style="cursor:pointer; transform: scale(1.2);">
                    <label class="form-check-label fw-bold" for="chk-is-final" style="cursor:pointer;">This is the Final Round</label>
                </div>`;
            const updateButton = () => {
                const isFinal = document.getElementById('chk-is-final').checked;
                round.isFinalRound = isFinal;
                saveBracketState();
                renderBracketRound(); // Re-render to toggle inputs vs stars
            };
            document.getElementById('chk-is-final').onchange = updateButton;

            // --- FINAL REVIEW BUTTON LOGIC ---
            const allComplete = round.heats.length > 0 && round.heats.every(h => h.complete);
            if (round.isFinalRound && allComplete) {
                advanceBtn.innerHTML = "🏆 Review Results";
                advanceBtn.classList.remove('btn-success', 'btn-warning');
                advanceBtn.classList.add('btn-primary');
                advanceBtn.disabled = false;
                advanceBtn.onclick = () => app.openReviewModal();
            } else if (round.isFinalRound) {
                advanceBtn.innerHTML = "Finals in Progress...";
                advanceBtn.classList.remove('btn-success', 'btn-primary');
                advanceBtn.classList.add('btn-warning');
                advanceBtn.disabled = true;
                advanceBtn.onclick = () => app.bracketAdvanceRound();
            } else {
                advanceBtn.innerHTML = "NEXT ROUND >>";
                advanceBtn.classList.remove('btn-primary', 'btn-warning');
                advanceBtn.classList.add('btn-success');
                advanceBtn.disabled = false;
                advanceBtn.onclick = () => app.bracketAdvanceRound();
            }
        } else {
            footerOpts.innerHTML = '';
            advanceBtn.innerHTML = "NEXT ROUND >>";
            advanceBtn.classList.remove('btn-warning', 'btn-primary');
            advanceBtn.classList.add('btn-success');
            advanceBtn.disabled = false;
        }
    }
}


function bracketSwitchMode(mode) {
    state.bracketMode = mode;

    // Update Tab UI
    const tabMain = document.getElementById('tab-bracket-main');
    const tabCons = document.getElementById('tab-bracket-consolation');
    const header = document.querySelector('header');

    if (mode === 'main') {
        tabMain.classList.add('active', 'fw-bold', 'text-primary');
        tabMain.classList.remove('text-muted');
        tabCons.classList.remove('active', 'fw-bold', 'text-success');
        tabCons.classList.add('text-muted');

        // Reset Header to default Blue/Primary
        if (header) {
            header.style.backgroundColor = '';
            header.classList.remove('bg-success');
        }
    } else {
        tabCons.classList.add('active', 'fw-bold', 'text-success');
        tabCons.classList.remove('text-muted');
        tabMain.classList.remove('active', 'fw-bold', 'text-primary');
        tabMain.classList.add('text-muted');

        // Visual distinction for Consolation Mode (Teal/Green)
        if (header) {
            header.style.backgroundColor = '#20c997'; // Brand Teal-ish Green
        }
    }

    // Ensure data structure exists
    const gameId = state.currentStation.id;
    const bracket = state.bracketData[gameId];

    if (mode === 'consolation' && !bracket.consolation_rounds) {
        bracket.consolation_rounds = [{ name: "Consolation Rd 1", pool: [], heats: [] }];
    }

    // Reset to Round 1 of that mode
    state.currentRoundIdx = 0;

    renderBracketRound();
}

// 1. Unified Bye Logic
function bracketGrantBye(eid) {
    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];

    if (!round) return;

    // Find or Create a "Byes" heat
    let byeHeat = round.heats.find(h => h.name === "Byes");
    if (!byeHeat) {
        byeHeat = {
            id: generateUUID(),
            name: "Byes",
            teams: [],
            results: {},
            complete: true // Byes are auto-complete
        };
        round.heats.push(byeHeat);
    }

    // Move Team
    const poolIdx = round.pool.indexOf(eid);
    if (poolIdx > -1) round.pool.splice(poolIdx, 1);

    if (!byeHeat.teams.includes(eid)) {
        byeHeat.teams.push(eid);
    }
    byeHeat.results[eid] = { advance: true, notes: "Bye" }; // Auto-advance

    saveBracketState();
    renderBracketRound();
}

// 2. Scratch Logic
function bracketScratchTeam(eid) {
    if (!confirm("Scratch this team? They will be removed from the tournament.")) return;

    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];

    if (!round) return;

    // Find or Create a "Scratched" heat (to keep record)
    let scratchHeat = round.heats.find(h => h.name === "Scratched");
    if (!scratchHeat) {
        scratchHeat = {
            id: generateUUID(),
            name: "Scratched",
            teams: [],
            results: {},
            complete: true
        };
        round.heats.push(scratchHeat);
    }

    // Move Team
    const poolIdx = round.pool.indexOf(eid);
    if (poolIdx > -1) round.pool.splice(poolIdx, 1);

    if (!scratchHeat.teams.includes(eid)) {
        scratchHeat.teams.push(eid);
    }
    scratchHeat.results[eid] = { advance: false, notes: "Scratched" }; // Do NOT advance

    saveBracketState();
    renderBracketRound();
}

// 3. Quick Save Logic
async function bracketQuickSave(heatIdx) {
    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];
    const heat = round.heats[heatIdx];

    if (!heat) return;

    // Validate: At least one person must be marked (Advance or Not)
    // Actually, simply clicking save is enough to "Complete" it.

    heat.complete = true;

    // Generate UUIDs for results if missing
    heat.teams.forEach(eid => {
        if (!heat.results[eid]) heat.results[eid] = { advance: false };
        if (!heat.results[eid].uuid) heat.results[eid].uuid = generateUUID();
    });

    saveBracketState();
    updateSyncCounts();

    try {
        if (state.isOnline) {
            await syncManager.sync();
        }
        renderBracketRound();
    } catch (err) {
        console.error("Quick Sync failed:", err);
        renderBracketRound();
        alert("⚠️ Saved Locally. Sync failed: " + err.message);
    }
}

function bracketAdvanceRound() {
    const gameId = state.currentStation.id;
    const bracket = state.bracketData[gameId];

    // 1. Identify which list we are currently playing
    let currentRoundList;
    if (state.bracketMode === 'consolation') {
        currentRoundList = bracket.consolation_rounds;
    } else {
        currentRoundList = bracket.rounds;
    }

    const round = currentRoundList[state.currentRoundIdx];

    // 2. Calculate Winners, Losers, AND Pending
    const winners = [];
    const losers = [];
    const pending = [];

    // Check Heats
    round.heats.forEach(h => {
        if (!h.complete) {
            // Entire heat is pending
            pending.push(...h.teams);
        } else {
            // Heat is done, check individual teams
            h.teams.forEach(eid => {
                const res = h.results[eid];
                if (res && res.advance) {
                    winners.push(eid);
                } else if (res && (res.advance === false)) {
                    losers.push(eid);
                } else {
                    losers.push(eid);
                }
            });
        }
    });

    // Check Pool (Teams who haven't even raced yet!)
    pending.push(...round.pool);

    if (winners.length === 0) return alert("No teams marked to advance! Select winners using the arrows (⏩).");

    // 3. DETECT END GAME (Podium Logic)
    const finalCheckbox = document.getElementById('chk-is-final');
    const isExplicitFinal = finalCheckbox ? finalCheckbox.checked : false;
    const shouldFinish = (finalCheckbox && isExplicitFinal) || (!finalCheckbox && winners.length === 1);

    if (shouldFinish) {
        openReviewModal();
        return;
    }

    // 4. SILENT CONSOLATION LOGIC (Automatic)
    if (state.bracketMode === 'main' && losers.length > 0) {
        if (!bracket.consolation_rounds) {
            bracket.consolation_rounds = [{ name: "Consolation Rd 1", pool: [], heats: [] }];
        }
        const consRoundIdx = Math.max(0, bracket.consolation_rounds.length - 1);
        const consRound = bracket.consolation_rounds[consRoundIdx];

        const existing = new Set([...consRound.pool, ...consRound.heats.flatMap(h => h.teams)]);
        const newRecruits = losers.filter(id => !existing.has(id));

        if (newRecruits.length > 0) {
            consRound.pool.push(...newRecruits);
        }
    }

    // 5. SMART ADVANCE LOGIC
    const nextRoundIdx = state.currentRoundIdx + 1;
    const nextRoundExists = nextRoundIdx < currentRoundList.length;

    // Prepare Warning Message (if needed)
    let warningMsg = "";
    if (pending.length > 0) {
        const label = state.currentStation.match_label || 'Match';
        warningMsg = `⚠️ NOTE: ${pending.length} teams in this round are still pending (in pool or active ${label.toLowerCase()}s). You can advance now and come back for them later.`;
    }

    if (nextRoundExists) {
        // SCENARIO A: Next Round already exists.
        // We do NOT create a new one. We just update the existing one with any NEW winners.
        const nextRound = currentRoundList[nextRoundIdx];

        const existingPool = new Set([...nextRound.pool, ...nextRound.heats.flatMap(h => h.teams)]);
        const newAdvancers = winners.filter(id => !existingPool.has(id));

        if (newAdvancers.length > 0) {
            nextRound.pool.push(...newAdvancers);
            if (warningMsg) {
                alert(`✅ Added ${newAdvancers.length} new team(s) to ${nextRound.name}.\n\n` + warningMsg);
            }
        } else if (warningMsg) {
            // Just show the warning if we are navigating forward
            alert(warningMsg);
        }

    } else {
        // SCENARIO B: Create New Round
        // User requested: No confirmation dialog, just "OK" alert if there is a warning.

        if (warningMsg) {
            alert(warningMsg); // Pauses execution until OK is clicked, then proceeds.
        }

        const matchLabel = state.currentStation.match_label || 'Match';
        currentRoundList.push({
            name: `${state.bracketMode === 'consolation' ? 'Consolation ' : ''}Round ${nextRoundIdx + 1}`,
            pool: winners,
            heats: []
        });
    }

    // Finalize
    saveBracketState();
    state.currentRoundIdx++;
    renderBracketRound();
}

function bracketUpdateRank(heatIdx, eid, val) {
    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];
    const heat = round.heats[heatIdx];

    if (!heat.results[eid]) heat.results[eid] = {};

    // Save the rank (convert to number if possible)
    heat.results[eid].rank = val ? parseInt(val) : null;

    // Auto-mark as "Advance" if Rank is 1 (Winner) just for internal consistency,
    // though the Final Round logic ignores 'advance' flags now.
    heat.results[eid].advance = (heat.results[eid].rank === 1);

    saveBracketState();
}

function bracketToggleAdvance(heatIdx, eid, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];
    const heat = round.heats[heatIdx];
    if(!heat.results[eid]) heat.results[eid] = {};
    heat.results[eid].advance = !heat.results[eid].advance;
    saveBracketState();
    renderBracketRound();
}

function bracketCreateHeat() {
    const checked = Array.from(document.querySelectorAll('.form-check-pool:checked')).map(cb => cb.value);
    if (checked.length === 0) return alert("Select teams from pool first.");
    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];
    round.pool = round.pool.filter(id => !checked.includes(id));
    const heatNum = round.heats.length + 1;
    const label = state.currentStation.match_label || 'Match';
    round.heats.push({ id: Date.now(), name: `${label} ${heatNum}`, teams: checked, complete: false, results: {} });
    saveBracketState();
    renderBracketRound();
}

// Add this helper for the Heat View (Toggles UI only, save happens later)
function toggleHeatAdvance(el) {
    el.classList.toggle('active');
    // Swap icon based on state
    el.innerText = el.classList.contains('active') ? '⏩' : '⏹️';
}

function bracketOpenHeat(heatIdx) {
    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];
    const heat = round.heats[heatIdx];
    state.currentHeatId = heat.id;
    document.getElementById('heat-title').innerText = `${round.name} - ${heat.name}`;

    const label = state.currentStation.match_label || 'Match';
    const saveBtn = document.getElementById('btn-bracket-save-heat');
    if (saveBtn) saveBtn.innerText = `SAVE ${label.toUpperCase()}`;

    const fields = [...(state.currentStation.fields||[]), ...(state.config.common_scoring||[])].filter(f => f.audience === 'judge');

    const headerLabel = fields.length === 1 ? fields[0].label : "Results";
    document.getElementById('heat-header-score').innerText = headerLabel;

    els.heatContainer.innerHTML = heat.teams.map(eid => {
        const e = state.entities.find(x => x.id === eid);
        const label = formatEntityLabel(e);
        const result = heat.results[eid] || {};

        // Icon Logic: Match the Round View style
        const advIcon = result.advance ? '⏩' : '⏹️';
        const advClass = result.advance ? 'active' : '';

        const inputsHtml = fields.map(f => {
            const val = result[f.id] || '';

            if (f.type === 'timed' || f.type === 'stopwatch') {
                 let [mm, ss] = (val && val.includes(':')) ? val.split(':') : ['',''];
                 return `
                 <div class="input-group input-group-sm mb-1 justify-content-center">
                    <input type="number" class="form-control text-center px-0 heat-input-mm" data-fid="${f.id}" value="${mm}" placeholder="MM" style="max-width: 45px;">
                    <span class="input-group-text px-1">:</span>
                    <input type="number" class="form-control text-center px-0 heat-input-ss" data-fid="${f.id}" value="${ss}" placeholder="SS" style="max-width: 45px;">
                 </div>`;
            } else if (f.type === 'boolean') {
                 const checked = val === true ? 'checked' : '';
                 return `<div class="d-flex justify-content-center mb-1"><input type="checkbox" class="form-check-input heat-input-bool" data-fid="${f.id}" ${checked}></div>`;
            } else {
                const type = f.type === 'number' ? 'number' : 'text';
                return `<input type="${type}" class="form-control form-control-sm text-center mb-1 heat-input" data-fid="${f.id}" value="${val}" placeholder="${f.placeholder||''}" style="max-width: 100%;">`;
            }
        }).join('');

        return `
        <div class="d-flex align-items-center border-bottom py-3 entity-score-row" data-id="${eid}">
            <div style="width: 45%;" class="ps-3 fw-bold text-truncate" title="${label}">${label}</div>
            <div style="width: 35%;" class="px-1">${inputsHtml}</div>
            <div style="width: 20%;" class="text-center">
                <span class="advance-star ${advClass}" onclick="app.toggleHeatAdvance(this)" style="cursor: pointer; font-size: 1.5rem;">${advIcon}</span>
            </div>
        </div>`;
    }).join('');

    navigate('bracketHeat');
}

async function bracketSaveHeat() {
    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];
    const heat = round.heats.find(h => h.id === state.currentHeatId);
    if (!heat) return;

    try {
        document.querySelectorAll('.entity-score-row').forEach(row => {
            const eid = row.dataset.id;
            const payload = {};
            const fields = [...(state.currentStation.fields||[]), ...(state.config.common_scoring||[])];

            fields.forEach(f => {
                 if (f.type === 'timed' || f.type === 'stopwatch') {
                     const mm = row.querySelector(`.heat-input-mm[data-fid="${f.id}"]`)?.value || '00';
                     const ss = row.querySelector(`.heat-input-ss[data-fid="${f.id}"]`)?.value || '00';
                     payload[f.id] = `${mm.padStart(2,'0')}:${ss.padStart(2,'0')}`;
                 } else if (f.type === 'boolean') {
                     const el = row.querySelector(`.heat-input-bool[data-fid="${f.id}"]`);
                     payload[f.id] = el ? el.checked : false;
                 } else {
                     const el = row.querySelector(`.heat-input[data-fid="${f.id}"]`);
                     if(el) payload[f.id] = el.value;
                 }
            });

            // Updated Logic: Check for 'active' class on the span instead of checkbox
            const shouldAdvance = row.querySelector('.advance-star').classList.contains('active');
            heat.results[eid] = { ...payload, advance: shouldAdvance };

            if (!heat.results[eid].uuid) heat.results[eid].uuid = generateUUID();

            const serverPayload = { ...payload, heat: heat.name, round: round.name };
            const packet = {
                uuid: heat.results[eid].uuid,
                game_id: gameId,
                entity_id: eid,
                score_payload: serverPayload,
                timestamp: Date.now(),
                judge_name: els.judgeName.value,
                judge_email: els.judgeEmail.value,
                judge_unit: els.judgeUnit.value
            };
            syncManager.addToQueue(packet);
        });

        heat.complete = true;
        saveBracketState();
        updateSyncCounts();

        if (state.isOnline) {
            await syncManager.sync();
        }

        renderBracketRound();
        const label = state.currentStation.match_label || 'Match';
        alert(`${label} Saved.`);
        navigate('bracketRound');
    } catch (err) {
        const label = state.currentStation.match_label || 'Match';
        console.error(`${label} Save Error:`, err);
        renderBracketRound();
        navigate('bracketRound');
        alert(`⚠️ ${label} Saved Locally\n\nHowever, it failed to sync to the server:\n` + err.message);
    }
}

// --- PODIUM / END GAME LOGIC (Review & Finalize) ---

/**
 * REVIEW RESULTS WORKFLOW
 * Calculates the tentative podium based on the bracket results:
 * 1st: Winner of Main Bracket Final.
 * 2nd: Loser of Main Bracket Final.
 * 3rd: Winner of Consolation Bracket Final (if exists).
 * 4th: Loser of Consolation Bracket Final (if exists).
 */
function openReviewModal() {
    const gameId = state.currentStation.id;
    const bracket = state.bracketData[gameId];
    if (!bracket) return;

    // 1. Calculate the tentative podium
    const standings = [];

    // Local helper to extract winner/loser from round list
    const getFinalResults = (rounds) => {
        if (!rounds || rounds.length === 0) return { winner: null, loser: null };
        const final = rounds[rounds.length - 1];
        let winner = null, loser = null;

        // Ensure heats exists and are complete
        if (final.heats && final.heats.length > 0) {
            final.heats.forEach(h => {
                if (h.complete) {
                    h.teams.forEach(tid => {
                        const res = h.results[tid];
                        if (res && res.advance) winner = tid;
                        else loser = tid;
                    });
                }
            });
        }
        return { winner, loser };
    };

    const main = getFinalResults(bracket.rounds);
    const cons = getFinalResults(bracket.consolation_rounds);

    if (main.winner) standings.push({ id: main.winner, note: "⭐ Main Winner (1st)", rank: 1 });
    if (main.loser) standings.push({ id: main.loser, note: "🥈 Main Runner-up (2nd)", rank: 2 });
    if (cons.winner) standings.push({ id: cons.winner, note: "🥉 Consolation Winner (3rd)", rank: 3 });
    if (cons.loser) standings.push({ id: cons.loser, note: "🏅 Consolation Runner-up (4th)", rank: 4 });

    // Fill in other participants as "Eliminated"
    const topIds = new Set(standings.map(s => s.id));
    const allParticipants = new Set();
    [...(bracket.rounds || []), ...(bracket.consolation_rounds || [])].forEach(r => {
        r.pool.forEach(id => allParticipants.add(id));
        r.heats.forEach(h => h.teams.forEach(id => allParticipants.add(id)));
    });

    Array.from(allParticipants).forEach(id => {
        if (!topIds.has(id)) {
            standings.push({ id, note: "Eliminated", rank: null });
        }
    });

    state.currentStandings = standings;

    // 2. UI: Clear #podium-list and append rows
    const tbody = document.getElementById('podium-list');
    if (tbody) {
        tbody.innerHTML = standings.map((s, idx) => {
            const e = state.entities.find(x => x.id === s.id);
            const label = e ? formatEntityLabel(e) : 'Unknown';
            return `
                <tr class="${idx < 4 ? 'table-primary fw-bold' : ''}">
                    <td class="ps-3">${label}</td>
                    <td class="small text-muted">${s.note}</td>
                    <td></td>
                    <td class="text-center fw-bold">${s.rank || '-'}</td>
                </tr>`;
        }).join('');
    }

    // 3. Show using Bootstrap Modal
    const modalEl = document.getElementById('podium-modal');
    if (modalEl) {
        // Remove hidden class if present
        modalEl.classList.remove('hidden');

        // Use new bootstrap.Modal().show() as requested
        if (window.bootstrap && window.bootstrap.Modal) {
            const bsModal = new bootstrap.Modal(modalEl);
            bsModal.show();
        } else {
            togglePodiumModal(true);
        }
    }
}

function openPodiumModal() {
    const gameId = state.currentStation.id;
    const bracket = state.bracketData[gameId];
    if (!bracket) return;

    // 1. Gather Standings structure
    let standings = [];

    const getMainFinalResults = () => {
        const rounds = bracket.rounds || [];
        if (rounds.length === 0) return { winner: null, loser: null };
        const final = rounds[rounds.length - 1];
        let winner = null, loser = null;
        final.heats.forEach(h => {
             if (h.complete) {
                 h.teams.forEach(tid => {
                     const res = h.results[tid];
                     if (res && res.advance) winner = tid;
                     else loser = tid;
                 });
             }
        });
        return { winner, loser };
    };

    const getConsFinalResults = () => {
        const rounds = bracket.consolation_rounds || [];
        if (rounds.length === 0) return { winner: null, loser: null, complete: true };
        const final = rounds[rounds.length - 1];
        let winner = null, loser = null, complete = false;

        // A round is complete if all heats are complete
        if (final.heats.length > 0 && final.heats.every(h => h.complete)) {
            complete = true;
            final.heats.forEach(h => {
                h.teams.forEach(tid => {
                    const res = h.results[tid];
                    if (res && res.advance) winner = tid;
                    else loser = tid;
                });
            });
        }
        return { winner, loser, complete };
    };

    const main = getMainFinalResults();
    const cons = getConsFinalResults();

    // 2. CHECK FOR CHALLENGE MATCHES
    // We look for a special round or heat. Let's look for a round named "Challenge Match"
    const challengeRound = (bracket.rounds || []).find(r => r.name === "Challenge Match");
    let challengeWinner = null, challengeLoser = null;
    if (challengeRound && challengeRound.heats[0] && challengeRound.heats[0].complete) {
        const h = challengeRound.heats[0];
        h.teams.forEach(tid => {
            if (h.results[tid]?.advance) challengeWinner = tid;
            else challengeLoser = tid;
        });
    }

    // 3. Build Ordered List
    if (main.winner) standings.push({ id: main.winner, note: "Main Winner", rank: 1 });

    if (challengeWinner) {
        // If challenge happened, the winner of that is definitely 2nd.
        standings.push({ id: challengeWinner, note: "Challenge Winner", rank: 2 });
        standings.push({ id: challengeLoser, note: "Challenge Loser", rank: 3 });
    } else {
        if (main.loser) standings.push({ id: main.loser, note: "Main Runner-up", rank: 2 });
        if (cons.winner) standings.push({ id: cons.winner, note: "Consolation Winner", rank: 3 });
    }

    if (cons.loser) standings.push({ id: cons.loser, note: "Consolation Runner-up", rank: 4 });

    // 4. Fill in the gaps (Eliminated players) with "Best Effort" Tie logic
    const topIds = new Set(standings.map(s => s.id));
    const others = [];

    const allParticipants = new Set();
    [...(bracket.rounds || []), ...(bracket.consolation_rounds || [])].forEach(r => {
        r.pool.forEach(id => allParticipants.add(id));
        r.heats.forEach(h => h.teams.forEach(id => allParticipants.add(id)));
    });

    Array.from(allParticipants).forEach(id => {
        if (!topIds.has(id)) {
            let highestRoundIdx = -1;
            // Rank primarily by how far they got in the Main bracket
            (bracket.rounds || []).forEach((r, idx) => {
                if (r.pool.includes(id) || r.heats.some(h => h.teams.includes(id))) {
                    highestRoundIdx = idx;
                }
            });
            others.push({ id, roundIdx: highestRoundIdx, note: "Eliminated" });
        }
    });

    // Sort others by the round they reached (higher is better)
    others.sort((a, b) => b.roundIdx - a.roundIdx);
    standings.push(...others);

    // Store in state so moveRank and render can work
    state.currentStandings = standings;

    renderPodiumTable();

    // Challenge Match Logic
    const challengeContainer = document.getElementById('podium-challenge-container');
    const submitBtn = document.getElementById('btn-podium-submit');

    if (challengeContainer) {
        if (!cons.complete) {
            challengeContainer.innerHTML = `<div class="alert alert-warning py-2 small mb-0">⚠️ Consolation Bracket Incomplete. Finished it to enable Challenge Match or Finalize.</div>`;
            if (submitBtn) submitBtn.disabled = true;
        } else if (!challengeWinner && main.loser && cons.winner) {
            challengeContainer.innerHTML = `
                <button class="btn btn-outline-primary w-100 fw-bold" onclick="app.bracketCreateChallengeMatch()">
                    ⚔️ CREATE CHALLENGE MATCH (2nd vs 3rd)
                </button>
                <div class="text-center small text-muted mt-1">Challenge: ${formatEntityLabel(state.entities.find(e => e.id === main.loser))} vs ${formatEntityLabel(state.entities.find(e => e.id === cons.winner))}</div>
            `;
            if (submitBtn) submitBtn.disabled = false;
        } else {
            challengeContainer.innerHTML = '';
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    togglePodiumModal(true);
}

function renderPodiumTable() {
    const tbody = document.getElementById('podium-list');
    if (!tbody) return;

    // Tie-aware rank assignment based on current list order
    const getTieKey = (item) => {
        // Top spots (1-4) are distinct by their specific outcomes
        const distinct = ["Main Winner", "Challenge Winner", "Challenge Loser", "Main Runner-up", "Consolation Winner", "Consolation Runner-up"];
        if (distinct.includes(item.note)) return item.id;
        // Others are tied if they were eliminated in the same round
        return `elim-r${item.roundIdx}`;
    };

    let lastKey = null;
    let lastRank = 0;
    state.currentStandings.forEach((s, idx) => {
        const currentKey = getTieKey(s);
        if (currentKey === lastKey) {
            s.rank = lastRank;
        } else {
            s.rank = idx + 1;
            lastRank = s.rank;
            lastKey = currentKey;
        }
    });

    tbody.innerHTML = state.currentStandings.map((s, idx) => {
        const e = state.entities.find(x => x.id === s.id);
        const label = formatEntityLabel(e);

        return `
        <tr data-id="${s.id}">
            <td class="fw-bold ps-3">${label}</td>
            <td class="text-muted small">${s.note}</td>
            <td class="px-0">
                <div class="d-flex flex-column align-items-center">
                    <button class="btn btn-sm btn-dark py-0 mb-1 ${idx === 0 ? 'invisible' : ''}" style="font-size: 0.7rem; width: 34px; height: 20px;" onclick="app.bracketMoveRank(${idx}, -1)">▲</button>
                    <button class="btn btn-sm btn-dark py-0 ${idx === state.currentStandings.length - 1 ? 'invisible' : ''}" style="font-size: 0.7rem; width: 34px; height: 20px;" onclick="app.bracketMoveRank(${idx}, 1)">▼</button>
                </div>
            </td>
            <td class="text-center">
                <input type="number" class="form-control text-center fw-bold mx-auto px-1"
                       value="${s.rank}" min="1" style="width: 50px;" onchange="app.bracketSetRankManual(${idx}, this.value)">
            </td>
        </tr>`;
    }).join('');
}

function bracketMoveRank(idx, delta) {
    const target = idx + delta;
    if (target < 0 || target >= state.currentStandings.length) return;

    const arr = state.currentStandings;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];

    renderPodiumTable();
}

function bracketSetRankManual(idx, val) {
    const newVal = parseInt(val);
    if (!isNaN(newVal)) {
        state.currentStandings[idx].rank = newVal;
    }
}

function bracketCreateChallengeMatch() {
    const gameId = state.currentStation.id;
    const bracket = state.bracketData[gameId];

    // 1. Find the Main Loser (2nd place candidate from Finals)
    const mainRounds = bracket.rounds;
    const mainFinal = mainRounds[mainRounds.length - 1];
    let mainLoser = null;
    if (mainFinal && mainFinal.heats) {
        mainFinal.heats.forEach(h => {
            h.teams.forEach(tid => {
                if (h.results[tid] && !h.results[tid].advance) mainLoser = tid;
            });
        });
    }

    // 2. Find the Consolation Winner
    const consRounds = bracket.consolation_rounds || [];
    let consWinner = null;

    if (consRounds.length > 0) {
        const consFinal = consRounds[consRounds.length - 1];
        if (consFinal && consFinal.heats) {
            consFinal.heats.forEach(h => {
                h.teams.forEach(tid => {
                    if (h.results[tid] && h.results[tid].advance) consWinner = tid;
                });
            });
        }
    }

    // 3. AIR GAP FALLBACK: If Cons Winner is unknown or un-synced
    if (!consWinner) {
        const troopNum = prompt("Consolation Winner Unknown (data not synced?).\nEnter Troop/Patrol Number to challenge:");
        if (troopNum) {
            const match = state.entities.find(e =>
                (e.troop_number === troopNum || e.name.toLowerCase().includes(troopNum.toLowerCase()))
                && (e.type === (state.currentStation.type || 'patrol'))
            );
            if (match) {
                consWinner = match.id;
                alert(`✅ Identified ${formatEntityLabel(match)} as challenger.`);
            } else {
                return alert("Could not find a team matching that name or troop number.");
            }
        } else {
            return; // Cancelled
        }
    }

    if (!mainLoser || !consWinner) return alert("Could not identify both candidates for Challenge Match.");

    // 4. Create the New Round
    const challengeRound = {
        name: "Challenge Match",
        pool: [],
        heats: [{
            id: generateUUID(),
            name: "Final Challenge (2nd Place)",
            teams: [mainLoser, consWinner],
            complete: false,
            results: {}
        }],
        isFinalRound: true // Allow rank input
    };

    bracket.rounds.push(challengeRound);
    state.currentRoundIdx = bracket.rounds.length - 1;
    bracketSwitchMode('main'); // Switch to main and theme back to blue

    saveBracketState();
    if (typeof togglePodiumModal === 'function') togglePodiumModal(false);
    renderBracketRound();
    navigate('bracketRound');
}

async function bracketSubmitPodium() {
    const s = state.currentStation;

    // Scrape data from the current Standings (Ordered list)
    // We use the rank property which includes tie logic
    const results = state.currentStandings.map(s => ({
        entity_id: s.id,
        rank: s.rank
    }));

    if (results.length === 0) return alert("No results found.");

    // Submit Scores to Server
    results.forEach(r => {
        const packet = {
            uuid: generateUUID(),
            game_id: s.id,
            entity_id: r.entity_id,
            score_payload: {
                rank: r.rank, // Raw Integer
                notes: `Tournament Place: ${getOrdinalSuffix(r.rank)}`
            },
            timestamp: Date.now(),
            judge_name: els.judgeName.value,
            judge_email: els.judgeEmail.value,
            judge_unit: els.judgeUnit.value
        };
        syncManager.addToQueue(packet);
    });

    try {
        if (state.isOnline) {
            await syncManager.sync();
        }
        togglePodiumModal(false);
        alert("🏆 Results Finalized & Submitted! Thank you.");
        navigate('home');
    } catch (err) {
        console.error("Podium Sync Failed:", err);
        togglePodiumModal(false);
        alert("⚠️ Results Saved Locally\n\nHowever, it failed to sync to the server:\n" + err.message);
        navigate('home');
    }
}

function togglePodiumModal(show) {
    const m = document.getElementById('podium-modal');
    if (show) m.classList.remove('hidden');
    else m.classList.add('hidden');
}

// Don't forget to export the new helper!
window.app = {
    init, navigate, handleBack, refreshData, selectStation, selectEntity,
    submitScore, setMode, promptNewEntity, toggleJudgeModal, saveJudgeInfo,
    saveDraft, combineTime, resetAppData, bracketQuickSave, bracketScratchTeam,
    openPodiumModal, openReviewModal, togglePodiumModal, bracketSubmitPodium,
    bracketSelectAll, bracketStartEvent, bracketDirectEntry, bracketCreateHeat, bracketOpenHeat,
    bracketSaveHeat, bracketAdvanceRound, bracketRenameRound, bracketToggleAdvance,
    bracketSwitchMode, bracketGrantBye, toggleHeatAdvance, bracketUpdateRank,
    bracketMoveRank, bracketCreateChallengeMatch, bracketSetRankManual
};

function bracketRenameRound() {
    const gameId = state.currentStation.id;
    const roundList = getBracketRoundList(gameId);
    const round = roundList[state.currentRoundIdx];
    const newName = prompt("Rename Round:", round.name);
    if (newName) {
        round.name = newName;
        saveBracketState();
        renderBracketRound();
    }
}

// --- Data & Helpers ---

function updateOnlineStatus() {
    state.isOnline = navigator.onLine;
    const c = syncManager.getCounts().unsynced;
    if(els.unsyncedCount) els.unsyncedCount.textContent = c;
    if (c > 0 && state.isOnline) { els.status.textContent = 'Sync'; els.status.className = 'status-sync ms-2'; }
    else { els.status.textContent = state.isOnline ? 'Online' : 'Offline'; els.status.className = (state.isOnline ? 'status-online' : 'status-offline') + ' ms-2'; }
}

async function refreshData() {
    try {
        const ts = Date.now();
        const [cRes, eRes] = await Promise.all([fetch('/games.json?t='+ts), fetch('/api/entities?t='+ts)]);
        if (cRes.ok && eRes.ok) {
            const sc = await cRes.json();
            const config = { stations: sc.games, common_scoring: sc.common_scoring||[] };
            state.config = config;
            state.entities = await eRes.json();
            localStorage.setItem('camporee_config', JSON.stringify(config));
            localStorage.setItem('camporee_entities', JSON.stringify(state.entities));
            renderStationList();
        }
    } catch(e) { console.error(e); }
}

function loadLocalData() {
    try {
        const c = localStorage.getItem('camporee_config');
        const e = localStorage.getItem('camporee_entities');
        if (c) state.config = JSON.parse(c);
        if (e) state.entities = JSON.parse(e);
    } catch (e) {}
}

function loadJudgeInfo() {
    const j = JSON.parse(localStorage.getItem('judge_info')||'{}');
    if(els.judgeName) els.judgeName.value = j.name||'';
    if(els.judgeEmail) els.judgeEmail.value = j.email||'';
    if(els.judgeUnit) els.judgeUnit.value = j.unit||'';
    if(j.name && document.getElementById('welcome-text')) document.getElementById('welcome-text').textContent = `Welcome, ${j.name.split(' ')[0]}.`;
    else toggleJudgeModal(true);
}

function toggleJudgeModal(show) {
    const m = document.getElementById('judge-modal');
    if(show===true) m.classList.remove('hidden');
    else if(show===false) m.classList.add('hidden');
    else m.classList.toggle('hidden');
}

function saveJudgeInfo() {
    const j = { name: els.judgeName.value.trim(), email: els.judgeEmail.value.trim(), unit: els.judgeUnit.value.trim() };
    if(!j.email) return alert("Email required.");
    localStorage.setItem('judge_info', JSON.stringify(j));
    if(j.name) document.getElementById('welcome-text').textContent = `Welcome, ${j.name.split(' ')[0]}.`;
    toggleJudgeModal(false);
}

async function promptNewEntity(type) {
    const n = prompt(`Name for new ${type}:`); if(!n) return;
    const t = prompt("Troop Number:"); if(!t) return;
    try {
        const r = await fetch('/api/entities', { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:n, type, troop_number:t}) });
        if(r.ok) {
            // SAFE PARSING: Chrome forgives empty JSON, Safari throws.
            if (r.status !== 204) {
                const data = await r.json();
                state.entities.push(data);
            }
            localStorage.setItem('camporee_entities', JSON.stringify(state.entities));
            renderEntityList();
        } else {
             const err = await r.text();
             alert("Error creating entity: " + err);
        }
    } catch(e) {
        console.error("New Entity Error:", e);
        alert("Network Error: " + e.message);
    }
}

function showEntitySelect() { navigate('entity'); }
function updateSyncCounts() { updateOnlineStatus(); }
async function handleSync() { if(state.isOnline) await syncManager.sync(); updateSyncCounts(); }


if (!window.startStopwatch) {
    window.startStopwatch = startStopwatch;
    window.stopStopwatch = stopStopwatch;
}

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('✅ Judge App: Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('❌ Judge App: Service Worker registration failed:', error);
            });
    });
}


window.onload = init;