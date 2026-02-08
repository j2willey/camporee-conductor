import { formatGameTitle, getOrdinalSuffix, getPointsForRank } from './core/schema.js';

// State
let appData = {
    games: [],
    entities: [],
    commonScoring: [],
    scores: [], // Full raw score list
    stats: {}, // Counts
    gameStatuses: {} // NEW: Map of game_id -> status
};

let currentView = 'overview';
let currentViewType = 'list'; // 'card' or 'list'
let currentViewMode = 'patrol'; // 'patrol', 'troop', or 'exhibition'
let matrixTranspose = false;
let detailSort = { col: '_finalRank', dir: 'asc' };
let activeGameId = null;
let finalMode = false;
let autoRefreshInterval = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupNavigation();

    // Handle initial route from URL
    const params = new URLSearchParams(window.location.search);
    const view = 'overview';
    const gameId = params.get('gameId');

    if (view === 'detail' && gameId) {
        switchView('detail', false);
        openGameDetail(gameId);
    } else {
        switchView(view, false);
    }

    // Handle back/forward buttons
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.view) {
            if (event.state.view === 'detail' && event.state.gameId) {
                switchView('detail', false);
                openGameDetail(event.state.gameId);
            } else {
                switchView(event.state.view, false);
            }
        } else {
            switchView('dashboard', false);
        }
    });
});

async function loadData(silent = false) {
    try {
        const ts = Date.now();
        // Fetch Games Config & Entities
        const [gamesRes, entitiesRes, dataRes] = await Promise.all([
            fetch(`/games.json?t=${ts}`),
            fetch(`/api/entities?t=${ts}`),
            fetch(`/api/admin/all-data?t=${ts}`)
        ]);

        const gamesResult = await gamesRes.json();
        appData.games = gamesResult.games;
        appData.commonScoring = gamesResult.common_scoring;

        appData.entities = await entitiesRes.json();

        // Fetch Data
        const dataResult = await dataRes.json();
        appData.scores = dataResult.scores || [];
        appData.stats = dataResult.stats || {};
        appData.gameStatuses = dataResult.game_status || {};
        appData.metadata = dataResult.metadata || {};

        if (!silent) console.log('Loaded Data:', appData);

        // If we are auto-refreshing, we need to re-render the current view to show changes
        if (silent) refreshCurrentView();
        updateDashboardHeader();

    } catch (err) {
        console.error('Failed to load data', err);
        if (!silent) alert('Error loading dashboard data');
    }
}

function updateDashboardHeader() {
    const meta = appData.metadata;
    if (!meta) return;

    // 1. Update the main H1 Brand
    const brand = document.querySelector('header h1'); // or element with class .navbar-brand
    if (brand) {
        // Set the visible title
        brand.innerText = meta.title || 'Camporee Collator';

        // Set the debug UUID tooltip
        if (meta.camporeeId) {
            brand.title = `UUID: ${meta.camporeeId}\nTheme: ${meta.theme}`;
            brand.style.cursor = 'help'; // Visual cue that hover does something
        }
    }

    // 2. Update Document Title (Browser Tab)
    document.title = meta.title ? `${meta.title} - Admin` : 'Camporee Collator';
}

