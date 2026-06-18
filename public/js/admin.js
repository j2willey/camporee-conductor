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

    // Entity modal wiring
    document.getElementById('em-type')?.addEventListener('change', updateUnitTypeLabels);
    document.getElementById('em-submit')?.addEventListener('click', submitEntityModal);
    [document.getElementById('em-number'), document.getElementById('em-name')].forEach(el => {
        el?.addEventListener('keydown', e => { if (e.key === 'Enter') submitEntityModal(); });
    });

    // Merge modal wiring
    document.getElementById('merge-submit')?.addEventListener('click', submitMergeModal);

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
        window.showDemoHint?.('registration');
    } else if (viewName === 'judges') {
        document.getElementById('view-judges').classList.remove('hidden');
        setSubtitle('Judges Directory');
        renderJudgesView();
        window.showDemoHint?.('judges');
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
        .sort((a,b) => (parseInt(String(a.troop_number).replace(/^T/i,''))||0) - (parseInt(String(b.troop_number).replace(/^T/i,''))||0));

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
        const _tn = (troop.troop_number || '').trim();
        const troopLabel = /^\d/.test(_tn) ? `T${_tn}` : _tn;

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
            <span style="font-size:0.95rem;">${troopLabel}${troop.name ? ' — ' + troop.name : ''}</span>
            <span class="ms-auto d-flex align-items-center gap-2">
                <button class="btn btn-sm btn-link text-decoration-none p-0 text-muted" style="font-size:0.85rem;" title="Rename troop" onclick="event.stopPropagation(); renameEntity('${troop.id}')">✏️</button>
                <button class="btn btn-sm btn-link text-decoration-none p-0 text-muted" style="font-size:0.85rem;" title="Merge troop into another" onclick="event.stopPropagation(); showMergeModal('${troop.id}')">⇒</button>
                <button class="btn btn-sm btn-link text-decoration-none p-0 text-success fw-bold" style="font-size: 0.8rem;" onclick="event.stopPropagation(); addEntity('${troop.id}')">+ Add Patrol</button>
            </span>
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
            myPatrols.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
                const div = document.createElement('div');
                div.className = "d-flex justify-content-between align-items-center py-1 px-2 border-bottom";
                div.style.paddingLeft = "30px";
                div.style.backgroundColor = "transparent";
                div.innerHTML = `
                    <span style="font-size: 0.9rem;"><span style="color:#bdc1c6; margin-right:8px;">├─</span>${p.name} <small class="text-muted" style="font-size:0.75em">(${p.id})</small></span>
                    <span class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-link text-decoration-none p-0 text-muted" style="font-size:0.85rem;" title="Rename patrol" onclick="renameEntity('${p.id}')">✏️</button>
                        <button class="btn btn-sm btn-link text-decoration-none p-0 text-muted" style="font-size:0.85rem;" title="Merge into another patrol" onclick="showMergeModal('${p.id}')">⇒</button>
                        <span class="badge bg-light text-dark border-0 text-muted" style="font-size: 0.7rem;">PATROL</span>
                    </span>
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
                <span class="d-flex align-items-center gap-2">
                    <button class="btn btn-sm btn-link text-decoration-none p-0 text-muted" style="font-size:0.85rem;" title="Rename patrol" onclick="renameEntity('${p.id}')">✏️</button>
                    <button class="btn btn-sm btn-link text-decoration-none p-0 text-muted" style="font-size:0.85rem;" title="Merge into another patrol" onclick="showMergeModal('${p.id}')">⇒</button>
                    <span class="badge bg-warning text-dark">Orphan</span>
                </span>
            `;
            orphanContainer.appendChild(div);
        });
        container.appendChild(orphanContainer);
    }
}

// --- Add Entity Modal ---

const UNIT_TYPE_LABELS = {
    troop:   { number: 'Troop Number', placeholder: 'e.g. 42' },
    crew:    { number: 'Crew Number',  placeholder: 'e.g. 42' },
    webelos: { number: 'Den Number',   placeholder: 'e.g. 5'  },
};

