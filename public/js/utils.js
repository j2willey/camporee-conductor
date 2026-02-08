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
    // const params = new URLSearchParams(window.location.search);
    // const view = params.get('view') || 'dashboard';
    // const gameId = params.get('gameId');

    // Handle initial route from URL
    const hash = window.location.hash.substring(1); // Remove the '#'
    const view = hash || 'awards';

    // --- SURGICAL FIX START ---
    const params = new URLSearchParams(window.location.search); // Define it!
    const gameId = params.get('gameId');
    // --- SURGICAL FIX END ---

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

    const copyEmailsBtn = document.getElementById('btn-copy-emails');
    if (copyEmailsBtn) copyEmailsBtn.onclick = copyJudgeEmails;

    const exportAwardsBtn = document.getElementById('btn-export-awards');
    if (exportAwardsBtn) {
        // Awards CSV: Winners List (Processed Client-Side)
        exportAwardsBtn.onclick = () => exportAwardsCSV();
    }

    const createStickersBtn = document.getElementById('btn-create-stickers');
    if (createStickersBtn) {
        createStickersBtn.onclick = () => renderStickers(false);
    }

    const printPreviewBtn = document.getElementById('btn-print-preview');
    if (printPreviewBtn) {
        printPreviewBtn.onclick = () => window.print();
    }

    // Form Listener
    const regForm = document.getElementById('reg-form');
    if (regForm) {
        regForm.addEventListener('submit', handleRegistration);
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
    } else if (viewName === 'awards') {
        document.getElementById('view-awards').classList.remove('hidden');
        setSubtitle('Awards & Exports');
    } else if (viewName === 'debug') {
        document.getElementById('view-debug').classList.remove('hidden');
        setSubtitle('System Tools');
    } else if (viewName === 'qrcode') {
        document.getElementById('view-qrcode').classList.remove('hidden');
        setSubtitle('QR Generator');
        const urlInput = document.getElementById('qr-url');
        if (urlInput && !urlInput.value) {
            urlInput.value = window.location.origin;
        }
    }
}

window.switchView = switchView;

function setSubtitle(text) {
    const subtitle = document.getElementById('header-subtitle');
    if (subtitle) {
        subtitle.innerText = text ? ` - ${text}` : '';
    }
}

