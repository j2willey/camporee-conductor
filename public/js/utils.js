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
            window.location.href = 'admin.html';
        }
    });
});

function setupNavigation() {
    const navDashboard = document.getElementById('nav-dashboard');
    const transposeBtn = document.getElementById('btn-transpose');
    const viewModeSelect = document.getElementById('view-mode-select');
    const clearScoresBtn = document.getElementById('btn-clear-scores');
    const resetDbBtn = document.getElementById('btn-reset-db');
    const exportRawBtn = document.getElementById('btn-export-raw');
    const autoRefreshSwitch = document.getElementById('auto-refresh-switch');

    // Theme Color Picker — seed pickers from current CSS variables then wire buttons
    const sysColorMain = document.getElementById('sysColorMain');
    const sysColorHeader = document.getElementById('sysColorHeader');
    const sysColorAccent = document.getElementById('sysColorAccent');
    if (sysColorMain) {
        const rootStyle = getComputedStyle(document.documentElement);
        const toHex = (cssVar) => {
            const val = rootStyle.getPropertyValue(cssVar).trim();
            // CSS vars may be hex or rgb; if hex just use it
            if (val.startsWith('#')) return val;
            return val || null;
        };
        const currentMain = toHex('--brand-main');
        const currentHeader = toHex('--brand-header');
        const currentAccent = toHex('--brand-accent');
        if (currentMain) sysColorMain.value = currentMain;
        if (currentHeader) sysColorHeader.value = currentHeader;
        if (currentAccent) sysColorAccent.value = currentAccent;

        document.getElementById('btn-apply-colors').onclick = () => {
            document.documentElement.style.setProperty('--brand-main', sysColorMain.value);
            document.documentElement.style.setProperty('--brand-header', sysColorHeader.value);
            document.documentElement.style.setProperty('--brand-accent', sysColorAccent.value);
            document.getElementById('color-save-status').textContent = 'Preview applied (not saved yet).';
        };

        document.getElementById('btn-save-colors').onclick = async () => {
            const statusEl = document.getElementById('color-save-status');
            try {
                const res = await fetch(window.API_BASE + '/api/meta/theme-colors', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        main: sysColorMain.value,
                        header: sysColorHeader.value,
                        accent: sysColorAccent.value
                    })
                });
                if (res.ok) {
                    document.documentElement.style.setProperty('--brand-main', sysColorMain.value);
                    document.documentElement.style.setProperty('--brand-header', sysColorHeader.value);
                    document.documentElement.style.setProperty('--brand-accent', sysColorAccent.value);
                    statusEl.textContent = 'Saved to cartridge. Judges will see new colors on next sync.';
                    statusEl.className = 'mt-2 small text-center text-success';
                } else {
                    statusEl.textContent = 'Save failed — is an event loaded?';
                    statusEl.className = 'mt-2 small text-center text-danger';
                }
            } catch (e) {
                statusEl.textContent = 'Error: ' + e.message;
                statusEl.className = 'mt-2 small text-center text-danger';
            }
        };
    }

    // Inspector Buttons
    ['meta', 'config', 'scores', 'roster'].forEach(type => {
        const btn = document.getElementById(`btn-inspect-${type}`);
        if(btn) btn.onclick = () => renderInspector(type);
    });

    const brand = document.querySelector('header h1');
    if (brand) {
        brand.style.cursor = 'pointer';
        brand.onclick = () => { window.location.href = 'admin.html'; };
    }

    if (exportRawBtn) {
        // Raw Export: Database Dump (All Scores) - distinct from Awards CSV
        exportRawBtn.onclick = () => window.location.href = window.API_BASE + '/api/export';
    }

    if (clearScoresBtn) {
        clearScoresBtn.addEventListener('click', async () => {
            if (confirm('CAUTION: This will delete ALL scoring data but keep the rosters (Troops/Patrols).\n\nAre you sure?')) {
                const check = prompt("Type 'SCORES' to confirm:");
                if (check === 'SCORES') {
                    try {
                        const res = await fetch(window.API_BASE + '/api/admin/scores', { method: 'DELETE' });
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
                        const res = await fetch(window.API_BASE + '/api/admin/full-reset', { method: 'DELETE' });
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
        navDashboard.addEventListener('click', () => { window.location.href = 'admin.html'; });
    }

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

    // Sticker Controls Initialization
    initStickerControls();
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
        window.location.href = 'admin.html';
        return;
    } else if (viewName === 'awards') {
        document.getElementById('view-awards').classList.remove('hidden');
        setSubtitle('Awards & Exports');
        if (typeof updateStickerPreview === 'function') updateStickerPreview();
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
    } else if (viewName === 'scoresheets') {
        document.getElementById('view-scoresheets').classList.remove('hidden');
        setSubtitle('Print Scoresheets');
        populateScoresheetGroups();
    }
}

window.switchView = switchView;
window.utils = {
    switchView,
    printScoresheets,
    ssToggleGroup,
    ssSelectAll,
    ssDeselectAll,
    copyInspector: () => {
        const output = document.getElementById('inspector-output');
        if (!output) return;
        navigator.clipboard.writeText(output.textContent).then(() => {
            const btn = document.querySelector('[onclick="utils.copyInspector()"]');
            if (btn) {
                const originalText = btn.innerText;
                btn.innerText = "✅ Copied!";
                setTimeout(() => { btn.innerText = originalText; }, 2000);
            }
        });
    }
}; // For utils.html button handlers

function getWinnersRegistry() {
    const registry = [];
    const pointsMap = calculateScoreContext(appData);

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

    const styles = getStickerStyles();

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
                    ${headerLine1 ? `<div class="sticker-l1" style="font-family:${styles[1].font}; font-size:${styles[1].size}; font-weight:${styles[1].bold?'bold':'normal'}">${headerLine1}</div>` : ''}
                    ${headerLine2 ? `<div class="sticker-l2" style="font-family:${styles[2].font}; font-size:${styles[2].size}; font-weight:${styles[2].bold?'bold':'normal'}">${headerLine2}</div>` : ''}
                    <div class="sticker-l3" style="font-family:${styles[3].font}; font-size:${styles[3].size}; font-weight:${styles[3].bold?'bold':'normal'}">${w.gameName}</div>
                    <div class="sticker-l4" style="font-family:${styles[4].font}; font-size:${styles[4].size}; font-weight:${styles[4].bold?'bold':'normal'}">${w.line4}</div>
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

// Developer Inspector Logic
function renderInspector(type) {
    const output = document.getElementById('inspector-output');
    const path = document.getElementById('inspector-path');
    const container = document.getElementById('inspector-output-container');
    if(!output) return;

    let data = {};
    let pathText = "/root";

    switch(type) {
        case 'meta':
            data = appData.metadata;
            pathText = "/metadata";
            break;
        case 'config':
            data = { games: appData.games, common_scoring: appData.commonScoring };
            pathText = "/games_config";
            break;
        case 'scores':
            data = appData.scores;
            pathText = "/scores (raw)";
            break;
        case 'roster':
            data = appData.entities;
            pathText = "/entities";
            break;
    }

    path.textContent = pathText;
    output.textContent = JSON.stringify(data, null, 2);
    container.classList.remove('hidden');
}

window.renderInspector = renderInspector;

// Add global listener for the inspector's Ctrl+A convenience
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const inspector = document.getElementById('inspector-output');
        // Only override if the inspector exists and is natively focused
        if (inspector && document.activeElement === inspector) {
            e.preventDefault();
            const range = document.createRange();
            range.selectNodeContents(inspector);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
});

// --- Sticker Printing Logic ---

let saveTimeout = null;
function debounceSaveAwardsConfig() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveAwardsConfig, 1500);
}

async function saveAwardsConfig() {
    const config = {
        line1: document.getElementById('awards-line1')?.value,
        line2: document.getElementById('awards-line2')?.value,
        sync: document.getElementById('font-sync-all')?.checked,
        styles: getStickerStyles()
    };

    try {
        await fetch(window.API_BASE + '/api/admin/awards-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ awards_config: config })
        });
    } catch (err) {
        console.error('Failed to save awards config:', err);
    }
}

