// State
let appData = {
    games: [],
    entities: [],
    commonScoring: [],
    scores: [], // Full raw score list
    stats: {}, // Counts
};

let currentView = 'overview';
let currentViewMode = 'patrol'; // 'patrol' or 'troop'
let matrixTranspose = false;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupNavigation();
    renderOverview();
});

async function loadData() {
    try {
        // Fetch Games Config & Entities
        const [gamesRes, entitiesRes, dataRes] = await Promise.all([
            fetch('/games.json'),
            fetch('/api/entities'),
            fetch('/api/admin/all-data')
        ]);

        const gamesResult = await gamesRes.json();
        appData.games = gamesResult.games;
        appData.commonScoring = gamesResult.common_scoring;

        appData.entities = await entitiesRes.json();

        // Fetch Data
        const dataResult = await dataRes.json();
        appData.scores = dataResult.scores || [];
        appData.stats = dataResult.stats || {};

        console.log('Loaded Data:', appData);

    } catch (err) {
        console.error('Failed to load data', err);
        alert('Error loading dashboard data');
    }
}

function setupNavigation() {
    const navOverview = document.getElementById('nav-overview');
    const navMatrix = document.getElementById('nav-matrix');
    const navRegistration = document.getElementById('nav-registration');
    const backBtn = document.getElementById('back-to-overview');
    const transposeBtn = document.getElementById('btn-transpose');
    const viewModeSelect = document.getElementById('view-mode-select');
    const resetDbBtn = document.getElementById('btn-reset-db');

    if (resetDbBtn) {
        resetDbBtn.addEventListener('click', async () => {
            if (confirm('DANGER: This will delete ALL scores from the database. This cannot be undone.\n\nAre you sure?')) {
                const check = prompt("Type 'DELETE' to confirm:");
                if (check === 'DELETE') {
                    try {
                        const res = await fetch('/api/admin/data', { method: 'DELETE' });
                        if (res.ok) {
                            alert('Database cleared.');
                            window.location.reload();
                        } else {
                            alert('Failed to clear database.');
                        }
                    } catch (e) {
                        alert('Error: ' + e.message);
                    }
                }
            }
        });
    }

    navOverview.addEventListener('click', () => switchView('overview'));
    navMatrix.addEventListener('click', () => switchView('matrix'));

    if (navRegistration) {
        navRegistration.addEventListener('click', () => switchView('registration'));
    }

    backBtn.addEventListener('click', () => switchView('overview'));

    // ... rest of listeners
    // Form Listener
    const regForm = document.getElementById('reg-form');
    if (regForm) {
        regForm.addEventListener('submit', handleRegistration);
    }

    transposeBtn.addEventListener('click', () => {
        matrixTranspose = !matrixTranspose;
        renderMatrix();
    });

    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', (e) => {
            currentViewMode = e.target.value;
            if (currentView === 'overview') renderOverview();
            else if (currentView === 'matrix') renderMatrix();
            // Registration view doesn't filter by mode immediately but shows full list
        });
    }
}

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));

    if (viewName === 'overview') {
        document.getElementById('view-overview').classList.remove('hidden');
        document.getElementById('nav-overview').classList.add('active');
        renderOverview();
    } else if (viewName === 'matrix') {
        document.getElementById('view-matrix').classList.remove('hidden');
        document.getElementById('nav-matrix').classList.add('active');
        renderMatrix();
    } else if (viewName === 'detail') {
        document.getElementById('view-detail').classList.remove('hidden');
        document.getElementById('nav-overview').classList.add('active');
    } else if (viewName === 'registration') {
        document.getElementById('view-registration').classList.remove('hidden');
        const regBtn = document.getElementById('nav-registration');
        if(regBtn) regBtn.classList.add('active');
        renderRoster();
    }
}

// --- Overview ---

function renderOverview() {
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '';

    const games = appData.games.filter(g => !g.type || g.type === currentViewMode);

    if (games.length === 0) {
        grid.innerHTML = `<p>No ${currentViewMode} games found.</p>`;
        return;
    }

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'card';
        const count = appData.stats[game.id] || 0;

        card.innerHTML = `
            <h3>${game.name}</h3>
            <div class="stat">${count} Scores</div>
        `;
        card.addEventListener('click', () => openGameDetail(game.id));
        grid.appendChild(card);
    });
}

// --- Detail View ---