function getWinnersRegistry() {
    const registry = [];
    const pointsMap = calculateScoreContext();

    // 1. Individual Games
    const games = appData.games.filter(g => (g.type || 'patrol') === currentViewMode);

    games.forEach(game => {
        // Calculate scores for this game
        const gameScores = appData.scores.filter(s => s.game_id === game.id).map(score => {
            let total = 0;
            const fields = [...(game.fields || []), ...(appData.commonScoring || [])];
            fields.forEach(f => {
                if (f.kind === 'points' || f.kind === 'penalty') {
                    const val = parseFloat(score.score_payload[f.id]);
                    if (!isNaN(val)) {
                        if (f.kind === 'penalty') total -= val;
                        else total += val;
                    }
                }
            });
            return { ...score, _total: total };
        });

        // Sort
        const sorted = [...gameScores].sort((a,b) => b._total - a._total);
        let curRank = 0;
        let lastT = null;

        // Entry fields for this game
        const entryFields = [...(game.fields || []), ...(appData.commonScoring || [])].filter(f => f.kind === 'entryname');

        sorted.forEach(s => {
            if (s._total !== lastT) {
                curRank++;
                lastT = s._total;
            }
            s._autoRank = getOrdinalSuffix(curRank);
            const finalRank = s.score_payload.manual_rank || s._autoRank;
            const rankClean = String(finalRank).toLowerCase().trim();
            const topRanks = ['1', '1st', '2', '2nd', '3', '3rd'];

            if (topRanks.includes(rankClean)) {
                // Construct line4Text
                let line4 = `${finalRank} Place - T${s.troop_number}`;
                if (currentViewMode === 'patrol') {
                    line4 += ` ${s.entity_name}`;
                }
                const entryVals = entryFields.map(f => s.score_payload[f.id]).filter(v => v).join(", ");
                if (entryVals) line4 += `, ${entryVals}`;

                // Collect entry values
                const entryData = {};
                entryFields.forEach(f => {
                    entryData[f.id] = s.score_payload[f.id];
                });

                registry.push({
                    type: 'game',
                    gameId: game.id,
                    gameName: formatGameTitle(game),
                    rank: finalRank,
                    entityName: s.entity_name,
                    troopNumber: s.troop_number,
                    line4Text: line4,
                    entryData: entryData
                });
            }
        });
    });

    // 2. Overall Leaderboard
    const entities = appData.entities.filter(e => e.type === currentViewMode);
    entities.forEach(p => {
        let total = 0;
        games.forEach(g => {
            if (pointsMap[p.id] && pointsMap[p.id][g.id]) {
                total += pointsMap[p.id][g.id];
            }
        });
        p._leaderboardTotal = total;
    });

    const lbSorted = [...entities].sort((a,b) => b._leaderboardTotal - a._leaderboardTotal);
    let curLBRank = 0;
    let lastLBT = null;

    lbSorted.forEach(p => {
        if (p._leaderboardTotal !== lastLBT) {
            curLBRank++;
            lastLBT = p._leaderboardTotal;
        }
        p._autoOverallRank = getOrdinalSuffix(curLBRank);
        const finalRank = p.manual_rank || p._autoOverallRank;
        const rankClean = String(finalRank).toLowerCase().trim();
        const topRanks = ['1', '1st', '2', '2nd', '3', '3rd'];

        if (topRanks.includes(rankClean) || (p.manual_rank && p.manual_rank.length > 0)) {
            let line4 = `${finalRank}${topRanks.includes(rankClean) ? " Place" : ""} - T${p.troop_number}`;
            if (currentViewMode === 'patrol') {
                line4 += ` ${p.name}`;
            }

            registry.push({
                type: 'overall',
                gameId: 'OVERALL',
                gameName: "OVERALL",
                rank: finalRank,
                entityName: p.name,
                troopNumber: p.troop_number,
                line4Text: line4,
                entryData: {}
            });
        }
    });

    return registry;
}