let _entityModal = null;
let _entityModalParentId = null;
let _renameEntityId = null;
let _mergeModal = null;
let _mergeSourceId = null;

function getEntityModal() {
    if (!_entityModal) _entityModal = new bootstrap.Modal(document.getElementById('entity-modal'));
    return _entityModal;
}

function updateUnitTypeLabels() {
    const type = document.getElementById('em-type').value;
    const cfg = UNIT_TYPE_LABELS[type] || UNIT_TYPE_LABELS.troop;
    document.getElementById('em-number-label').textContent = cfg.number;
    document.getElementById('em-number').placeholder = cfg.placeholder;
}

function showEntityError(msg) {
    const el = document.getElementById('em-error');
    el.textContent = msg;
    el.classList.remove('d-none');
}

function addEntity(parentId) {
    _renameEntityId = null;
    _entityModalParentId = parentId;

    const errorEl = document.getElementById('em-error');
    errorEl.classList.add('d-none');
    document.getElementById('em-name').value = '';
    document.getElementById('em-number').value = '';
    document.getElementById('em-type').value = 'troop';
    updateUnitTypeLabels();

    const submitBtn = document.getElementById('em-submit');

    if (parentId) {
        const parent = appData.entities.find(e => e.id === parentId);
        const troopNum = parent ? parent.troop_number : '';
        document.getElementById('entity-modal-title').textContent = `Add Patrol — Troop ${troopNum}`;
        document.getElementById('em-type-row').style.display = 'none';
        document.getElementById('em-number-row').style.display = 'none';
        document.getElementById('em-name-label').textContent = 'Patrol Name';
        document.getElementById('em-name').placeholder = 'e.g. Eagles';
        document.getElementById('em-name-hint').textContent = '';
        submitBtn.textContent = 'Add Patrol';
    } else {
        document.getElementById('entity-modal-title').textContent = 'Add Unit';
        document.getElementById('em-type-row').style.display = '';
        document.getElementById('em-number-row').style.display = '';
        document.getElementById('em-name-label').textContent = 'Name (optional description)';
        document.getElementById('em-name').placeholder = 'e.g. Mountaineers';
        document.getElementById('em-name-hint').textContent = 'If left blank, the number is used as the name.';
        submitBtn.textContent = 'Add Unit';
    }

    submitBtn.disabled = false;
    getEntityModal().show();

    document.getElementById('entity-modal').addEventListener('shown.bs.modal', () => {
        const first = parentId ? document.getElementById('em-name') : document.getElementById('em-number');
        first?.focus();
    }, { once: true });
}
window.addEntity = addEntity;