function setupNavigation() {
    const navDashboard = document.getElementById('nav-dashboard');
    const transposeBtn = document.getElementById('btn-transpose');
    const viewModeSelect = document.getElementById('view-mode-select');
    const clearScoresBtn = document.getElementById('btn-clear-scores');
    const resetDbBtn = document.getElementById('btn-reset-db');
    const exportRawBtn = document.getElementById('btn-export-raw');
    const autoRefreshSwitch = document.getElementById('auto-refresh-switch');

    // Branding click goes back to dashboard
    const brand = document.querySelector('header h1');
    if (brand) {
        brand.style.cursor = 'pointer';
        brand.onclick = () => switchView('dashboard');
    }

    if (exportRawBtn) {
        // Raw Export: Database Dump (All Scores) - distinct from Awards CSV
        exportRawBtn.onclick = () => window.location.href = '/api/export';
    }

    if (clearScoresBtn) {
        clearScoresBtn.addEventListener('click', async () => {
            if (confirm('CAUTION: This will delete ALL scoring data but keep the rosters (Troops/Patrols).\n\nAre you sure?')) {
                const check = prompt("Type 'SCORES' to confirm:");
                if (check === 'SCORES') {
                    try {
                        const res = await fetch('/api/admin/scores', { method: 'DELETE' });
                        if (res.ok) {
                            localStorage.clear(); // Purge cache on this device
                            alert('Scores cleared.');
                            window.location.reload();
                        } else {
                            alert('Failed to clear scores.');
                        }
                    } catch (e) {
                        alert('Error: ' + e.message);
                    }
                }
            }
        });
    }

    if (resetDbBtn) {
        resetDbBtn.addEventListener('click', async () => {
            if (confirm('CRITICAL: This will delete ALL scores AND ALL rosters (Troops and Patrols).\n\nAre you sure?')) {
                const check = prompt("Type 'RESET' to confirm:");
                if (check === 'RESET') {
                    try {
                        const res = await fetch('/api/admin/full-reset', { method: 'DELETE' });
                        if (res.ok) {
                            localStorage.clear(); // Purge cache on this device
                            alert('Database has been fully reset.');
                            window.location.reload();
                        } else {
                            alert('Failed to reset database.');
                        }
                    } catch (e) {
                        alert('Error: ' + e.message);
                    }
                }
            }
        });
    }

    if (navDashboard) {
        navDashboard.addEventListener('click', () => switchView('dashboard'));
    }

    if (transposeBtn) {
        transposeBtn.addEventListener('click', () => {
            matrixTranspose = !matrixTranspose;
            renderMatrix();
        });
    }

    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', (e) => {
            currentViewMode = e.target.value;
            refreshCurrentView();
            // Also hide stickers preview if changing modes
            const previewContainer = document.getElementById('stickers-preview-container');
            const printBtn = document.getElementById('btn-print-preview');
            if (previewContainer) previewContainer.classList.add('hidden');
            if (printBtn) printBtn.classList.add('hidden');
        });
    }

    if (autoRefreshSwitch) {
        autoRefreshSwitch.addEventListener('change', (e) => {
            if (e.target.checked) {
                // Start Polling (15s)
                loadData(true); // Immediate fetch
                autoRefreshInterval = setInterval(() => loadData(true), 15000);
            } else {
                if (autoRefreshInterval) clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        });
    }
}

function handleBack() {
    if (currentView === 'detail' || currentView === 'matrix') {
        switchView('overview');
    } else {
        switchView('dashboard');
    }
}
window.handleBack = handleBack;

function refreshCurrentView() {
    if (currentView === 'overview') {
        renderOverviewList();
    }
    else if (currentView === 'matrix') {
        renderMatrix();
    }
    else if (currentView === 'awards') {
        // Clear preview container if we switch modes while on Awards view
        const previewContainer = document.getElementById('stickers-preview-container');
        const printBtn = document.getElementById('btn-print-preview');
        if (previewContainer && !previewContainer.classList.contains('hidden')) {
            previewContainer.classList.add('hidden');
        }
        if (printBtn && !printBtn.classList.contains('hidden')) {
            printBtn.classList.add('hidden');
        }
    }
}

function switchView(viewName, pushToHistory = true) {
    currentView = viewName;
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));

    const headerActions = document.getElementById('header-actions');
    const modeFilter = document.getElementById('mode-filter-container');
    const navBar = document.querySelector('header nav');
    const backBtn = document.getElementById('header-back-btn');

    // Hide/Show header elements based on view
    if (viewName === 'dashboard') {
        if (headerActions) headerActions.classList.add('hidden');
        if (navBar) navBar.classList.add('hidden');
        if (backBtn) backBtn.classList.add('hidden');
        setSubtitle('');
    } else {
        if (headerActions) headerActions.classList.remove('hidden');
        if (navBar) navBar.classList.remove('hidden');

        // Filter pull-down: only overview and awards
        if (viewName === 'overview' || viewName === 'awards') {
            if (modeFilter) modeFilter.classList.remove('hidden');
        } else {
            if (modeFilter) modeFilter.classList.add('hidden');
        }

        // Back Button: Visible on all views except dashboard
        if (viewName !== 'dashboard') {
            if (backBtn) backBtn.classList.remove('hidden');
        } else {
            if (backBtn) backBtn.classList.add('hidden');
        }
    }

    if (pushToHistory) {
        const url = new URL(window.location);
        url.searchParams.set('view', viewName);
        if (viewName !== 'detail') url.searchParams.delete('gameId');
        window.history.pushState({ view: viewName, gameId: activeGameId }, '', url);
    }

    if (viewName === 'dashboard') {
        document.getElementById('view-dashboard').classList.remove('hidden');
    } else if (viewName === 'overview') {
        document.getElementById('view-overview').classList.remove('hidden');
        setSubtitle('Game Overview');
        refreshCurrentView();
    } else if (viewName === 'matrix') {
        document.getElementById('view-matrix').classList.remove('hidden');
        // renderMatrix sets its own subtitle
        renderMatrix();
    } else if (viewName === 'detail') {
        document.getElementById('view-detail').classList.remove('hidden');
    }
}
window.switchView = switchView;