function getStickerStyles() {
    const styles = {};
    for (let i = 1; i <= 4; i++) {
        const fontEl = document.getElementById(`font-f${i}`);
        const sizeEl = document.getElementById(`font-s${i}`);
        const boldEl = document.getElementById(`font-b${i}`);

        styles[i] = {
            font: fontEl ? fontEl.value : 'Arial, sans-serif',
            size: sizeEl ? sizeEl.value + 'pt' : '10pt',
            bold: boldEl ? boldEl.checked : false
        };
    }
    return styles;
}

function updateStickerPreview() {
    const l1Input = document.getElementById('awards-line1');
    const l2Input = document.getElementById('awards-line2');

    if(!l1Input) return; // Not on awards page or not loaded

    const l1Text = l1Input.value || l1Input.placeholder || "Line 1 Text";
    const l2Text = l2Input.value || l2Input.placeholder || "Line 2 Text";

    document.getElementById('preview-l1').textContent = l1Text;
    document.getElementById('preview-l2').textContent = l2Text;

    const styles = getStickerStyles();
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`preview-l${i}`);
        if (el) {
            el.style.fontFamily = styles[i].font;
            el.style.fontSize = styles[i].size;
            el.style.fontWeight = styles[i].bold ? 'bold' : 'normal';
        }
    }
}

