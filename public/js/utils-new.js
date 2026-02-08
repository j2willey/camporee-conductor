import { store, loadData, formatGameTitle, getPointsForRank, getOrdinalSuffix } from './core/data-store.js';

const utils = {
    init: async () => {
        console.log("Utils App Initializing...");
        await loadData();

        // 1. Read the Hash (e.g. #awards)
        const hash = window.location.hash.substring(1);
        const view = hash || 'awards'; // Default to awards

        console.log("Initial View:", view);
        utils.switchView(view);

        // 2. Setup QR URL default
        const urlInput = document.getElementById('qr-url');
        if(urlInput && !urlInput.value) urlInput.value = window.location.origin;
    },

    switchView: (viewName) => {
        console.log("Switching to:", viewName);

        // Update URL hash without reloading
        window.history.replaceState(null, null, `#${viewName}`);

        // 1. Force Hide ALL Sections
        document.querySelectorAll('main > section').forEach(el => {
            el.classList.add('hidden');
            el.style.display = 'none'; // Force CSS hide
        });

        // 2. Force Show TARGET Section
        const target = document.getElementById(`view-${viewName}`);
        if (target) {
            target.classList.remove('hidden');
            target.style.display = 'block'; // Force CSS show
        } else {
            console.error(`CRITICAL: View ID 'view-${viewName}' not found!`);
        }

        // 3. Update Nav Buttons State
        document.querySelectorAll('nav button').forEach(b => {
            b.classList.remove('active', 'btn-light', 'text-dark');
            b.classList.add('btn-outline-light');
        });

        const activeBtn = document.getElementById(`nav-${viewName}`);
        if(activeBtn) {
            activeBtn.classList.remove('btn-outline-light');
            activeBtn.classList.add('active', 'btn-light', 'text-dark');
        }

        // 4. Render Logic
        if (viewName === 'awards') utils.renderAwardsPreview();
    },

    // --- AWARDS LOGIC ---
    renderAwardsPreview: () => {
        // Placeholder for future preview logic
    },

    getWinners: () => {
        const winners = [];
        const map = utils.calculateScoreContext();

        store.games.forEach(game => {
             const gameScores = [];
             store.entities.forEach(entity => {
                 if (map[entity.id] && map[entity.id][game.id]) {
                     gameScores.push({
                         entity: entity,
                         points: map[entity.id][game.id]
                     });
                 }
             });

             gameScores.sort((a,b) => b.points - a.points);

             gameScores.slice(0, 3).forEach((s, index) => {
                 winners.push({
                     game: formatGameTitle(game),
                     rank: getOrdinalSuffix(index + 1),
                     entity: s.entity.name,
                     troop: s.entity.troop_number
                 });
             });
        });
        return winners;
    },

    calculateScoreContext: () => {
        const map = {};
        const gameGroups = {};
        store.scores.forEach(s => {
            if(!gameGroups[s.game_id]) gameGroups[s.game_id] = [];
            gameGroups[s.game_id].push(s);
        });

        Object.keys(gameGroups).forEach(gid => {
            const game = store.games.find(g => g.id === gid);
            const scores = gameGroups[gid].map(s => {
                let total = 0;
                if (game) {
                    (game.fields||[]).forEach(f => {
                        if (f.kind==='points'||f.kind==='penalty') {
                            const v = parseFloat(s.score_payload[f.id]);
                            if(!isNaN(v)) total += (f.kind==='penalty'?-v:v);
                        }
                    });
                }
                return { ...s, _total: total };
            });

            scores.sort((a,b) => b._total - a._total);
            let cr = 0; let lt = null;
            scores.forEach(s => {
                if(s._total !== lt) { cr++; lt = s._total; }
                const rank = s.score_payload.manual_rank || getOrdinalSuffix(cr);
                const pts = getPointsForRank(rank);
                if(!map[s.entity_id]) map[s.entity_id] = {};
                map[s.entity_id][gid] = pts;
            });
        });
        return map;
    },

    exportAwardsCSV: () => {
        const winners = utils.getWinners();
        if(winners.length === 0) return alert("No ranked scores found.");

        let csv = "Game,Rank,Troop,Name\n";
        winners.forEach(w => {
            csv += `"${w.game}",${w.rank},${w.troop},"${w.entity}"\n`;
        });

        const blob = new Blob([csv], {type: 'text/csv'});
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'awards.csv';
        a.click();
    },

    renderStickers: () => {
        const winners = utils.getWinners();
        const container = document.getElementById('stickers-container');
        container.innerHTML = '<div class="alert alert-info no-print">Press Ctrl+P to print stickers</div>';

        const table = document.createElement('table');
        table.className = 'sticker-table';
        let row = document.createElement('tr');

        winners.forEach((w, i) => {
            if(i > 0 && i % 3 === 0) {
                table.appendChild(row);
                row = document.createElement('tr');
            }
            const td = document.createElement('td');
            td.innerHTML = `
                <div class="sticker-content">
                    <div class="sticker-game">${w.game}</div>
                    <div class="sticker-header">${w.rank} Place</div>
                    <div class="sticker-info">Troop ${w.troop}<br>${w.entity}</div>
                </div>`;
            row.appendChild(td);
        });
        table.appendChild(row);
        container.appendChild(table);

        document.getElementById('stickers-preview-container').classList.remove('hidden');
    },

    // --- QR LOGIC ---
    setQrMode: (mode) => {
        document.getElementById('qr-wifi-form').classList.toggle('hidden', mode !== 'wifi');
        document.getElementById('qr-url-form').classList.toggle('hidden', mode !== 'url');

        document.getElementById('tab-wifi').classList.toggle('active', mode === 'wifi');
        document.getElementById('tab-url').classList.toggle('active', mode === 'url');
        document.getElementById('qr-output').innerHTML = '';
    },

    generateQRCode: () => {
        const container = document.getElementById('qr-output');
        container.innerHTML = '';
        let text = '';
        const mode = document.getElementById('tab-wifi').classList.contains('active') ? 'wifi' : 'url';

        if (mode === 'wifi') {
            const ssid = document.getElementById('qr-ssid').value;
            const pass = document.getElementById('qr-password').value;
            const enc = document.getElementById('qr-encryption').value;
            text = `WIFI:T:${enc};S:${ssid};P:${pass};;`;
        } else {
            text = document.getElementById('qr-url').value;
            const jName = document.getElementById('qr-judge-name').value;
            const jEmail = document.getElementById('qr-judge-email').value;
            const jUnit = document.getElementById('qr-judge-unit').value;
            if(jEmail) {
                const u = new URL(text);
                u.searchParams.set('judge_email', jEmail);
                if(jName) u.searchParams.set('judge_name', jName);
                if(jUnit) u.searchParams.set('judge_unit', jUnit);
                text = u.toString();
            }
        }

        new QRCode(container, { text: text, width: 256, height: 256 });
    },

    // --- SYSTEM LOGIC ---
    backupData: () => {
        window.location.href = '/api/export';
    },

    clearScores: async () => {
        if(confirm("Delete ALL scores? This cannot be undone.")) {
            await fetch('/api/admin/scores', { method: 'DELETE' });
            alert("Scores cleared.");
            window.location.reload();
        }
    },

    resetDb: async () => {
        if(confirm("FACTORY RESET? This will delete Roster AND Scores.")) {
            await fetch('/api/admin/full-reset', { method: 'DELETE' });
            alert("Database Reset.");
            window.location.reload();
        }
    }
};

// Export to window
window.utils = utils;
window.setQrMode = utils.setQrMode;
window.generateQRCode = utils.generateQRCode;

// Load
window.onload = utils.init;