function setSubtitle(text) {
    const subtitle = document.getElementById('header-subtitle');
    if (subtitle) {
        subtitle.innerText = text ? ` - ${text}` : '';
    }
}

// --- Score & Ranking Utils ---

/**
 * Calculates the total scores and ranks for all entities across all games.
 *
 * Ranking Logic:
 * - Uses "Dense Ranking": Ties share the same rank, and the next rank is the immediate integer.
 *   Example: If two entities tie for 1st, the next entity is 2nd (not 3rd).
 *   Sequence: 1st, 1st, 2nd, 3rd...
 *
 * Precedence:
 * - If a 'manual_rank' override exists in the score payload, it takes precedence over the calculated auto-rank.
 * - Manual points overrides are also applied here for the final leaderboard calculations.
 *
 * @returns {Object} A map of { entity_id: { game_id: points } } for leaderboard aggregation.
 */
function calculateScoreContext() {
    // 1. Calculate totals for every score
    const enrichedScores = appData.scores.map(score => {
        const game = appData.games.find(g => g.id === score.game_id);
        let total = 0;
        if (game) {
            const fields = game.fields || [];
            fields.forEach(f => {
                if (f.kind === 'points' || f.kind === 'penalty') {
                    const val = parseFloat(score.score_payload[f.id]);
                    if (!isNaN(val)) {
                        if (f.kind === 'penalty') total -= val;
                        else total += val;
                    }
                }
            });
        }
        return { ...score, _total: total };
    });

    // 2. Group by game to calculate dense ranks
    const gameGroups = {};
    enrichedScores.forEach(s => {
        if (!gameGroups[s.game_id]) gameGroups[s.game_id] = [];
        gameGroups[s.game_id].push(s);
    });

    const finalPointsMap = {}; // { entity_id: { game_id: points } }

    Object.keys(gameGroups).forEach(gameId => {
        const scores = gameGroups[gameId];
        scores.sort((a, b) => b._total - a._total);

        let currentAutoRank = 0;
        let lastTotal = null;
        scores.forEach(s => {
            if (s._total !== lastTotal) {
                currentAutoRank++;
                lastTotal = s._total;
            }
            s._autoRank = getOrdinalSuffix(currentAutoRank);

            // Apply Manual Overrides
            const finalRank = s.score_payload.manual_rank || s._autoRank;
            const autoPts = getPointsForRank(finalRank);
            const mPts = s.score_payload.manual_points;
            const finalPoints = (mPts !== undefined && mPts !== "" && mPts !== null) ? parseFloat(mPts) : autoPts;

            if (!finalPointsMap[s.entity_id]) finalPointsMap[s.entity_id] = {};
            finalPointsMap[s.entity_id][gameId] = finalPoints;
        });
    });

    return finalPointsMap;
}

// --- Overview ---