function exportAwardsCSV() {
    const el1 = document.getElementById('awards-line1');
    const el2 = document.getElementById('awards-line2');
    const line1 = el1?.value || el1?.placeholder || "";
    const line2 = el2?.value || el2?.placeholder || "";

    const rows = [];
    if (line1) rows.push([line1]);
    if (line2) rows.push([line2]);
    if (line1 || line2) rows.push([]); // Spacer row

    rows.push(["Category", "Rank", "Entity Name", "Troop #"]);

    // 1. All Individual Games
    const games = appData.games.filter(g => (g.type || 'patrol') === currentViewMode);

    // Identify any "entryname" fields across these games to include in the export
    const entryNameFieldConfigs = [];
    games.forEach(g => {
        const fields = [...(g.fields||[]), ...(appData.commonScoring||[])];
        fields.forEach(f => {
            if (f.kind === 'entryname' && !entryNameFieldConfigs.find(x => x.id === f.id)) {
                entryNameFieldConfigs.push(f);
            }
        });
    });

    rows.push(["Category", "Rank", "Entity Name", "Troop #", ...entryNameFieldConfigs.map(f => f.label)]);

    const winners = getWinnersRegistry();

    winners.forEach(w => {
        const row = [
            w.gameName,
            w.rank,
            w.entityName,
            w.troopNumber
        ];
        entryNameFieldConfigs.forEach(f => {
            row.push(w.entryData[f.id] || "");
        });
        rows.push(row);
    });

    if (rows.length === 1) {
        alert("No award-level ranks found yet.");
        return;
    }

    const csvContent = "data:text/csv;charset=utf-8,"
        + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Camporee_Awards_${currentViewMode}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderStickers(autoPrint = true) {
    const el1 = document.getElementById('awards-line1');
    const el2 = document.getElementById('awards-line2');
    const headerLine1 = el1?.value || "";
    const headerLine2 = el2?.value || "";

    const winners = getWinnersRegistry();
    const resultsByGroup = []; // Each item is { title: string, winners: [] }
    let currentGroup = null;

    winners.forEach(w => {
        const groupTitle = w.type === 'overall' ? 'OVERALL LEADERBOARD' : w.gameName;

        if (!currentGroup || currentGroup.id !== w.gameId) {
            currentGroup = {
                id: w.gameId,
                title: groupTitle,
                winners: []
            };
            resultsByGroup.push(currentGroup);
        }

        currentGroup.winners.push({
            gameName: groupTitle,
            line4: w.line4Text
        });
    });

    if (resultsByGroup.length === 0) {
        alert("No awards found to print.");
        return;
    }

    // Build the table(s)
    const printContainer = document.getElementById('stickers-container');
    const previewWrapper = document.getElementById('stickers-preview-table-wrapper');
    const previewContainer = document.getElementById('stickers-preview-container');
    const printBtn = document.getElementById('btn-print-preview');

    printContainer.innerHTML = '';
    previewWrapper.innerHTML = '';

    const printTable = document.createElement('table');
    printTable.className = 'sticker-table';

    const previewTable = document.createElement('table');
    previewTable.className = 'sticker-preview-table';

    resultsByGroup.forEach(group => {
        let cellsInCurrentRow = 0;
        let trPrint = document.createElement('tr');
        let trPreview = document.createElement('tr');

        printTable.appendChild(trPrint);
        previewTable.appendChild(trPreview);

        group.winners.forEach((w, idx) => {
            if (cellsInCurrentRow === 3) {
                trPrint = document.createElement('tr');
                trPreview = document.createElement('tr');
                printTable.appendChild(trPrint);
                previewTable.appendChild(trPreview);
                cellsInCurrentRow = 0;
            }

            const innerHtml = `
                <div class="sticker-content">
                    ${headerLine1 ? `<div class="sticker-header">${headerLine1}</div>` : ''}
                    ${headerLine2 ? `<div class="sticker-header">${headerLine2}</div>` : ''}
                    <div class="sticker-game">${w.gameName}</div>
                    <div class="sticker-info">${w.line4}</div>
                </div>
            `;

            const tdPrint = document.createElement('td');
            tdPrint.innerHTML = innerHtml;
            trPrint.appendChild(tdPrint);

            const tdPreview = document.createElement('td');
            tdPreview.innerHTML = innerHtml;
            trPreview.appendChild(tdPreview);

            cellsInCurrentRow++;
        });

        // Pad the remainder
        if (cellsInCurrentRow > 0 && cellsInCurrentRow < 3) {
            for (let i = cellsInCurrentRow; i < 3; i++) {
                trPrint.appendChild(document.createElement('td'));
                trPreview.appendChild(document.createElement('td'));
            }
        }
    });

    printContainer.appendChild(printTable);
    previewWrapper.appendChild(previewTable);

    // Show preview area
    if (previewContainer) previewContainer.classList.remove('hidden');
    if (printBtn) printBtn.classList.remove('hidden');

    if (autoPrint) {
        window.print();
    } else {
        // Scroll to preview
        previewContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

function toggleFinalMode(checked) {
    finalMode = checked;
    const main = document.querySelector('main');
    if (main) {
        if (finalMode) main.classList.add('compact-mode');
        else main.classList.remove('compact-mode');
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

function getFilteredGames() {
    return appData.games.filter(g => {
        const gType = g.type || 'patrol';
        return gType === currentViewMode;
    });
}


// --- Registration View (Tree) ---

// --- Editing Support ---

// (Old handleRegistration removed)



// --- Editing Support ---





// --- QR Code Generator ---
let qrMode = 'wifi';

function setQrMode(mode) {
    qrMode = mode;
    const wifiTab = document.getElementById('tab-wifi');
    const urlTab = document.getElementById('tab-url');
    const wifiForm = document.getElementById('qr-wifi-form');
    const urlForm = document.getElementById('qr-url-form');

    if (mode === 'wifi') {
        wifiTab.classList.add('active');
        urlTab.classList.remove('active');
        wifiForm.classList.remove('hidden');
        urlForm.classList.add('hidden');
    } else {
        wifiTab.classList.remove('active');
        urlTab.classList.add('active');
        wifiForm.classList.add('hidden');
        urlForm.classList.remove('hidden');
    }
    // Clear previous QR
    document.getElementById('qr-output').innerHTML = '';
}

function generateQRCode() {
    const container = document.getElementById('qr-output');
    container.innerHTML = '';

    let text = '';
    let title = '';
    let instructions = '';

    if (qrMode === 'wifi') {
        const ssid = document.getElementById('qr-ssid').value.trim();
        const password = document.getElementById('qr-password').value.trim();
        const encryption = document.getElementById('qr-encryption').value;
        title = document.getElementById('qr-wifi-title').value.trim();
        instructions = document.getElementById('qr-wifi-instructions').value.trim();

        if (!ssid) {
            alert('Please enter an SSID');
            return;
        }
        // WIFI:T:WPA;S:mynetwork;P:mypass;;
        text = `WIFI:T:${encryption};S:${ssid};P:${password};;`;
    } else {
        const url = document.getElementById('qr-url').value.trim();
        title = document.getElementById('qr-url-title').value.trim();
        instructions = document.getElementById('qr-url-instructions').value.trim();
        if (!url) {
            alert('Please enter a URL');
            return;
        }

        // Append Judge Params if present
        const jName = document.getElementById('qr-judge-name').value.trim();
        const jEmail = document.getElementById('qr-judge-email').value.trim();
        const jUnit = document.getElementById('qr-judge-unit').value.trim();

        if (jEmail) {
            const urlObj = new URL(url);
            urlObj.searchParams.set('judge_email', jEmail);
            if (jName) urlObj.searchParams.set('judge_name', jName);
            if (jUnit) urlObj.searchParams.set('judge_unit', jUnit);
            text = urlObj.toString();
        } else {
        text = url;
        }
    }

    if (typeof QRCode === 'undefined') {
        container.innerHTML = '<div class="alert alert-danger">QR Library not loaded. Please ensure you have internet access or have downloaded qrcode.min.js to public/js/.</div>';
        return;
    }

    // Create a printable wrapper
    const wrapper = document.createElement('div');
    wrapper.style.textAlign = 'center';
    wrapper.style.padding = '20px';
    wrapper.style.border = '1px solid #ccc';
    wrapper.style.borderRadius = '8px';
    wrapper.style.backgroundColor = 'white';
    wrapper.style.display = 'inline-block';

    if (title) {
        const h2 = document.createElement('h2');
        h2.innerText = title;
        h2.style.marginBottom = '20px';
        wrapper.appendChild(h2);
    }

    const qrDiv = document.createElement('div');
    qrDiv.style.display = 'inline-block';
    wrapper.appendChild(qrDiv);

    if (instructions) {
        const p = document.createElement('p');
        p.innerText = instructions;
        p.style.marginTop = '20px';
        p.style.whiteSpace = 'pre-wrap';
        p.style.fontSize = '1.1rem';
        wrapper.appendChild(p);
    }

    container.appendChild(wrapper);

    new QRCode(qrDiv, {
        text: text,
        width: 256,
        height: 256
    });

    const printBtn = document.createElement('button');
    printBtn.className = 'btn btn-secondary mt-3 no-print';
    printBtn.innerText = '🖨️ Print QR Code';
    printBtn.onclick = () => window.print();
    container.appendChild(printBtn);
}

window.setQrMode = setQrMode;
window.generateQRCode = generateQRCode;





// --- QR Code Generator ---