function initStickerControls() {
    const ctrls = document.querySelectorAll('.sticker-font-ctrl');
    const syncAll = document.getElementById('font-sync-all');
    const line1Input = document.getElementById('awards-line1');
    const line2Input = document.getElementById('awards-line2');

    // Load Existing Config if present
    const saved = appData.metadata?.awards_config;
    if (saved) {
        if (line1Input && saved.line1 !== undefined) line1Input.value = saved.line1;
        if (line2Input && saved.line2 !== undefined) line2Input.value = saved.line2;
        if (syncAll && saved.sync !== undefined) syncAll.checked = saved.sync;

        if (saved.styles) {
            for (let i = 1; i <= 4; i++) {
                const s = saved.styles[i];
                if (!s) continue;
                const fontEl = document.getElementById(`font-f${i}`);
                const sizeEl = document.getElementById(`font-s${i}`);
                const boldEl = document.getElementById(`font-b${i}`);
                if (fontEl) fontEl.value = s.font;
                if (sizeEl) sizeEl.value = parseInt(s.size);
                if (boldEl) boldEl.checked = s.bold;
            }
        }
    }

    if (line1Input) line1Input.addEventListener('input', () => { updateStickerPreview(); debounceSaveAwardsConfig(); });
    if (line2Input) line2Input.addEventListener('input', () => { updateStickerPreview(); debounceSaveAwardsConfig(); });

    ctrls.forEach(ctrl => {
        ctrl.addEventListener('change', (e) => {
            const line = e.target.dataset.line;

            // If Sync is enabled and we change Line 1, update others
            if (syncAll && syncAll.checked && line === "1") {
                const font = document.getElementById('font-f1').value;
                const size = document.getElementById('font-s1').value;
                const bold = document.getElementById('font-b1').checked;

                for (let i = 2; i <= 4; i++) {
                    document.getElementById(`font-f${i}`).value = font;
                    document.getElementById(`font-s${i}`).value = size;
                    document.getElementById(`font-b${i}`).checked = bold;
                }
            }
            updateStickerPreview();
            debounceSaveAwardsConfig();
        });

        // Also trigger on input for number fields
        if (ctrl.type === 'number') {
            ctrl.addEventListener('input', () => {
                const line = ctrl.dataset.line;
                if (syncAll && syncAll.checked && line === "1") {
                    const size = document.getElementById('font-s1').value;
                    for (let i = 2; i <= 4; i++) {
                        document.getElementById(`font-s${i}`).value = size;
                    }
                }
                updateStickerPreview();
                debounceSaveAwardsConfig();
            });
        }
    });

    if (syncAll) {
        syncAll.addEventListener('change', () => {
            if (syncAll.checked) {
                // Trigger a sync immediately
                const event = new Event('change');
                document.getElementById('font-f1').dispatchEvent(event);
            }
            debounceSaveAwardsConfig();
        });
    }

    updateStickerPreview();
}

window.initStickerControls = initStickerControls;

// --- SCORESHEETS ---

function populateScoresheetGroups() {
    const groups = { patrol: [], troop: [], exhibition: [] };
    (appData.games || []).forEach(game => {
        const t = game.type || 'patrol';
        if (groups[t]) groups[t].push(game);
    });

    Object.entries(groups).forEach(([type, games]) => {
        const list = document.getElementById(`ss-list-${type}`);
        const badge = document.getElementById(`ss-badge-${type}`);
        if (!list) return;
        if (badge) badge.textContent = games.length;
        list.innerHTML = games.map(g =>
            `<div class="form-check">
                <input class="form-check-input ss-game-cb" type="checkbox"
                    id="ss-cb-${g.id}" value="${g.id}" data-group="${type}" checked>
                <label class="form-check-label" for="ss-cb-${g.id}">${escH(formatGameTitle(g))}</label>
            </div>`
        ).join('');
    });
}

function ssToggleGroup(type, checked) {
    const list = document.getElementById(`ss-list-${type}`);
    if (!list) return;
    list.style.display = checked ? 'block' : 'none';
    list.querySelectorAll('.ss-game-cb').forEach(cb => { cb.checked = checked; });
}

function ssSelectAll(type) {
    const toggle = document.getElementById(`ss-toggle-${type}`);
    if (toggle && !toggle.checked) {
        toggle.checked = true;
        ssToggleGroup(type, true);
        return;
    }
    document.querySelectorAll(`#ss-list-${type} .ss-game-cb`).forEach(cb => { cb.checked = true; });
}

function ssDeselectAll(type) {
    document.querySelectorAll(`#ss-list-${type} .ss-game-cb`).forEach(cb => { cb.checked = false; });
}