function renderOverviewList() {
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '';
    // Use block for table
    grid.style.display = 'block';

    const games = getFilteredGames();

    if (games.length === 0) {
        grid.innerHTML = `<p>No ${currentViewMode} games found.</p>`;
        return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped table-hover';
    table.innerHTML = `
        <thead class="table-dark">
            <tr>
                <th>Game</th>
                <th>Scores Input</th>
                <th class="text-center">Status</th>
                <th class="text-end">Action</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    // Inject Leaderboard row
    const lbTr = document.createElement('tr');
    lbTr.style.cursor = 'pointer';
    lbTr.className = 'table-info';
    lbTr.onclick = () => switchView('matrix');
    lbTr.innerHTML = `
        <td class="fw-bold">Game 0. Leader Board</td>
        <td>-</td>
        <td class="text-center">
            <span class="badge bg-info text-dark">Aggregated</span>
        </td>
        <td class="text-end">
            <button class="btn btn-sm btn-info">Open</button>
        </td>
    `;
    tbody.appendChild(lbTr);

    games.forEach(game => {
        const count = appData.stats[game.id] || 0;
        const isFinal = appData.gameStatuses[game.id] === 'finalized';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = (e) => {
             // Don't trigger if clicked checkbox or button
             if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') openGameDetail(game.id)
        };

        tr.innerHTML = `
            <td class="fw-bold">${formatGameTitle(game)}</td>
            <td>${count}</td>
            <td class="text-center">
                <div class="form-check form-switch d-inline-block">
                    <input class="form-check-input" type="checkbox" id="status_${game.id}" ${isFinal ? 'checked' : ''} onclick="toggleGameStatus('${game.id}', this.checked)">
                    <label class="form-check-label small ${isFinal ? 'text-success fw-bold' : 'text-muted'}" for="status_${game.id}">${isFinal ? 'Final' : 'Draft'}</label>
                </div>
            </td>
            <td class="text-end">
                <button class="btn btn-sm btn-primary">Open</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    grid.appendChild(table);
}

function getFilteredGames() {
    return appData.games.filter(g => {
        const gType = g.type || 'patrol';
        return gType === currentViewMode;
    });
}

async function toggleGameStatus(gameId, isFinal) {
    const status = isFinal ? 'finalized' : 'open';
    // Optimistic Update
    appData.gameStatuses[gameId] = status;
    refreshCurrentView(); // Re-render to update badges/labels

    try {
        await fetch('/api/admin/game-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId, status })
        });
    } catch(err) {
        console.error(err);
        alert('Failed to save status');
    }
}

if (!window.toggleGameStatus) window.toggleGameStatus = toggleGameStatus; // Export for onclick

