import { SyncManager } from './sync-manager.js';
import { generateFieldHTML } from './core/ui.js';

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
    bracketData: JSON.parse(localStorage.getItem('coyote_bracket_data') || '{}'),
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

// --- Navigation ---

function navigate(viewName) {
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
    const visibleView = Object.keys(views).find(key => !views[key].classList.contains('hidden'));

    if (visibleView === 'scoring') {
        renderEntityList();
        navigate('entity');
    } else if (visibleView === 'entity') {
        navigate('home');
    } else if (visibleView === 'bracketLobby') {
        navigate('home');
    } else if (visibleView === 'bracketRound') {
        if(confirm("Exit Tournament Manager?")) navigate('home');
    } else if (visibleView === 'bracketHeat') {
        navigate('bracketRound');
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

function formatGameTitle(game) {
    if (!game) return '';
    if (game.name.match(/^(Game|Exhibition|p\d)/i)) return game.name;
    const match = game.id.match(/(\d+)/);
    const num = match ? match[1] : '';
    if (num) return `Game ${num}. ${game.name}`;
    return game.name;
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
    els.stationList.innerHTML = filteredStations.map(s => `
        <button class="btn btn-outline-dark w-100 mb-2 text-start p-3 shadow-sm" onclick="app.selectStation('${s.id}')">
            <div class="fw-bold">${formatGameTitle(s)}</div>
            <small class="text-muted text-uppercase" style="font-size:0.75rem;">${s.type || 'General'}</small>
        </button>`).join('');
}

function renderEntityList(filter = '') {
    if (!state.currentStation) return;
    const requiredType = state.currentStation.type || state.viewMode;
    const term = filter.toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('coyote_drafts') || '{}');
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
        const drafts = JSON.parse(localStorage.getItem('coyote_drafts') || '{}');
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
    const drafts = JSON.parse(localStorage.getItem('coyote_drafts') || '{}');
    drafts[draftKey] = payload;
    localStorage.setItem('coyote_drafts', JSON.stringify(drafts));
}

function submitScore(e) {
    e.preventDefault();
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
        uuid: existing ? existing.uuid : crypto.randomUUID(),
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
    const drafts = JSON.parse(localStorage.getItem('coyote_drafts') || '{}');
    delete drafts[draftKey];
    localStorage.setItem('coyote_drafts', JSON.stringify(drafts));
    updateSyncCounts();
    alert('Score Saved!');
    renderEntityList();
    navigate('entity');
    if(state.isOnline) syncManager.sync().then(updateSyncCounts);
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
    localStorage.setItem('coyote_bracket_data', JSON.stringify(state.bracketData));
}

// 1. LOBBY
function renderBracketLobby() {
    const s = state.currentStation;
    document.getElementById('bracket-lobby-title').innerText = `${s.name} (Lobby)`;
    const requiredType = s.type || state.viewMode;
    const entities = state.entities.filter(e => e.type === requiredType).sort((a,b) => (parseInt(a.troop_number)||0) - (parseInt(b.troop_number)||0));
    els.lobbyList.innerHTML = entities.map(e => `
        <label class="list-group-item d-flex gap-3 align-items-center">
            <input class="form-check-input flex-shrink-0" type="checkbox" value="${e.id}" style="transform: scale(1.3);">
            <div><strong>${formatEntityLabel(e)}</strong><div class="small text-muted">#${e.id}</div></div>
        </label>`).join('');
}

function bracketSelectAll(checked) {
    els.lobbyList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checked);
}

function bracketStartEvent() {
    const selectedIds = Array.from(els.lobbyList.querySelectorAll('input:checked')).map(cb => cb.value);
    if (selectedIds.length < 2) return alert("Select at least 2 teams.");
    const gameId = state.currentStation.id;
    const bData = state.bracketData[gameId];
    bData.active = true;
    bData.rounds = [{ name: "Round 1", pool: selectedIds, heats: [] }];
    saveBracketState();
    state.currentRoundIdx = 0;
    renderBracketRound();
    navigate('bracketRound');
}

