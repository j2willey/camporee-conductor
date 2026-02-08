import { formatGameTitle } from './core/schema.js';
import { appData, loadData, updateDashboardHeader } from './core/data-store.js';
import { setSubtitle } from './core/ui.js';

let currentView = 'dashboard';
let currentViewMode = 'patrol';
let autoRefreshInterval = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await loadData({ onHeaderUpdate: updateDashboardHeader });
    setupNavigation();

    // Handle initial route from URL
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') || 'dashboard';
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

function setupNavigation() {
    const navDashboard = document.getElementById('nav-dashboard');
    const viewModeSelect = document.getElementById('view-mode-select');
    const autoRefreshSwitch = document.getElementById('auto-refresh-switch');

    // Branding click goes back to dashboard
    const brand = document.querySelector('header h1');
    if (brand) {
        brand.style.cursor = 'pointer';
        brand.onclick = () => switchView('dashboard');
    }

    if (navDashboard) {
        navDashboard.addEventListener('click', () => switchView('dashboard'));
    }

    const copyEmailsBtn = document.getElementById('btn-copy-emails');
    if (copyEmailsBtn) copyEmailsBtn.onclick = copyJudgeEmails;

    const printPreviewBtn = document.getElementById('btn-print-preview');
    if (printPreviewBtn) {
        printPreviewBtn.onclick = () => window.print();
    }

    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', (e) => {
            currentViewMode = e.target.value;
            refreshCurrentView();
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
    if (currentView === 'detail' || currentView === 'matrix') {
        switchView('overview');
    } else {
        switchView('dashboard');
    }
}
window.handleBack = handleBack;

function refreshCurrentView() {
    // Current Admin views (Registration and Judges) are largely static or handled by their own renderers
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

    let activeGameId = null;
    if (pushToHistory) {
        const url = new URL(window.location);
        url.searchParams.set('view', viewName);
        if (viewName !== 'detail') url.searchParams.delete('gameId');
        window.history.pushState({ view: viewName, gameId: activeGameId }, '', url);
    }

    if (viewName === 'dashboard') {
        document.getElementById('view-dashboard').classList.remove('hidden');
    } else if (viewName === 'registration') {
        document.getElementById('view-registration').classList.remove('hidden');
        setSubtitle('Registration');
        renderRoster();
    } else if (viewName === 'judges') {
        document.getElementById('view-judges').classList.remove('hidden');
        setSubtitle('Judges Directory');
        renderJudgesView();
    } else if (viewName === 'debug') {
        document.getElementById('view-debug').classList.remove('hidden');
        setSubtitle('System Tools');
    }
}
window.switchView = switchView;

// --- Overview ---

// --- Registration View (Tree) ---



// --- Registration View (Tree) ---

function renderRoster() {
    const container = document.getElementById('roster-tree');
    container.innerHTML = '';

    const troops = appData.entities.filter(e => e.type === 'troop')
        .sort((a,b) => (parseInt(a.troop_number)||0) - (parseInt(b.troop_number)||0));

    const patrols = appData.entities.filter(e => e.type === 'patrol');

    // Group Patrols
    const patrolsByParent = {};
    const patrolsByNum = {}; // Fallback
    const orphans = [];

    patrols.forEach(p => {
        if (p.parent_id) {
            if (!patrolsByParent[p.parent_id]) patrolsByParent[p.parent_id] = [];
            patrolsByParent[p.parent_id].push(p);
        } else {
            // Check formatted number for fallback matching
            if (!patrolsByNum[p.troop_number]) patrolsByNum[p.troop_number] = [];
            patrolsByNum[p.troop_number].push(p);
        }
    });

    // Render Troops
    troops.forEach((troop, index) => {
        const myPatrols = [
            ...(patrolsByParent[troop.id] || []),
            ...(patrolsByNum[troop.troop_number] || [])
        ];

        // Remove from fallback map so they don't appear in orphans
        if (patrolsByNum[troop.troop_number]) delete patrolsByNum[troop.troop_number];

        const details = document.createElement('details');
        details.open = true; // Default expanded
        details.className = "roster-group";
        // File-manager style: Compact, single borders, no gaps
        const isLastTroop = index === troops.length - 1;
        details.style = `border-bottom:${isLastTroop ? '0' : '1px solid #dee2e6'}; background:white; margin:0;`;

        const summary = document.createElement('summary');
        summary.style = "font-weight:bold; cursor:pointer; list-style:none; display:flex; align-items:center; padding: 4px 10px; background-color: #f1f3f4; border-bottom: 1px solid #e0e0e0;";
        summary.innerHTML = `
            <span style="font-size:0.8rem; margin-right:8px; color:#5f6368; transition: transform 0.2s;">▼</span>
            <span style="font-size:0.95rem;">${troop.name.startsWith('T') ? '' : 'Troop '}${troop.name}</span>
            <button class="btn btn-sm btn-link ms-auto text-decoration-none p-0 text-success fw-bold" style="font-size: 0.8rem;" onclick="addEntity('${troop.id}')">+ Add Patrol</button>
        `;

        // Simple arrow toggle logic
        summary.addEventListener('click', (e) => {
             // We need to wait for the open state to toggle or check current
             const arrow = summary.querySelector('span:first-child');
             // details.open is about to change
             setTimeout(() => {
                 arrow.style.transform = details.open ? '' : 'rotate(-90deg)';
             }, 10);
        });

        details.appendChild(summary);

        const list = document.createElement('div');
        list.style = "margin-left: 0;"; // Indentation handled by inner items

        if (myPatrols.length === 0) {
            list.innerHTML = '<div class="text-muted small p-2 fst-italic" style="padding-left: 35px !important;">No patrols registered</div>';
        } else {
            myPatrols.forEach(p => {
                const div = document.createElement('div');
                div.className = "d-flex justify-content-between align-items-center py-1 px-2 border-bottom";
                div.style.paddingLeft = "30px";
                div.style.backgroundColor = "transparent";
                div.innerHTML = `
                    <span style="font-size: 0.9rem;"><span style="color:#bdc1c6; margin-right:8px;">├─</span>${p.name} <small class="text-muted" style="font-size:0.75em">(${p.id})</small></span>
                    <span class="badge bg-light text-dark border-0 text-muted" style="font-size: 0.7rem;">PATROL</span>
                `;
                list.appendChild(div);
            });
        }
        details.appendChild(list);
        container.appendChild(details);
    });

    // Handle Remaining Orphans (Patrols with no matching Troop)
    const trulyOrphaned = [];
    Object.values(patrolsByNum).forEach(arr => trulyOrphaned.push(...arr));
    orphans.push(...trulyOrphaned);

    if (orphans.length > 0) {
        const orphanContainer = document.createElement('div');
        orphanContainer.style = "margin-top:20px; border:2px dashed #e67e22; padding:10px; border-radius:4px; background:#fff8e1;";
        orphanContainer.innerHTML = `<h4 class="text-warning">⚠ Unassigned Patrols</h4>`;

        orphans.forEach(p => {
             const div = document.createElement('div');
             div.className = "d-flex justify-content-between align-items-center p-2 border-bottom";
             div.innerHTML = `
                <span>${p.name} <small class="text-muted">(Troop ${p.troop_number} - No Parent Link)</small></span>
                <span class="badge bg-warning text-dark">Orphan</span>
            `;
            orphanContainer.appendChild(div);
        });
        container.appendChild(orphanContainer);
    }
}