function openGameDetail(gameId) {
    const game = appData.games.find(g => g.id === gameId);
    if (!game) return;

    if (activeGameId !== gameId) {
        activeGameId = gameId;
        detailSort = { col: 'troop_number', dir: 'asc' };

        // Update URL/History if we are already in detail view
        if (currentView === 'detail') {
            const url = new URL(window.location);
            url.searchParams.set('view', 'detail');
            url.searchParams.set('gameId', gameId);
            window.history.pushState({ view: 'detail', gameId: gameId }, '', url);
        }
    }

    const title = formatGameTitle(game);
    document.getElementById('detail-title').innerText = title;
    setSubtitle(title);
    const table = document.getElementById('detail-table');
    table.innerHTML = '';
    table.className = 'spreadsheet-table'; // Enforce spreadsheet look

    const sortOrderFn = (a, b) => (a.sortOrder ?? 900) - (b.sortOrder ?? 900);
    const allFields = [
        ...(game.fields || []),
        ...(appData.commonScoring || [])
    ].sort(sortOrderFn);

    const scoringFields = allFields.filter(f => f.id !== 'judge_notes');
    const notesField = allFields.find(f => f.id === 'judge_notes');

    // Filter and Enrich
    const gameScores = appData.scores.filter(s => s.game_id === gameId).map(score => {
        let total = 0;
        scoringFields.forEach(f => {
            // Only sum if kind is "points" or "penalty"
            if (f.kind === 'points' || f.kind === 'penalty') {
                const val = parseFloat(score.score_payload[f.id]);
                if (!isNaN(val)) {
                    if (f.kind === 'penalty') {
                        total -= val;
                    } else {
                        total += val;
                    }
                }
            }
        });
        return { ...score, _total: total };
    });

    // 1. Calculate Auto Ranks (Dense: 1, 1, 2)
    const sortedForRank = [...gameScores].sort((a,b) => (b._total || 0) - (a._total || 0));
    let currentAutoRank = 0;
    let lastTotal = null;
    sortedForRank.forEach(s => {
        if (s._total !== lastTotal) {
            currentAutoRank++;
            lastTotal = s._total;
        }
        s._autoRank = getOrdinalSuffix(currentAutoRank);
    });

    // 2. Finalize Rank/Points
    gameScores.forEach(s => {
        s._finalRank = s.score_payload.manual_rank || s._autoRank;
        const autoPts = getPointsForRank(s._finalRank);
        const mPts = s.score_payload.manual_points;
        s._finalPoints = (mPts !== undefined && mPts !== "" && mPts !== null) ? parseFloat(mPts) : autoPts;
    });

    // Sort Detail Table
    gameScores.sort((a, b) => {
        let valA, valB;
        if (detailSort.col === 'troop_number') {
            valA = parseInt(a.troop_number) || 0;
            valB = parseInt(b.troop_number) || 0;
        } else if (detailSort.col === 'entity_name') {
            valA = String(a.entity_name || '').toLowerCase();
            valB = String(b.entity_name || '').toLowerCase();
        } else if (detailSort.col === 'timestamp') {
            valA = new Date(a.timestamp).getTime();
            valB = new Date(b.timestamp).getTime();
        } else if (detailSort.col === '_total') {
            valA = a._total;
            valB = b._total;
        } else if (detailSort.col === '_finalRank') {
            const getRankNum = (v) => {
                const m = String(v).match(/\d+/);
                return m ? parseInt(m[0]) : 999;
            };
            valA = getRankNum(a._finalRank);
            valB = getRankNum(b._finalRank);
        } else if (detailSort.col === '_finalPoints') {
            valA = parseFloat(a._finalPoints) || 0;
            valB = parseFloat(b._finalPoints) || 0;
        } else {
            // Dynamic Field ID
            valA = a.score_payload[detailSort.col];
            valB = b.score_payload[detailSort.col];

            // Normalize for comparison
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            if (!isNaN(parseFloat(valA)) && !isNaN(parseFloat(valB))) {
                valA = parseFloat(valA);
                valB = parseFloat(valB);
            } else {
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            }
        }

        if (valA < valB) return detailSort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return detailSort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Build Headers
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const addSortBtn = (th, colId) => {
        th.style.cursor = 'pointer';
        th.classList.add('sortable-header');

        if (detailSort.col === colId) {
            const arrow = detailSort.dir === 'asc' ? ' ▲' : ' ▼';
            const innerDiv = th.querySelector('.header-text') || th.querySelector('div');
            if (innerDiv) {
                const arrowSpan = document.createElement('span');
                arrowSpan.innerText = arrow;
                innerDiv.appendChild(arrowSpan);
            } else {
                th.innerText += arrow;
            }
            th.classList.add('sorted');
        }

        th.onclick = () => {
            if (detailSort.col === colId) {
                detailSort.dir = detailSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                detailSort.col = colId;
                detailSort.dir = 'asc';
            }
            openGameDetail(gameId);
        };
    };

    const thTroop = createTh('Troop');
    addSortBtn(thTroop, 'troop_number');
    headerRow.appendChild(thTroop);

    const thName = createTh('Name');
    addSortBtn(thName, 'entity_name');
    headerRow.appendChild(thName);

    const thTime = createTh('Time');
    addSortBtn(thTime, 'timestamp');
    thTime.classList.add('collapsible-col');
    headerRow.appendChild(thTime);

    // Edit Column (Emoji only, positioned after Time)
    const thEdit = createTh('✏️');
    thEdit.classList.add('collapsible-col');
    headerRow.appendChild(thEdit);

    scoringFields.forEach(field => {
        const th = createTh(field.label);
        th.className += ' rotate-header';
        if (field.kind !== 'entryname') th.className += ' collapsible-col';
        th.title = field.label; // Tooltip for readability
        addSortBtn(th, field.id);
        headerRow.appendChild(th);
    });

    const thTotal = createTh('Game<br>Total');
    addSortBtn(thTotal, '_total');
    headerRow.appendChild(thTotal);

    const thRank = document.createElement('th');
    thRank.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:5px; padding:2px;">
            <div class="form-check form-switch p-0" style="min-height:auto; display:flex; align-items:center; justify-content:center;" onclick="event.stopPropagation()">
                <input class="form-check-input ms-0" type="checkbox" id="toggle-compact-view" ${finalMode ? 'checked' : ''} onchange="toggleFinalMode(this.checked)" style="transform: scale(0.9); cursor:pointer; margin-top:0;">
                <span class="fw-bold text-uppercase ms-1" style="font-size: 0.6rem; color:#666;">Final</span>
            </div>
            <div class="header-text" style="font-weight:bold; line-height:1.1;">Game<br>Rank</div>
        </div>
    `;
    addSortBtn(thRank, '_finalRank');
    headerRow.appendChild(thRank);

    const thPoints = createTh('Overall<br>Points');
    addSortBtn(thPoints, '_finalPoints');
    headerRow.appendChild(thPoints);

    if (notesField) {
        const thNotes = createTh('Notes');
        thNotes.style.minWidth = '250px';
        headerRow.appendChild(thNotes);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    gameScores.forEach(score => {
        const tr = document.createElement('tr');

        tr.appendChild(createTd(score.troop_number));
        tr.appendChild(createTd(score.entity_name));

        // Time format: HH:MM
        const ts = new Date(score.timestamp);
        const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const tdTime = createTd(timeStr);
        tdTime.classList.add('collapsible-col');
        tr.appendChild(tdTime);

        // Action: Edit (Positioned after Time, emoji only)
        const actionTd = document.createElement('td');
        actionTd.classList.add('collapsible-col');
        const btn = document.createElement('button');
        btn.innerHTML = '✏️';
        btn.className = 'btn-link';
        btn.onclick = () => showEditModal(score, game);
        actionTd.appendChild(btn);
        tr.appendChild(actionTd);

        scoringFields.forEach(field => {
            const val = score.score_payload[field.id];
            if (field.audience === 'admin') {
                const td = document.createElement('td');
                if (field.kind !== 'entryname') td.classList.add('collapsible-col');
                const input = document.createElement('input');
                input.className = 'admin-input';
                input.type = field.type === 'number' ? 'number' : 'text';
                input.value = val !== undefined ? val : (field.defaultValue || '');
                input.onchange = async () => {
                    let newVal = input.value;
                    if (field.type === 'number') {
                        newVal = parseFloat(input.value);
                        if (isNaN(newVal)) newVal = 0;
                    }
                    await updateScoreField(score.uuid, field.id, newVal);

                    // Live update the total if it's a points or penalty field
                    if (field.kind === 'points' || field.kind === 'penalty') {
                        // Recalculate local _total
                        let total = 0;
                        scoringFields.forEach(f => {
                            if (f.kind === 'points' || f.kind === 'penalty') {
                                const v = parseFloat(score.score_payload[f.id]);
                                if (!isNaN(v)) {
                                    if (f.kind === 'penalty') {
                                        total -= v;
                                    } else {
                                        total += v;
                                    }
                                }
                            }
                        });
                        score._total = total;
                        // Find the total cell in this row (it's the one before notes if notes exist, OR the last one otherwise)
                        // Actually, safer to just update the innerHTML of the total cell if we can find it.
                        // Or just trigger a re-render of the whole game detail if performance isn't an issue.
                        // Given the context, a re-render is simplest.
                        openGameDetail(activeGameId);
                    }
                };
                td.appendChild(input);
                tr.appendChild(td);
            } else {
                const td = createTd(formatValue(val, field.type));
                if (field.kind !== 'entryname') td.classList.add('collapsible-col');
                if (field.kind === 'penalty') {
                    td.style.color = 'red';
                    td.style.fontWeight = 'bold';
                }
                tr.appendChild(td);
            }
        });

        // Total Column
        tr.appendChild(createTd(`<strong>${score._total}</strong>`));

        // Rank Cell (Manual Input)
        const tdRank = document.createElement('td');
        const inputRank = document.createElement('input');
        inputRank.className = 'admin-input';
        inputRank.style.width = '50px';
        inputRank.value = score.score_payload.manual_rank || '';
        inputRank.placeholder = score._autoRank;
        inputRank.onchange = async () => {
            await updateScoreField(score.uuid, 'manual_rank', inputRank.value);
            openGameDetail(gameId);
        };
        tdRank.appendChild(inputRank);
        tr.appendChild(tdRank);

        // Placement Points Column (Manual Input)
        const tdPoints = document.createElement('td');
        const inputPoints = document.createElement('input');
        inputPoints.className = 'admin-input';
        inputPoints.type = 'number';
        inputPoints.style.width = '60px';
        inputPoints.value = (score.score_payload.manual_points !== undefined && score.score_payload.manual_points !== null) ? score.score_payload.manual_points : '';
        const autoPts = getPointsForRank(score._finalRank);
        inputPoints.placeholder = autoPts;
        inputPoints.onchange = async () => {
            let val = inputPoints.value;
            if (val !== "") val = parseFloat(val);
            else val = null;
            await updateScoreField(score.uuid, 'manual_points', val);
            openGameDetail(gameId);
        };
        tdPoints.appendChild(inputPoints);
        tr.appendChild(tdPoints);

        // Judge Notes (Last)
        if (notesField) {
            const val = score.score_payload[notesField.id] || '';
            const tdNotes = createTd(val);
            tdNotes.style.whiteSpace = 'normal';
            tdNotes.style.textAlign = 'left';
            tdNotes.style.minWidth = '200px';
            tr.appendChild(tdNotes);
        }

        tbody.appendChild(tr);
    });

    if (gameScores.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7 + scoringFields.length + (notesField ? 1 : 0);
        td.innerText = "No scores submitted yet.";
        td.style.textAlign = 'center';
        td.style.padding = '20px';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    switchView('detail');
}

function createTh(text) {
    const th = document.createElement('th');
    th.innerHTML = `<div>${text}</div>`;
    return th;
}

function createTd(text) {
    const td = document.createElement('td');
    td.innerHTML = text !== undefined && text !== null ? text : '-';
    return td;
}

function formatValue(val, type) {
    if (val === undefined || val === null) return '';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return val;
}

// --- Matrix View ---

function renderMatrix() {
    const table = document.getElementById('matrix-table');
    table.innerHTML = '';
    table.className = 'spreadsheet-table'; // Match the scoreboard look

    const modeTitle = currentViewMode.charAt(0).toUpperCase() + currentViewMode.slice(1);
    const lbTitle = `${modeTitle} Leader Board`;
    document.getElementById('matrix-title').innerText = lbTitle;
    setSubtitle(lbTitle);

    const entities = appData.entities.filter(e => e.type === currentViewMode);

    // Sort Entities
    entities.sort((a, b) => {
        const numA = parseInt(a.troop_number) || 0;
        const numB = parseInt(b.troop_number) || 0;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
    });

    const games = appData.games.filter(g => {
        const gType = g.type || 'patrol';
        return gType === currentViewMode;
    });

    if (matrixTranspose) {
        renderMatrixTransposed(table, games, entities);
    } else {
        renderMatrixNormal(table, games, entities);
    }
}

function renderMatrixNormal(table, games, patrols) {
    // 1. Calculate points map (points for every score)
    const pointsMap = calculateScoreContext();

    // 2. Calculate totals per patrol
    patrols.forEach(p => {
        let total = 0;
        games.forEach(g => {
            if (pointsMap[p.id] && pointsMap[p.id][g.id]) {
                total += pointsMap[p.id][g.id];
            }
        });
        p._leaderboardTotal = total;
    });

    // 3. Dense Rank the patrol leaderboard totals
    const sortedForRank = [...patrols].sort((a,b) => b._leaderboardTotal - a._leaderboardTotal);
    let curRank = 0;
    let lastLT = null;
    sortedForRank.forEach(p => {
        if (p._leaderboardTotal !== lastLT) {
            curRank++;
            lastLT = p._leaderboardTotal;
        }
        p._autoOverallRank = getOrdinalSuffix(curRank);
    });

    // 4. Sort patrols based on Leaderboard Total (desc) by default
    patrols.sort((a, b) => {
        if (b._leaderboardTotal !== a._leaderboardTotal) return b._leaderboardTotal - a._leaderboardTotal;
        const numA = parseInt(a.troop_number) || 0;
        const numB = parseInt(b.troop_number) || 0;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
    });

    // Header: Entity Info + Games
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createTh('Troop'));
    headerRow.appendChild(createTh(currentViewMode === 'patrol' ? 'Patrol' : 'Troop Name'));

    games.forEach(g => {
        // Shorten "Game n." to "G. n." to save space
        const th = createTh(formatGameTitle(g).replace(/^Game\s+(\d+)/, 'G.$1'));
        th.className = 'rotate-header';
        th.title = g.name;
        headerRow.appendChild(th);
    });

    const thTotal = createTh('Overall<br>Points');
    headerRow.appendChild(thTotal);

    const thRank = document.createElement('th');
    thRank.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:5px; padding:2px;">
            <div class="form-check form-switch p-0" style="min-height:auto; display:flex; align-items:center; justify-content:center;" onclick="event.stopPropagation()">
                <input class="form-check-input ms-0" type="checkbox" id="toggle-compact-view" ${finalMode ? 'checked' : ''} onchange="toggleFinalMode(this.checked)" style="transform: scale(0.9); cursor:pointer; margin-top:0;">
                <span class="fw-bold text-uppercase ms-1" style="font-size: 0.6rem; color:#666;">Final</span>
            </div>
            <div class="header-text" style="font-weight:bold; line-height:1.1;">Overall<br>Rank</div>
        </div>
    `;
    headerRow.appendChild(thRank);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    patrols.forEach(patrol => {
        const tr = document.createElement('tr');
        tr.appendChild(createTd(patrol.troop_number));
        tr.appendChild(createTd(patrol.name));

        games.forEach(game => {
            const pts = (pointsMap[patrol.id] && pointsMap[patrol.id][game.id]) || 0;
            const td = document.createElement('td');
            td.className = 'cell-center';
            if (pts > 0) {
                td.innerText = pts;
            } else {
                td.innerHTML = '<span style="color:#eee">0</span>';
            }
            tr.appendChild(td);
        });

        // Total Column
        const tdTotal = createTd(patrol._leaderboardTotal);
        tdTotal.style.fontWeight = 'bold';
        tdTotal.classList.add('cell-center');
        tr.appendChild(tdTotal);

        // Editable Rank Column
        const tdRank = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control form-control-sm';
        input.style.width = '100px';
        input.value = patrol.manual_rank || patrol._autoOverallRank;
        input.onchange = (e) => updateEntityField(patrol.id, 'manual_rank', e.target.value);
        tdRank.appendChild(input);
        tr.appendChild(tdRank);

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

function renderMatrixTransposed(table, games, patrols) {
    const pointsMap = calculateScoreContext();

    // Calculate totals per patrol
    patrols.forEach(p => {
        let total = 0;
        games.forEach(g => {
            if (pointsMap[p.id] && pointsMap[p.id][g.id]) {
                total += pointsMap[p.id][g.id];
            }
        });
        p._leaderboardTotal = total;
    });

    // Dense Rank the patrol leaderboard totals
    const sortedForRankTrans = [...patrols].sort((a,b) => b._leaderboardTotal - a._leaderboardTotal);
    let curRankTrans = 0;
    let lastLTTrans = null;
    sortedForRankTrans.forEach(p => {
        if (p._leaderboardTotal !== lastLTTrans) {
            curRankTrans++;
            lastLTTrans = p._leaderboardTotal;
        }
        p._autoOverallRank = getOrdinalSuffix(curRankTrans);
    });

    // Header: Game Name + Patrols
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createTh('Game Name'));

    patrols.forEach(p => {
        const th = createTh(`${p.troop_number}<br>${p.name}`);
        th.className = 'rotate-header';
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    games.forEach(game => {
        const tr = document.createElement('tr');
        tr.appendChild(createTd(formatGameTitle(game)));

        patrols.forEach(patrol => {
            const pts = (pointsMap[patrol.id] && pointsMap[patrol.id][game.id]) || 0;
            const td = document.createElement('td');
            td.className = 'cell-center';
            if (pts > 0) {
                td.innerText = pts;
            } else {
                td.innerHTML = '<span style="color:#eee">0</span>';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    // Add Net Score row
    const totalRow = document.createElement('tr');
    const tdLabel = createTd('Overall<br>Points');
    tdLabel.style.fontWeight = 'bold';
    totalRow.appendChild(tdLabel);
    patrols.forEach(p => {
        const td = createTd(p._leaderboardTotal);
        td.style.fontWeight = 'bold';
        td.className = 'cell-center';
        totalRow.appendChild(td);
    });
    tbody.appendChild(totalRow);

    // Add Overall Rank row
    const rankRow = document.createElement('tr');
    const tdRankLabel = createTd('Overall<br>Rank');
    tdRankLabel.style.fontWeight = 'bold';
    rankRow.appendChild(tdRankLabel);
    patrols.forEach(p => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control form-control-sm';
        input.style.width = '60px'; // Smaller for transposed
        input.value = p.manual_rank || p._autoOverallRank;
        input.onchange = (e) => updateEntityField(p.id, 'manual_rank', e.target.value);
        td.appendChild(input);
        rankRow.appendChild(td);
    });
    tbody.appendChild(rankRow);

    table.appendChild(tbody);
}

async function updateEntityField(entityId, fieldId, value) {
    const entity = appData.entities.find(e => e.id === entityId);
    if (!entity) return;

    // Update local copy
    entity[fieldId] = value;

    try {
        const response = await fetch('/api/entities/' + entityId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [fieldId]: value })
        });

        if (!response.ok) {
            throw new Error('Failed to update entity');
        }
    } catch (err) {
        console.error('Update failed:', err);
        alert('Failed to save change. Please refresh.');
    }
}