function openGameDetail(gameId) {
    const game = appData.games.find(g => g.id === gameId);
    if (!game) return;

    document.getElementById('detail-title').innerText = game.name;
    const table = document.getElementById('detail-table');
    table.innerHTML = '';

    // Filter scores for this game
    const gameScores = appData.scores.filter(s => s.game_id === gameId);

    // Sort by troop number
    gameScores.sort((a, b) => {
        const numA = parseInt(a.troop_number) || 0;
        const numB = parseInt(b.troop_number) || 0;
        return numA - numB;
    });

    // Build Headers
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    // Standard Cols
    const stdHeaders = ['Troop', 'Entity', 'Time'];
    stdHeaders.forEach(h => headerRow.appendChild(createTh(h)));

    // Dynamic Cols (from game config)
    const gameFields = game.fields || [];
    gameFields.forEach(field => {
        headerRow.appendChild(createTh(field.label));
    });

    // Common Scoring Cols
    const commonFields = appData.commonScoring || [];
    commonFields.forEach(field => {
        headerRow.appendChild(createTh(field.label));
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Build Body
    const tbody = document.createElement('tbody');
    gameScores.forEach(score => {
        const tr = document.createElement('tr');

        tr.appendChild(createTd(score.troop_number));
        tr.appendChild(createTd(score.entity_name));
        tr.appendChild(createTd(new Date(score.timestamp).toLocaleTimeString()));

        // Payload Fields
        gameFields.forEach(field => {
            const val = score.score_payload[field.id];
            tr.appendChild(createTd(formatValue(val, field.type)));
        });

        // Common Fields
        commonFields.forEach(field => {
            const val = score.score_payload[field.id];
            tr.appendChild(createTd(formatValue(val, field.type)));
        });

        tbody.appendChild(tr);
    });

    if (gameScores.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3 + gameFields.length + commonFields.length;
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
    th.innerText = text;
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

    const entities = appData.entities.filter(e => e.type === currentViewMode);

    // Sort Entities
    entities.sort((a, b) => {
        const numA = parseInt(a.troop_number) || 0;
        const numB = parseInt(b.troop_number) || 0;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
    });

    const games = appData.games.filter(g => !g.type || g.type === currentViewMode);

    if (matrixTranspose) {
        renderMatrixTransposed(table, games, entities);
    } else {
        renderMatrixNormal(table, games, entities);
    }
}

function renderMatrixNormal(table, games, patrols) {
    // Header: Entity Info + Games
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createTh('Troop'));
    headerRow.appendChild(createTh(currentViewMode === 'patrol' ? 'Patrol' : 'Troop Name'));

    games.forEach(g => {
        const th = createTh(g.name);
        // truncate if too long?
        th.title = g.name;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    patrols.forEach(patrol => {
        const tr = document.createElement('tr');
        tr.appendChild(createTd(patrol.troop_number));
        tr.appendChild(createTd(patrol.name));

        games.forEach(game => {
            const hasScore = appData.scores.some(s => s.entity_id === patrol.id && s.game_id === game.id);
            const td = document.createElement('td');
            td.className = 'cell-center';
            if (hasScore) {
                td.innerHTML = '<span class="check">✅</span>';
            } else {
                td.innerHTML = '<span style="color:#eee">.</span>';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

function renderMatrixTransposed(table, games, patrols) {
    // Header: Game Name + Patrols
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createTh('Game Name'));

    patrols.forEach(p => {
        const th = createTh(`${p.troop_number}\n${p.name}`);
        th.style.fontSize = '10px';
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    games.forEach(game => {
        const tr = document.createElement('tr');
        tr.appendChild(createTd(game.name));

        patrols.forEach(patrol => {
            const hasScore = appData.scores.some(s => s.entity_id === patrol.id && s.game_id === game.id);
            const td = document.createElement('td');
            td.className = 'cell-center';
            if (hasScore) {
                td.innerHTML = '<span class="check">✅</span>';
            } else {
                td.innerHTML = '<span style="color:#eee">.</span>';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

// --- Registration View ---

function renderRoster() {
    const tbody = document.getElementById('roster-tbody');
    tbody.innerHTML = '';

    const entities = [...appData.entities].sort((a, b) => {
        // Sort by type (Troop first), then Number
        if (a.type !== b.type) return a.type === 'troop' ? -1 : 1;
        const numA = parseInt(a.troop_number) || 0;
        const numB = parseInt(b.troop_number) || 0;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
    });

    entities.forEach(ent => {
        const tr = document.createElement('tr');

        // Type Badge
        const typeTd = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.innerText = ent.type.toUpperCase();
        // Simple styling for badge if not in css
        badge.style.padding = '2px 5px';
        badge.style.borderRadius = '4px';
        badge.style.backgroundColor = ent.type === 'troop' ? '#3498db' : '#e67e22';
        badge.style.color = '#fff';
        badge.style.fontSize = '0.8em';

        typeTd.appendChild(badge);
        tr.appendChild(typeTd);

        tr.appendChild(createTd(ent.troop_number));
        tr.appendChild(createTd(ent.name));
        tr.appendChild(createTd(ent.id));

        tbody.appendChild(tr);
    });
}

async function handleRegistration(e) {
    e.preventDefault();

    const typeSelect = document.getElementById('reg-type');
    const numInput = document.getElementById('reg-troop-num');
    const nameInput = document.getElementById('reg-name');
    const msgDiv = document.getElementById('reg-message');

    const payload = {
        name: nameInput.value.trim(),
        type: typeSelect.value,
        troop_number: numInput.value.trim()
    };

    if (!payload.troop_number || !payload.name) {
        msgDiv.innerText = 'Please fill all fields';
        msgDiv.style.color = 'red';
        return;
    }

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

        // Feedback
        msgDiv.innerText = `Success: Added ${newEntity.name}`;
        msgDiv.style.color = 'green';

        // Clear Form Name only (keep troop num for convenience)
        nameInput.value = '';
        nameInput.focus();

        // Refresh List
        renderRoster();

        // Clear success message after 3s
        setTimeout(() => { msgDiv.innerText = ''; }, 3000);

    } catch (err) {
        console.error(err);
        msgDiv.innerText = 'Error registering entity';
        msgDiv.style.color = 'red';
    }
}