// 2. ROUND MANAGER
function renderBracketRound() {
    const gameId = state.currentStation.id;
    const round = state.bracketData[gameId].rounds[state.currentRoundIdx];
    document.getElementById('bracket-round-title').innerText = round.name;
    document.getElementById('bracket-pool-count').innerText = round.pool.length;

    // Pool List
    els.roundPool.innerHTML = round.pool.length ? round.pool.map(eid => {
        const e = state.entities.find(x => x.id === eid);
        const label = formatEntityLabel(e); // USE FORMATTER
        return `
        <li class="list-group-item d-flex justify-content-between align-items-center p-2">
            <div class="d-flex align-items-center gap-2 overflow-hidden">
                <input class="form-check-input form-check-pool flex-shrink-0" type="checkbox" value="${eid}" style="transform: scale(1.1);">
                <div class="text-truncate">${label}</div>
            </div>
            <button class="btn btn-sm btn-outline-secondary py-0 px-2 ms-2" onclick="app.bracketGrantBye('${eid}')" style="width: auto; font-size: 0.75rem;">Bye</button>
        </li>`;
    }).join('') : '<div class="p-3 text-muted text-center">Pool Empty</div>';

    // Heats List
    els.heatList.innerHTML = round.heats.map((heat, idx) => {
        const teamListHtml = heat.teams.map(eid => {
            const e = state.entities.find(x => x.id === eid);
            const label = formatEntityLabel(e); // USE FORMATTER
            const res = heat.results[eid] || {};
            const advIcon = res.advance ? '⏩' : '⏹️';
            const advClass = res.advance ? 'active' : '';
            return `
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span>${label}</span>
                    <span class="advance-star ${advClass}" onclick="app.bracketToggleAdvance(${idx}, '${eid}', event)" title="Toggle Advance" style="font-size: 1.2rem;">${advIcon}</span>
                </div>`;
        }).join('');

        return `
        <div class="card shadow-sm" onclick="app.bracketOpenHeat(${idx})">
            <div class="card-body">
                <div class="d-flex justify-content-between border-bottom pb-2 mb-2 bg-light p-2 rounded">
                    <span class="small text-muted">${heat.teams.length} Teams</span>
                    <div class="fw-bold">${heat.name} ${heat.complete ? '<span class="badge bg-success ms-2">Scored</span>' : '<span class="badge bg-secondary ms-2">Pending</span>'}</div>
                </div>
                <div class="heat-card-teams">
                    ${teamListHtml}
                </div>
            </div>
        </div>`;
    }).join('');
}

function bracketGrantBye(eid) {
    if(!confirm("Grant a 'Bye' to this team? They will advance to the next round automatically.")) return;
    const gameId = state.currentStation.id;
    const round = state.bracketData[gameId].rounds[state.currentRoundIdx];
    round.pool = round.pool.filter(id => id !== eid);
    const heatNum = round.heats.length + 1;
    round.heats.push({
        id: Date.now(),
        name: `Bye (Heat ${heatNum})`,
        teams: [eid],
        complete: true,
        results: { [eid]: { advance: true } }
    });
    saveBracketState();
    renderBracketRound();
}

function bracketToggleAdvance(heatIdx, eid, event) {
    event.stopPropagation();
    const gameId = state.currentStation.id;
    const round = state.bracketData[gameId].rounds[state.currentRoundIdx];
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
    const round = state.bracketData[gameId].rounds[state.currentRoundIdx];
    round.pool = round.pool.filter(id => !checked.includes(id));
    const heatNum = round.heats.length + 1;
    round.heats.push({ id: Date.now(), name: `Heat ${heatNum}`, teams: checked, complete: false, results: {} });
    saveBracketState();
    renderBracketRound();
}

function bracketOpenHeat(heatIdx) {
    const gameId = state.currentStation.id;
    const round = state.bracketData[gameId].rounds[state.currentRoundIdx];
    const heat = round.heats[heatIdx];
    state.currentHeatId = heat.id;
    document.getElementById('heat-title').innerText = `${round.name} - ${heat.name}`;

    const fields = [...(state.currentStation.fields||[]), ...(state.config.common_scoring||[])].filter(f => f.audience === 'judge');

    els.heatContainer.innerHTML = heat.teams.map(eid => {
        const e = state.entities.find(x => x.id === eid);
        const label = formatEntityLabel(e); // USE FORMATTER
        const result = heat.results[eid] || {};
        const fieldsHtml = fields.map(f => generateFieldHTML(f, result[f.id])).join('');
        return `
        <div class="card mb-3 border-dark entity-score-card" data-id="${eid}">
            <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                <strong>${label}</strong>
                <div class="form-check form-switch"><input class="form-check-input advance-toggle" type="checkbox" id="adv_${eid}" ${result.advance?'checked':''}><label class="form-check-label text-white" for="adv_${eid}">Advance</label></div>
            </div>
            <div class="card-body">${fieldsHtml}</div>
        </div>`;
    }).join('');
    navigate('bracketHeat');
}

