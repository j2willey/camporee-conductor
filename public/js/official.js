import { formatGameTitle, getOrdinalSuffix, getPointsForRank } from './core/schema.js';
import { appData, loadData, updateDashboardHeader } from './core/data-store.js';
import { calculateScoreContext } from './core/leaderboard.js';
import { setSubtitle } from './core/ui.js';

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
    await loadData({ onHeaderUpdate: updateDashboardHeader });
    setupNavigation();

    // Handle initial route from URL
    const params = new URLSearchParams(window.location.search);
    const validViews = ['overview', 'matrix', 'detail', 'exhibition'];
    const view = validViews.includes(params.get('view')) ? params.get('view') : 'overview';
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
            switchView('overview', false);
        }
    });
});

function setupNavigation() {
    const navDashboard = document.getElementById('nav-dashboard');
    const transposeBtn = document.getElementById('btn-transpose');
    const viewModeSelect = document.getElementById('view-mode-select');
    const autoRefreshSwitch = document.getElementById('auto-refresh-switch');

    // Branding click navigates back to the main admin dashboard
    const brand = document.querySelector('header h1');
    if (brand) {
        brand.style.cursor = 'pointer';
        brand.onclick = () => { window.location.href = 'admin.html'; };
    }

    if (navDashboard) {
        navDashboard.addEventListener('click', () => { window.location.href = 'admin.html'; });
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
            // Always navigate to overview when the type changes
            if (currentView !== 'overview') {
                switchView('overview');
            } else {
                refreshCurrentView();
            }
        });
    }

    if (autoRefreshSwitch) {
        autoRefreshSwitch.addEventListener('change', (e) => {
            const loadOpts = { silent: true, onUpdate: refreshCurrentView, onHeaderUpdate: updateDashboardHeader };
            if (e.target.checked) {
                // Start Polling (15s)
                loadData(loadOpts); // Immediate fetch
                autoRefreshInterval = setInterval(() => loadData(loadOpts), 15000);
            } else {
                if (autoRefreshInterval) clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        });
    }
}

function handleBack() {
    switchView('overview');
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
    if (headerActions) headerActions.classList.remove('hidden');
    if (navBar) navBar.classList.remove('hidden');

    // Filter pull-down: only on the overview list
    if (viewName === 'overview') {
        if (modeFilter) modeFilter.classList.remove('hidden');
    } else {
        if (modeFilter) modeFilter.classList.add('hidden');
    }

    // Back Button: hidden on overview, visible on all drill-down views
    if (viewName === 'overview') {
        if (backBtn) backBtn.classList.add('hidden');
    } else {
        if (backBtn) backBtn.classList.remove('hidden');
    }

    if (pushToHistory) {
        const url = new URL(window.location);
        url.searchParams.set('view', viewName);
        if (viewName !== 'detail') url.searchParams.delete('gameId');
        window.history.pushState({ view: viewName, gameId: activeGameId }, '', url);
    }

    if (viewName === 'overview') {
        document.getElementById('view-overview').classList.remove('hidden');
        setSubtitle('Game Overview');
        refreshCurrentView();
    } else if (viewName === 'exhibition') {
        document.getElementById('view-exhibition').classList.remove('hidden');
        // subtitle and content set by openExhibitionDetail before calling switchView
    } else if (viewName === 'matrix') {
        document.getElementById('view-matrix').classList.remove('hidden');
        // renderMatrix sets its own subtitle
        renderMatrix();
    } else if (viewName === 'detail') {
        document.getElementById('view-detail').classList.remove('hidden');
    }
}
window.switchView = switchView;

// --- Score & Ranking Utils ---

// --- Overview ---