function buildScoresheetHTML(games, rowCount, meta) {
    const eventTitle = meta?.title || 'Camporee';
    const eventTheme = meta?.theme || '';
    const today = new Date().toLocaleDateString();

    const sheets = games.map(game => {
        const judgeFields = (game.fields || []).filter(f => f.audience !== 'admin');
        const isPatrol = game.type === 'patrol';
        const isExhibition = game.type === 'exhibition';

        const colDefs = isExhibition ? [
            { label: '#',                    hint: '', width: '24px',  cls: 'col-num' },
            { label: 'Troop #',              hint: '', width: '52px',  cls: '' },
            { label: 'Patrol #',             hint: '', width: '52px',  cls: '' },
            { label: 'Patrol Name',          hint: '', width: '130px', cls: '' },
            { label: '# Members',            hint: '', width: '64px',  cls: '' },
            { label: '# Participating',      hint: '', width: '80px',  cls: '' },
        ] : [
            { label: '#',          hint: '',        width: '24px',  cls: 'col-num' },
            { label: 'Troop',      hint: '',        width: '48px',  cls: '' },
            ...(isPatrol ? [{ label: 'Patrol', hint: '', width: '110px', cls: '' }] : []),
            ...judgeFields.map(f => ({
                label: f.label,
                hint: fieldHint(f),
                width: fieldWidth(f),
                cls: f.type === 'textarea' ? 'col-notes' : ''
            }))
        ];

        const headerCells = colDefs.map(c =>
            `<th style="width:${c.width}" class="${c.cls}">${escH(c.label)}${c.hint ? `<span class="hint">${c.hint}</span>` : ''}</th>`
        ).join('');

        const blankRows = Array.from({ length: rowCount }, (_, i) =>
            `<tr><td class="col-num">${i + 1}</td>${colDefs.slice(1).map(() => '<td></td>').join('')}</tr>`
        ).join('');

        return `
<div class="sheet">
  <div class="sheet-header">
    <div class="sheet-title">${escH(formatGameTitle(game))}</div>
    <div class="sheet-meta">${escH(eventTitle)}${eventTheme ? ' — ' + escH(eventTheme) : ''} &nbsp;|&nbsp; Printed: ${today}</div>
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${blankRows}</tbody>
  </table>
</div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Scoresheets — ${escH(eventTitle)}</title>
<style>
  @page { size: landscape; margin: 0.4in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9pt; margin: 0; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: avoid; }
  .sheet-header { margin-bottom: 5px; }
  .sheet-title { font-size: 13pt; font-weight: bold; }
  .sheet-meta { font-size: 8pt; color: #555; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    background: #fff; color: #000; padding: 3px 4px;
    text-align: center; font-size: 7.5pt; border: 1px solid #999;
    vertical-align: bottom; line-height: 1.2; overflow: hidden;
    word-wrap: break-word;
  }
  th .hint { font-size: 7pt; font-weight: normal; opacity: 0.65; display: block; }
  td { border: 1px solid #bbb; height: 30px; padding: 0 2px; }
  .col-num { text-align: center; background: #f0f0f0; font-size: 8pt; vertical-align: middle; }
  .col-notes { min-width: 100px; }
  tr:nth-child(even) td:not(.col-num) { background: #f7f7f7; }
</style>
</head>
<body>${sheets}
<script>setTimeout(window.print, 250);</script>
</body>
</html>`;
}

function fieldHint(f) {
    if (f.type === 'stopwatch' || f.type === 'timed') return '(time)';
    if (f.type === 'checkbox') return '(✓/✗)';
    if (f.type === 'textarea') return '(notes)';
    if (f.type === 'number') {
        if (f.min !== undefined && f.min < 0) return `(${f.min}–${f.max})`;
        if (f.max !== undefined) return `(${f.max})`;
    }
    return '';
}

function fieldWidth(f) {
    if (f.type === 'textarea') return '120px';
    if (f.type === 'stopwatch' || f.type === 'timed') return '58px';
    if (f.type === 'checkbox') return '52px';
    if (f.type === 'select') return '80px';
    return '52px';
}

function escH(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function printScoresheets() {
    const rowCount = parseInt(document.getElementById('scoresheet-rows').value) || 20;
    const selectedIds = new Set(
        [...document.querySelectorAll('.ss-game-cb:checked')].map(cb => cb.value)
    );

    if (!selectedIds.size) { alert('Select at least one game to print.'); return; }

    let games = (appData.games || []).filter(g => selectedIds.has(g.id));
    if (!games.length) { alert('No matching games found.'); return; }

    const duplex = document.getElementById('scoresheet-duplex')?.checked;
    if (duplex) games = games.flatMap(g => [g, g]);

    const html = buildScoresheetHTML(games, rowCount, appData.metadata);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) { alert('Pop-up blocked — allow pop-ups for this page and try again.'); URL.revokeObjectURL(url); return; }
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