function bracketSaveHeat() {
    const gameId = state.currentStation.id;
    const round = state.bracketData[gameId].rounds[state.currentRoundIdx];
    const heat = round.heats.find(h => h.id === state.currentHeatId);
    if (!heat) return;

    document.querySelectorAll('.entity-score-card').forEach(card => {
        const eid = card.dataset.id;
        const payload = {};
        const fields = [...(state.currentStation.fields||[]), ...(state.config.common_scoring||[])];

        fields.forEach(f => {
             if (f.type === 'timed' || f.type === 'stopwatch') {
                 const mm = card.querySelector(`#f_${f.id}_mm`)?.value || '00';
                 const ss = card.querySelector(`#f_${f.id}_ss`)?.value || '00';
                 payload[f.id] = `${mm.padStart(2,'0')}:${ss.padStart(2,'0')}`;
             } else {
                 const el = card.querySelector(`#f_${f.id}`);
                 if (f.type === 'boolean') payload[f.id] = el?.checked;
                 else if (el) payload[f.id] = el.value;
             }
        });

        const shouldAdvance = card.querySelector('.advance-toggle').checked;
        heat.results[eid] = { ...payload, advance: shouldAdvance };

        if (!heat.results[eid].uuid) heat.results[eid].uuid = crypto.randomUUID();
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
    if (state.isOnline) syncManager.sync();
    renderBracketRound();
    alert("Heat Saved.");
    navigate('bracketRound');
}

function bracketAdvanceRound() {
    if (!confirm("Create new Round from teams marked 'Advance'?")) return;
    const gameId = state.currentStation.id;
    const round = state.bracketData[gameId].rounds[state.currentRoundIdx];
    const winners = [];
    round.heats.forEach(h => {
        Object.keys(h.results).forEach(eid => { if (h.results[eid].advance) winners.push(eid); });
    });
    if (winners.length === 0) return alert("No teams marked to advance!");

    state.bracketData[gameId].rounds.push({ name: `Round ${state.currentRoundIdx + 2}`, pool: winners, heats: [] });
    saveBracketState();
    state.currentRoundIdx++;
    renderBracketRound();
}

function bracketRenameRound() {
    const gameId = state.currentStation.id;
    const round = state.bracketData[gameId].rounds[state.currentRoundIdx];
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
            localStorage.setItem('coyote_config', JSON.stringify(config));
            localStorage.setItem('coyote_entities', JSON.stringify(state.entities));
            renderStationList();
        }
    } catch(e) { console.error(e); }
}

function loadLocalData() {
    try {
        const c = localStorage.getItem('coyote_config');
        const e = localStorage.getItem('coyote_entities');
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
            state.entities.push(await r.json());
            localStorage.setItem('coyote_entities', JSON.stringify(state.entities));
            renderEntityList();
        }
    } catch(e) { alert("Error"); }
}

function showEntitySelect() { navigate('entity'); }
function updateSyncCounts() { updateOnlineStatus(); }
async function handleSync() { if(state.isOnline) await syncManager.sync(); updateSyncCounts(); }

window.app = { init, navigate, handleBack, refreshData, selectStation, selectEntity, submitScore, setMode, promptNewEntity, toggleJudgeModal, saveJudgeInfo, saveDraft, combineTime,
// Bracket Exports
bracketSelectAll, bracketStartEvent, bracketCreateHeat, bracketOpenHeat, bracketSaveHeat, bracketAdvanceRound, bracketRenameRound, bracketToggleAdvance, bracketGrantBye
};

if (!window.startStopwatch) {
    window.startStopwatch = startStopwatch;
    window.stopStopwatch = stopStopwatch;
}

window.onload = init;