async function addEntity(parentId) {
    let type = 'troop';
    let troopNum = '';
    let name = '';
    let parent = null;

    if (parentId) {
        type = 'patrol';
        parent = appData.entities.find(e => e.id === parentId);
        if (!parent) return alert("Parent troop not found");
        troopNum = parent.troop_number;
        name = prompt(`New Patrol Name for Troop ${troopNum}:`);
    } else {
        type = 'troop';
        troopNum = prompt("Enter Troop Number:");
        if (!troopNum) return;
        name = prompt("Enter Troop Name (or description):");
    }

    if (!name) return;

    const payload = {
        name: name.trim(),
        type: type,
        troop_number: (troopNum+'').trim(),
        parent_id: parentId
    };

    try {
        const res = await fetch('/api/entities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Failed to register');
        const newEntity = await res.json();

        // Update Local State
        appData.entities.push(newEntity);

        renderRoster(); // Refresh Tree

    } catch (err) {
        console.error(err);
        alert("Failed to add entity: " + err.message);
    }
}
window.addEntity = addEntity; // Export

// (Old handleRegistration removed)





async function renderJudgesView() {
    const container = document.getElementById('judges-list');
    container.innerHTML = '<p class="text-muted">Loading judges...</p>';

    try {
        const res = await fetch('/api/admin/judges');
        if (!res.ok) throw new Error('Failed to load judges');
        const judges = await res.json();

        // Store for copy action
        appData.judges = judges;

        if (judges.length === 0) {
            container.innerHTML = '<div class="alert alert-info">No judges found.</div>';
            return;
        }

        let html = `
            <table class="table table-striped table-hover">
                <thead class="table-dark">
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Unit</th>
                        <th class="text-center">Scores</th>
                        <th>Games Judged</th>
                    </tr>
                </thead>
                <tbody>
        `;

        judges.forEach(j => {
            const gameNames = (j.games_judged || []).map(gid => {
                const g = appData.games.find(x => x.id === gid);
                return g ? formatGameTitle(g) : gid;
            }).join(', ');

            html += `
                <tr>
                    <td class="fw-bold">${j.name || '-'}</td>
                    <td><a href="mailto:${j.email}">${j.email}</a></td>
                    <td>${j.unit || '-'}</td>
                    <td class="text-center">${j.score_count}</td>
                    <td><small class="text-muted">${gameNames}</small></td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
    }
}

function copyJudgeEmails() {
    if (!appData.judges || appData.judges.length === 0) {
        alert('No judges loaded.');
        return;
    }
    // Filter out empty emails and join with semicolon
    const emails = appData.judges.map(j => j.email).filter(e => e).join('; ');

    if (!emails) {
        alert('No emails found.');
        return;
    }

    navigator.clipboard.writeText(emails).then(() => {
        alert('Emails copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy', err);
        prompt("Copy these emails:", emails);
    });
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