function renderOverviewList() {
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '';
    grid.style.display = 'block';

    // Exhibition events have their own list → per-game entry flow
    if (currentViewMode === 'exhibition') {
        renderExhibitionOverview(grid);
        return;
    }

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
        <td class="fw-bold">G0. Leader Board</td>
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
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') openGameDetail(game.id);
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
        await fetch(window.API_BASE + '/api/admin/game-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId, status })
        });
    } catch (err) {
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
        // Default sort: prioritize final_rank for bracket games
        if (game.bracketMode) {
            detailSort = { col: 'final_rank', dir: 'asc' };
        } else {
            detailSort = { col: 'troop_number', dir: 'asc' };
        }

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

    const scoreFields = allFields.filter(f => f.id !== 'judge_notes');
    const notesField = allFields.find(f => f.id === 'judge_notes');

    // Inject Heat/Round columns for bracketed games
    if (game.bracketMode) {
        const label = game.match_label || 'Match';
        scoreFields.unshift(
            { id: 'round', label: 'Round', audience: 'judge' },
            { id: 'heat', label: label, audience: 'judge' }
        );
    }

    // Filter, Deduplicate (for Bracket games), and Enrich
    let rawScores = appData.scores.filter(s => s.game_id === gameId);

    // DEDUPLICATION: If a team has multiple scores (e.g. from multiple heats),
    // we prioritize the one with a rank/manual_rank (Final Result), then the most recent.
    const deduped = {};
    rawScores.forEach(s => {
        const existing = deduped[s.entity_id];
        if (!existing) {
            deduped[s.entity_id] = s;
        } else {
            // Priority 1: Has manual_rank
            // Priority 2: Has rank
            // Priority 3: More recent timestamp
            const sHasRank = s.score_payload.manual_rank || s.score_payload.rank || s.score_payload.final_rank;
            const exHasRank = existing.score_payload.manual_rank || existing.score_payload.rank || existing.score_payload.final_rank;

            if (sHasRank && !exHasRank) {
                deduped[s.entity_id] = s;
            } else if (!exHasRank && s.timestamp > existing.timestamp) {
                deduped[s.entity_id] = s;
            } else if (sHasRank && exHasRank && s.timestamp > existing.timestamp) {
                // Both have rank, take the most recent (e.g. they corrected it)
                deduped[s.entity_id] = s;
            }
        }
    });
    rawScores = Object.values(deduped);

    const gameScores = rawScores.map(score => {
        let total = 0;
        scoreFields.forEach(f => {
            if (f.kind === 'points' || f.kind === 'penalty') {
                const val = parseFloat(score.score_payload[f.id]);
                if (!isNaN(val)) {
                    if (f.kind === 'penalty') total -= val;
                    else total += val;
                }
            } else if (f.kind === 'metric') {
                const pts = parseFloat(score.score_payload[f.id + '_pts']);
                if (!isNaN(pts)) total += pts;
            }
        });
        return { ...score, _total: total };
    });

    // 1. Calculate Auto Ranks (Dense: 1, 1, 2)
    const sortedForRank = [...gameScores].sort((a, b) => (b._total || 0) - (a._total || 0));
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
        // PRIORITY: Manual Admin Rank > Judge Tournament Rank > Auto-calculated Points Rank
        let judgeRank = s.score_payload.rank || s.score_payload.final_rank;
        if (judgeRank && !isNaN(parseInt(judgeRank))) {
            judgeRank = getOrdinalSuffix(parseInt(judgeRank));
        }

        s._finalRank = s.score_payload.manual_rank || judgeRank || s._autoRank;

        // For bracket games, if no rank is submitted at all, don't assume 1st.
        const game = appData.games.find(g => g.id === gameId);
        if (game && game.bracketMode && !s.score_payload.manual_rank && !judgeRank) {
            s._finalRank = "—";
        }

        const autoPts = getPointsForRank(s._finalRank);
        const mPts = s.score_payload.manual_points;
        s._finalPoints = (mPts !== undefined && mPts !== "" && mPts !== null) ? parseFloat(mPts) : autoPts;
    });

    // Sort Detail Table
    gameScores.sort((a, b) => {
        let valA, valB;
        if (detailSort.col === 'troop_number') {
            valA = parseInt(String(a.troop_number).replace(/^T/i,'')) || 0;
            valB = parseInt(String(b.troop_number).replace(/^T/i,'')) || 0;
        } else if (detailSort.col === 'entity_name') {
            valA = String(a.entity_name || '').toLowerCase();
            valB = String(b.entity_name || '').toLowerCase();
        } else if (detailSort.col === 'timestamp') {
            valA = new Date(a.timestamp).getTime();
            valB = new Date(b.timestamp).getTime();
        } else if (detailSort.col === '_total') {
            valA = a._total;
            valB = b._total;
        } else if (detailSort.col === '_finalRank' || detailSort.col === 'final_rank') {
            const getRankNum = (s) => {
                const val = s.score_payload.final_rank || s.score_payload.manual_rank || s.score_payload.rank || s._finalRank;
                const m = String(val).match(/\d+/);
                return m ? parseInt(m[0]) : 999;
            };
            valA = getRankNum(a);
            valB = getRankNum(b);

            // Fallback for ties (common in brackets or before finalization)
            if (valA === valB) {
                valA = a.score_payload.bracket_result || a._total || 0;
                valB = b.score_payload.bracket_result || b._total || 0;
            }
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

            // Time format MM:SS or H:MM:SS or MM:SS.ms → convert to seconds
            const timeRe = /^\d+:\d{2}(:\d{2})?(\.\d+)?$/;
            const toSec = (v) => {
                const parts = String(v).split(':').map(Number);
                if (parts.length === 2) return parts[0] * 60 + parts[1];
                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                return 0;
            };
            if (timeRe.test(String(valA)) && timeRe.test(String(valB))) {
                valA = toSec(valA);
                valB = toSec(valB);
            } else if (!isNaN(parseFloat(valA)) && !isNaN(parseFloat(valB))) {
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

    scoreFields.forEach(field => {
        const th = createTh(field.label);
        th.className += ' rotate-header';
        if (field.kind !== 'entryname') th.className += ' collapsible-col';
        if (field.kind === 'metric') th.classList.add('col-metric');
        th.title = field.label;
        addSortBtn(th, field.id);
        headerRow.appendChild(th);

        if (field.kind === 'metric') {
            const thPts = createTh(`${field.label}<br>Pts`);
            thPts.className += ' rotate-header collapsible-col col-metric-pts';
            thPts.title = `${field.label} — converted to points`;
            addSortBtn(thPts, field.id + '_pts');
            headerRow.appendChild(thPts);
        }
    });

    // Skip hardcoded columns for Brackets (they use dynamic schema fields)
    if (!game.bracketMode) {
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
    }

    if (notesField) {
        const thNotes = createTh('Notes');
        thNotes.style.minWidth = '250px';
        headerRow.appendChild(thNotes);
    }

    if (!game.bracketMode) {
        const thDQ = createTh('DQ');
        thDQ.style.minWidth = '60px';
        headerRow.appendChild(thDQ);
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

        scoreFields.forEach(field => {
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
                        scoreFields.forEach(f => {
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
                if (field.kind === 'metric') td.classList.add('col-metric');
                tr.appendChild(td);

                if (field.kind === 'metric') {
                    const tdPts = document.createElement('td');
                    tdPts.classList.add('collapsible-col', 'col-metric-pts');
                    const inputPts = document.createElement('input');
                    inputPts.className = 'admin-input';
                    inputPts.type = 'number';
                    inputPts.style.width = '55px';
                    const ptsVal = score.score_payload[field.id + '_pts'];
                    inputPts.value = (ptsVal !== undefined && ptsVal !== null) ? ptsVal : '';
                    inputPts.placeholder = '0';
                    inputPts.onchange = async () => {
                        const newVal = inputPts.value === '' ? null : parseFloat(inputPts.value);
                        await updateScoreField(score.uuid, field.id + '_pts', isNaN(newVal) ? 0 : newVal);
                        openGameDetail(activeGameId);
                    };
                    tdPts.appendChild(inputPts);
                    tr.appendChild(tdPts);
                }
            }
        });

        if (!game.bracketMode) {
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
        }

        // Judge Notes (Last)
        if (notesField) {
            const val = score.score_payload[notesField.id] || '';
            const tdNotes = createTd(val);
            tdNotes.style.whiteSpace = 'normal';
            tdNotes.style.textAlign = 'left';
            tdNotes.style.minWidth = '200px';
            tr.appendChild(tdNotes);
        }

        // DQ Column
        if (!game.bracketMode) {
            const tdDQ = document.createElement('td');
            tdDQ.style.textAlign = 'center';
            tdDQ.style.whiteSpace = 'nowrap';

            const unscoutVal = parseFloat(score.score_payload['unscout'] || score.score_payload['unscoutlike'] || 0);
            if (unscoutVal > 0) {
                const warn = document.createElement('span');
                warn.title = `Unscoutlike: ${unscoutVal}`;
                warn.style.cssText = 'color:#c05e00; font-size:1.1rem; margin-right:4px; cursor:default;';
                warn.textContent = '⚠';
                tdDQ.appendChild(warn);
            }

            const existingFlag = appData.flags.find(f => f.entity_id === score.entity_id && f.game_id === gameId);
            const isDQ = existingFlag && existingFlag.dq;
            const dqBtn = document.createElement('button');
            dqBtn.className = 'btn btn-sm ' + (isDQ ? 'btn-danger' : 'btn-outline-secondary');
            dqBtn.style.fontSize = '0.7rem';
            dqBtn.style.padding = '1px 6px';
            dqBtn.textContent = 'DQ';
            if (isDQ && existingFlag.reason) dqBtn.title = existingFlag.reason;
            dqBtn.onclick = async () => {
                if (isDQ) {
                    await setDQFlag(score.entity_id, gameId, 0);
                    openGameDetail(gameId);
                } else {
                    const reason = window.prompt(`DQ reason for ${score.entity_name}?\n(Enter to confirm, Cancel to abort)`);
                    if (reason === null) return;
                    await setDQFlag(score.entity_id, gameId, 1, reason);
                    openGameDetail(gameId);
                }
            };
            tdDQ.appendChild(dqBtn);
            tr.appendChild(tdDQ);
        }

        tbody.appendChild(tr);
    });

    if (gameScores.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        const baseColSpan = game.bracketMode ? 4 : 8;
        const metricCount = scoreFields.filter(f => f.kind === 'metric').length;
        td.colSpan = baseColSpan + scoreFields.length + metricCount + (notesField ? 1 : 0);
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
        const numA = parseInt(String(a.troop_number).replace(/^T/i,'')) || 0;
        const numB = parseInt(String(b.troop_number).replace(/^T/i,'')) || 0;
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
    const pointsMap = calculateScoreContext(appData);

    // Build unscoutlike lookup: entity_id -> Set of game_ids with non-zero unscout value
    const unscoutMap = {};
    appData.scores.forEach(s => {
        const val = parseFloat(s.score_payload['unscout'] || s.score_payload['unscoutlike'] || 0);
        if (val > 0) {
            if (!unscoutMap[s.entity_id]) unscoutMap[s.entity_id] = {};
            unscoutMap[s.entity_id][s.game_id] = val;
        }
    });

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

    // 3. Dense Rank — exclude patrols with overall DQ flag
    patrols.forEach(p => {
        p._overallExcluded = appData.flags.some(f => f.entity_id === p.id && f.game_id === 'overall' && f.dq);
    });
    const sortedForRank = [...patrols]
        .filter(p => !p._overallExcluded)
        .sort((a, b) => b._leaderboardTotal - a._leaderboardTotal);
    let curRank = 0;
    let lastLT = null;
    sortedForRank.forEach(p => {
        if (p._leaderboardTotal !== lastLT) {
            curRank++;
            lastLT = p._leaderboardTotal;
        }
        p._autoOverallRank = getOrdinalSuffix(curRank);
    });
    patrols.filter(p => p._overallExcluded).forEach(p => { p._autoOverallRank = '—'; });

    // 4. Sort patrols based on Leaderboard Total (desc) by default
    patrols.sort((a, b) => {
        if (b._leaderboardTotal !== a._leaderboardTotal) return b._leaderboardTotal - a._leaderboardTotal;
        const numA = parseInt(String(a.troop_number).replace(/^T/i,'')) || 0;
        const numB = parseInt(String(b.troop_number).replace(/^T/i,'')) || 0;
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

    const thDQOverall = createTh('Overall<br>DQ');
    thDQOverall.style.minWidth = '70px';
    headerRow.appendChild(thDQOverall);

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
            // Red cell + ⚠ if unscoutlike value recorded for this patrol in this game
            // Note: not all unscoutlike behavior is recorded — judge discretion applies
            const unscoutVal = unscoutMap[patrol.id] && unscoutMap[patrol.id][game.id];
            if (unscoutVal) {
                td.style.color = 'red';
                const warn = document.createElement('span');
                warn.style.cssText = 'color:#c05e00; font-size:1rem; margin-left:3px; cursor:default;';
                warn.title = `Unscoutlike behavior recorded: ${unscoutVal} pt(s). Note: not all incidents may be recorded.`;
                warn.textContent = '⚠';
                td.appendChild(warn);
            }
            // Red DQ badge if officially flagged
            const gameFlag = appData.flags.find(f => f.entity_id === patrol.id && f.game_id === game.id && f.dq);
            if (gameFlag) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-danger ms-1';
                badge.style.fontSize = '0.55rem';
                badge.title = gameFlag.reason || 'DQ';
                badge.textContent = 'DQ';
                td.appendChild(badge);
            }
            tr.appendChild(td);
        });

        // Total Column
        const tdTotal = createTd(patrol._leaderboardTotal);
        tdTotal.style.fontWeight = 'bold';
        tdTotal.classList.add('cell-center');
        if (patrol._overallExcluded) tdTotal.style.opacity = '0.4';
        tr.appendChild(tdTotal);

        // Overall Rank
        const tdRank = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control form-control-sm';
        input.style.width = '90px';
        input.value = patrol.manual_rank || patrol._autoOverallRank;
        if (patrol._overallExcluded) { input.value = '—'; input.disabled = true; input.style.opacity = '0.5'; }
        input.onchange = (e) => updateEntityField(patrol.id, 'manual_rank', e.target.value);
        tdRank.appendChild(input);
        tr.appendChild(tdRank);

        // Overall DQ column
        const tdDQOverall = document.createElement('td');
        tdDQOverall.style.textAlign = 'center';
        const overallFlag = appData.flags.find(f => f.entity_id === patrol.id && f.game_id === 'overall');
        const isDQOverall = overallFlag && overallFlag.dq;
        const dqOverallBtn = document.createElement('button');
        dqOverallBtn.className = 'btn btn-sm ' + (isDQOverall ? 'btn-danger' : 'btn-outline-danger');
        dqOverallBtn.style.cssText = 'font-size:0.75rem; padding:2px 8px; font-weight:bold;';
        dqOverallBtn.textContent = isDQOverall ? '✓ DQ' : 'DQ';
        dqOverallBtn.title = isDQOverall ? ('DQ — ' + (overallFlag.reason || 'no reason given') + ' (click to remove)') : 'Disqualify from Overall standings';
        dqOverallBtn.onclick = async () => {
            if (isDQOverall) {
                await setDQFlag(patrol.id, 'overall', 0);
            } else {
                const reason = window.prompt(`DQ ${patrol.name} from Overall standings?\nReason (optional):`);
                if (reason === null) return;
                await setDQFlag(patrol.id, 'overall', 1, reason);
            }
            renderMatrix();
        };
        tdDQOverall.appendChild(dqOverallBtn);
        tr.appendChild(tdDQOverall);

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

function renderMatrixTransposed(table, games, patrols) {
    const pointsMap = calculateScoreContext(appData);

    const unscoutMap = {};
    appData.scores.forEach(s => {
        const val = parseFloat(s.score_payload['unscout'] || s.score_payload['unscoutlike'] || 0);
        if (val > 0) {
            if (!unscoutMap[s.entity_id]) unscoutMap[s.entity_id] = {};
            unscoutMap[s.entity_id][s.game_id] = val;
        }
    });

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
    const sortedForRankTrans = [...patrols].sort((a, b) => b._leaderboardTotal - a._leaderboardTotal);
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
            const unscoutVal = unscoutMap[patrol.id] && unscoutMap[patrol.id][game.id];
            if (unscoutVal) {
                td.style.color = 'red';
                const warn = document.createElement('span');
                warn.style.cssText = 'color:#c05e00; font-size:1rem; margin-left:3px; cursor:default;';
                warn.title = `Unscoutlike behavior recorded: ${unscoutVal} pt(s). Note: not all incidents may be recorded.`;
                warn.textContent = '⚠';
                td.appendChild(warn);
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

async function setDQFlag(entityId, gameId, dq, reason = '') {
    const flag = appData.flags.find(f => f.entity_id === entityId && f.game_id === gameId);
    if (flag) { flag.dq = dq ? 1 : 0; flag.reason = reason; }
    else if (dq) appData.flags.push({ entity_id: entityId, game_id: gameId, dq: 1, reason });
    else appData.flags = appData.flags.filter(f => !(f.entity_id === entityId && f.game_id === gameId));

    try {
        const response = await fetch(window.API_BASE + '/api/official/flags/' + encodeURIComponent(gameId) + '/' + encodeURIComponent(entityId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dq: dq ? 1 : 0, reason })
        });
        if (!response.ok) throw new Error('Failed to set flag');
    } catch (err) {
        console.error('DQ flag update failed:', err);
        alert('Failed to save DQ flag. Please refresh.');
    }
}

async function updateScoreField(uuid, fieldId, value) {
    const score = appData.scores.find(s => s.uuid === uuid);
    if (!score) return;

    score.score_payload[fieldId] = value;

    try {
        const response = await fetch(window.API_BASE + '/api/scores/' + uuid, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score_payload: score.score_payload })
        });

        if (!response.ok) throw new Error('Failed to update score');
    } catch (err) {
        console.error('Update failed:', err);
        alert('Failed to save change. Please refresh.');
    }
}

async function updateEntityField(entityId, fieldId, value) {
    const entity = appData.entities.find(e => e.id === entityId);
    if (!entity) return;

    entity[fieldId] = value;

    try {
        const response = await fetch(window.API_BASE + '/api/entities/' + entityId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [fieldId]: value })
        });

        if (!response.ok) throw new Error('Failed to update entity');
    } catch (err) {
        console.error('Update failed:', err);
        alert('Failed to save change. Please refresh.');
    }
}