async function submitEntityModal() {
    const submitBtn = document.getElementById('em-submit');
    document.getElementById('em-error').classList.add('d-none');

    // Rename mode
    if (_renameEntityId) {
        const name = document.getElementById('em-name').value.trim();
        if (!name) { showEntityError('Name is required.'); return; }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';
        try {
            const res = await fetch(window.API_BASE + '/api/entities/' + _renameEntityId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (!res.ok) throw new Error('Server error');
            const entity = appData.entities.find(e => e.id === _renameEntityId);
            if (entity) entity.name = name;
            getEntityModal().hide();
            renderRoster();
        } catch {
            showEntityError('Failed to save. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save';
        }
        return;
    }

    // Add mode
    const parentId = _entityModalParentId;
    let type, troopNum, name;

    if (parentId) {
        type = 'patrol';
        const parent = appData.entities.find(e => e.id === parentId);
        troopNum = parent ? parent.troop_number : '';
        name = document.getElementById('em-name').value.trim();
        if (!name) { showEntityError('Patrol name is required.'); return; }
    } else {
        type = 'troop';
        troopNum = document.getElementById('em-number').value.trim();
        name = document.getElementById('em-name').value.trim() || troopNum;
        if (!troopNum) { showEntityError('Unit number is required.'); return; }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';

    try {
        const res = await fetch(window.API_BASE + '/api/entities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, troop_number: troopNum, parent_id: parentId || null })
        });
        if (!res.ok) throw new Error('Server error');
        const newEntity = await res.json();
        appData.entities.push(newEntity);
        getEntityModal().hide();
        renderRoster();
    } catch {
        showEntityError('Failed to add. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = parentId ? 'Add Patrol' : 'Add Unit';
    }
}





function renameEntity(entityId) {
    const entity = appData.entities.find(e => e.id === entityId);
    if (!entity) return;

    _renameEntityId = entityId;
    _entityModalParentId = null;

    document.getElementById('em-error').classList.add('d-none');
    document.getElementById('entity-modal-title').textContent = `Rename — ${entity.name}`;
    document.getElementById('em-type-row').style.display = 'none';
    document.getElementById('em-number-row').style.display = 'none';
    document.getElementById('em-name-label').textContent = 'New Name';
    document.getElementById('em-name').value = entity.name;
    document.getElementById('em-name').placeholder = entity.name;
    document.getElementById('em-name-hint').textContent = '';

    const submitBtn = document.getElementById('em-submit');
    submitBtn.textContent = 'Save';
    submitBtn.disabled = false;

    getEntityModal().show();
    document.getElementById('entity-modal').addEventListener('shown.bs.modal', () => {
        document.getElementById('em-name')?.select();
    }, { once: true });
    document.getElementById('entity-modal').addEventListener('hide.bs.modal', () => {
        _renameEntityId = null;
    }, { once: true });
}
window.renameEntity = renameEntity;

function getMergeModal() {
    if (!_mergeModal) _mergeModal = new bootstrap.Modal(document.getElementById('merge-modal'));
    return _mergeModal;
}

function showMergeModal(entityId) {
    const entity = appData.entities.find(e => e.id === entityId);
    if (!entity) return;

    _mergeSourceId = entityId;
    document.getElementById('merge-source-name').textContent = entity.name;
    document.getElementById('merge-error').classList.add('d-none');

    const select = document.getElementById('merge-target');
    select.innerHTML = '';
    appData.entities
        .filter(e => e.id !== entityId && e.type === entity.type)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = entity.type === 'patrol'
                ? `${e.name} (T${e.troop_number})`
                : `T${e.troop_number}${e.name !== e.troop_number ? ' — ' + e.name : ''}`;
            select.appendChild(opt);
        });

    if (select.options.length === 0) {
        select.innerHTML = '<option disabled>No other entities of this type</option>';
        document.getElementById('merge-submit').disabled = true;
    } else {
        document.getElementById('merge-submit').disabled = false;
    }

    getMergeModal().show();
}
window.showMergeModal = showMergeModal;

async function submitMergeModal() {
    const submitBtn = document.getElementById('merge-submit');
    const errorEl  = document.getElementById('merge-error');
    errorEl.classList.add('d-none');

    const toId = document.getElementById('merge-target').value;
    if (!toId || !_mergeSourceId) return;

    const sourceName = document.getElementById('merge-source-name').textContent;
    const target = appData.entities.find(e => e.id === toId);
    const targetLabel = target ? target.name : toId;

    if (!confirm(`Merge "${sourceName}" into "${targetLabel}"?\n\nThis will move all scores and remove the source. This cannot be undone.`)) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Merging…';

    try {
        const res = await fetch(window.API_BASE + '/api/entities/reassign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_entity_id: _mergeSourceId, to_entity_id: toId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');

        // Remove source from local cache
        appData.entities = appData.entities.filter(e => e.id !== _mergeSourceId);
        getMergeModal().hide();
        renderRoster();
        alert(`Done — ${data.reassigned} score${data.reassigned !== 1 ? 's' : ''} moved to "${targetLabel}"${data.skipped ? `, ${data.skipped} skipped (target already had a score for that game)` : ''}.`);
    } catch (err) {
        errorEl.textContent = err.message || 'Failed to merge. Please try again.';
        errorEl.classList.remove('d-none');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Merge & Remove Source';
    }
}

async function renderJudgesView() {
    const container = document.getElementById('judges-list');
    container.innerHTML = '<p class="text-muted">Loading judges...</p>';

    try {
        const res = await fetch(window.API_BASE + '/api/admin/judges');
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
        const response = await fetch(window.API_BASE + '/api/entities/' + entityId, {
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