// --- EXHIBITION EVENTS ---

const exhibitionSaveTimers = {};
const exhibitionRowData = {};

function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderExhibitionOverview(grid) {
    const exhibitionGames = (appData.games || [])
        .filter(g => g.type === 'exhibition')
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    if (!exhibitionGames.length) {
        grid.innerHTML = '<p class="text-muted p-3">No exhibition events in the active cartridge.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped table-hover';
    table.innerHTML = `
        <thead class="table-dark">
            <tr>
                <th>Exhibition Event</th>
                <th class="text-center">Status</th>
                <th class="text-end">Action</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    exhibitionGames.forEach((game, idx) => {
        const label = `E${idx + 1} ${game.content?.title || game.id}`;
        const isFinal = appData.gameStatuses[game.id] === 'finalized';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') openExhibitionDetail(game.id);
        };

        tr.innerHTML = `
            <td class="fw-bold">${escapeAttr(label)}</td>
            <td class="text-center">
                <div class="form-check form-switch d-inline-block">
                    <input class="form-check-input" type="checkbox" id="status_${game.id}" ${isFinal ? 'checked' : ''} onclick="toggleGameStatus('${game.id}', this.checked)">
                    <label class="form-check-label small ${isFinal ? 'text-success fw-bold' : 'text-muted'}" for="status_${game.id}">${isFinal ? 'Final' : 'Draft'}</label>
                </div>
            </td>
            <td class="text-end">
                <button class="btn btn-sm btn-warning">Enter Results</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    grid.appendChild(table);
}

async function openExhibitionDetail(gameId) {
    const game = appData.games.find(g => g.id === gameId);
    if (!game) return;

    activeGameId = gameId;

    const exGames = (appData.games || [])
        .filter(g => g.type === 'exhibition')
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const idx = exGames.findIndex(g => g.id === gameId);
    const title = `E${idx + 1} ${game.content?.title || game.id}`;

    setSubtitle(title);

    const container = document.getElementById('exhibition-container');
    if (container) container.innerHTML = '<p class="text-muted small p-3">Loading…</p>';

    switchView('exhibition');

    const rows = await fetch(`${window.API_BASE}/api/exhibition-results/${gameId}`)
        .then(r => r.json()).catch(() => []);

    exhibitionRowData[gameId] = rows.map(r => ({ ...r }));

    if (container) container.innerHTML = buildExhibitionEntryTable(gameId, rows);
}

function buildExhibitionEntryTable(gameId, rows) {
    const rowsHtml = rows.map((row, i) => buildExhibitionRow(gameId, i, row)).join('');
    return `
        <div class="table-responsive">
        <table class="table table-sm table-bordered align-middle mb-2">
            <thead class="table-dark">
                <tr>
                    <th>Name</th>
                    <th style="min-width:80px">Troop #</th>
                    <th style="min-width:110px">Patrol</th>
                    <th style="min-width:130px">Place</th>
                    <th>Judges Notes</th>
                    <th></th>
                </tr>
            </thead>
            <tbody id="ex-tbody-${gameId}">${rowsHtml}</tbody>
        </table>
        </div>
        <div class="d-flex align-items-center gap-3">
            <button class="btn btn-sm btn-outline-success" onclick="addExhibitionRow('${gameId}')">+ Add Scout</button>
            <span class="text-muted small" id="ex-save-${gameId}"></span>
        </div>`;
}

function buildExhibitionRow(gameId, rowIdx, row) {
    return `<tr data-game="${gameId}" data-row="${rowIdx}">
        <td><input type="text" class="form-control form-control-sm"
            data-field="scout_name" value="${escapeAttr(row.scout_name)}"
            oninput="exhibitionChanged('${gameId}', this)"></td>
        <td><input type="text" class="form-control form-control-sm"
            data-field="troop_number" value="${escapeAttr(row.troop_number)}"
            oninput="exhibitionChanged('${gameId}', this)"></td>
        <td><input type="text" class="form-control form-control-sm"
            data-field="patrol_name" value="${escapeAttr(row.patrol_name)}"
            oninput="exhibitionChanged('${gameId}', this)"></td>
        <td><input type="text" class="form-control form-control-sm" list="ex-places-list"
            data-field="overall_place" value="${escapeAttr(row.overall_place)}"
            oninput="exhibitionChanged('${gameId}', this)"></td>
        <td><input type="text" class="form-control form-control-sm"
            data-field="judges_notes" value="${escapeAttr(row.judges_notes)}"
            oninput="exhibitionChanged('${gameId}', this)"></td>
        <td><button class="btn btn-sm btn-outline-danger px-2"
            onclick="deleteExhibitionRow('${gameId}', this)" title="Remove row">×</button></td>
    </tr>`;
}

function reRenderExhibitionTbody(gameId) {
    const tbody = document.getElementById(`ex-tbody-${gameId}`);
    if (!tbody) return;
    const rows = exhibitionRowData[gameId] || [];
    tbody.innerHTML = rows.map((row, i) => buildExhibitionRow(gameId, i, row)).join('');
}

function exhibitionChanged(gameId, inputEl) {
    const tr = inputEl.closest('tr');
    const field = inputEl.dataset.field;
    const rowIdx = parseInt(tr.dataset.row);
    if (!exhibitionRowData[gameId]) exhibitionRowData[gameId] = [];
    if (!exhibitionRowData[gameId][rowIdx]) exhibitionRowData[gameId][rowIdx] = {};
    exhibitionRowData[gameId][rowIdx][field] = inputEl.value;
    scheduleExhibitionSave(gameId);
}

function addExhibitionRow(gameId) {
    if (!exhibitionRowData[gameId]) exhibitionRowData[gameId] = [];
    exhibitionRowData[gameId].push({ scout_name: '', troop_number: '', patrol_name: '', overall_place: '', judges_notes: '' });
    reRenderExhibitionTbody(gameId);
    // Focus the first input of the new row
    const tbody = document.getElementById(`ex-tbody-${gameId}`);
    if (tbody && tbody.lastElementChild) {
        tbody.lastElementChild.querySelector('input')?.focus();
    }
    scheduleExhibitionSave(gameId);
}

function deleteExhibitionRow(gameId, btn) {
    const tr = btn.closest('tr');
    const rowIdx = parseInt(tr.dataset.row);
    if (!exhibitionRowData[gameId]) return;
    exhibitionRowData[gameId].splice(rowIdx, 1);
    reRenderExhibitionTbody(gameId);
    scheduleExhibitionSave(gameId);
}

function scheduleExhibitionSave(gameId) {
    const indicator = document.getElementById(`ex-save-${gameId}`);
    if (indicator) indicator.textContent = 'Saving…';
    if (exhibitionSaveTimers[gameId]) clearTimeout(exhibitionSaveTimers[gameId]);
    exhibitionSaveTimers[gameId] = setTimeout(() => saveExhibitionResults(gameId), 800);
}

async function saveExhibitionResults(gameId) {
    const indicator = document.getElementById(`ex-save-${gameId}`);
    try {
        const res = await fetch(`${window.API_BASE}/api/exhibition-results/${gameId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(exhibitionRowData[gameId] || [])
        });
        if (!res.ok) throw new Error('Save failed');
        if (indicator) {
            indicator.textContent = '✓ Saved';
            setTimeout(() => { if (indicator) indicator.textContent = ''; }, 2000);
        }
    } catch (err) {
        console.error('Exhibition save error:', err);
        if (indicator) indicator.textContent = '⚠ Error saving';
    }
}

window.addExhibitionRow    = addExhibitionRow;
window.deleteExhibitionRow = deleteExhibitionRow;
window.exhibitionChanged   = exhibitionChanged;
window.openExhibitionDetail = openExhibitionDetail;
