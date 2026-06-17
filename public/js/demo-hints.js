(function () {
    'use strict';

    const HINT_PREFIX = 'demo-hint-v1-';
    const KNOWN_PAGES = ['composer', 'admin', 'registration', 'judges', 'judge', 'official', 'game-detail', 'utils', 'utils-awards', 'utils-debug', 'utils-qrcode', 'demo-phone', 'identify'];

    const HINTS = {
        composer: {
            title: 'Welcome to the Composer — Demo Mode',
            maxWidth: '580px',
            body: `
                <p><strong>Camporee Composer</strong> is where events are built — define games, write Game Guides, configure scoring, and export the cartridge that drives the Collator.</p>

                <p style="background:#fff8e1;border-left:3px solid #d4a017;padding:0.6rem 0.9rem;border-radius:0 4px 4px 0;margin:0.75rem 0;font-size:0.9rem;">
                  <strong>Demo Mode:</strong> You can freely explore and edit — changes exist only in this browser session and will not be saved. <strong>Export Zip</strong> is fully live and generates a real deployable cartridge from whatever you see. The Collator demo runs its own fixed dataset independently.
                </p>

                <p style="margin-bottom:0.4rem;"><strong>Creating a Game</strong> — click <strong>+</strong> next to Patrol Games, Troop Challenges, or Exhibition Events in the left sidebar. Each game has three tabs:</p>
                <ul style="padding-left:1.2rem;margin:0.3rem 0 0.75rem;">
                  <li><strong>Metadata</strong> — the game's identity: title, station number, theme description, and searchable tags. This information appears in the printed Game Guide and on paper scoresheets.</li>
                  <li><strong>Game Guide</strong> — the narrative document handed to station volunteers before the event. Write setup instructions, backstory, materials list, and judging criteria. The <strong>AI Theme</strong> button lets Gemini rewrite the entire guide in your Camporee theme. <strong>AI Update</strong> lets you give targeted direction ("add a tiebreaker rule," "rewrite as a pirate ship challenge").</li>
                  <li><strong>Scoring</strong> — the fields a judge fills in at the station: game-specific inputs like Time, Distance, or Score. Separate from these are <strong>Common Fields</strong> — event-wide presets (Patrol Yell, Flag, Scout Spirit, 10 Essentials) automatically injected into every game by the Collator at runtime. Configure them once in <em>Scoring Presets</em> and they travel with the entire event.</li>
                </ul>`
        },
        judges: {
            title: 'Judges Directory',
            body: `<p>This view gives Officials a look at the volunteer judges who recorded and submitted scores at their game stations.</p>
                   <p>If a judge provided their email address when signing in, the Camporee Director can follow up after the event — thanking them for their time and inviting them back to volunteer next year.</p>`
        },
        registration: {
            title: 'Registration',
            body: `<p>Here Troops and Patrols are entered for the Camporee.</p>
                   <p>Troop Number does not have to be unique — if it isn't, ensure the <strong>Troop Name</strong> is unique. For example: <em>T2, Troop 2 Monterey</em> and <em>T2, Troop 2 Los Gatos</em> can coexist.</p>
                   <p>After creating a Troop, <strong>Patrols</strong> can be added under it. Each Patrol receives a unique internal ID to disambiguate patrols with the same name — handy when a Camporee has four different "Sharks" patrols.</p>`
        },
        admin: {
            title: 'Officials Dashboard',
            body: `<p>This is the onsite event control center for Camporee Officials.</p>
                   <ul style="padding-left:1.2rem;margin:0.5rem 0;">
                     <li><strong>Registration</strong> — where Troops and their respective Patrols are entered for the event.</li>
                     <li><strong>Scoring</strong> — the main activity for officials during the Camporee.</li>
                     <li><strong>Awards</strong> — after scoring is completed, print stickers for the Award Ribbons and script notes for the Awards Emcee.</li>
                     <li><strong>Judges</strong> — review and collect Judge information for later thanking volunteers.</li>
                     <li><strong>System</strong> — lesser-used utilities.</li>
                     <li><strong>QR Gen</strong> — print custom QR codes for judges to scan to gain WiFi access and download the Judge App.</li>
                   </ul>`
        },
        judge: {
            title: 'Judge App',
            body: `<p>This is the <strong>Judge PWA</strong> — exactly what a judge sees on their phone at a game station.</p>
                   <p>No app install needed. Works offline. Try <strong>selecting a patrol</strong>, filling in the scores, and hitting Submit — the leaderboard updates live.</p>
                   <p>At a real event, each judge gets a QR code linking them directly to their assigned game.</p>`
        },
        'game-detail': {
            title: "Official's Game Scorecard",
            body: `<p>This window shows scoring and notes as recorded and submitted by the game judge.</p>
                   <p>Officials will see <strong>additional columns</strong> here that judges do not see on their phones.</p>
                   <p>All games are ultimately scored and ranked by <strong>point values</strong>. However, some fields recorded by judges are <strong>Metrics</strong> — raw measurements rather than points:</p>
                   <ul style="padding-left:1.2rem;margin:0.5rem 0;">
                     <li>For some metrics, <strong>lower is better</strong> — e.g. time to complete a task, or matches used to start a fire.</li>
                     <li>For others, <strong>higher is better</strong> — e.g. longest handstand, or most milk crates stacked.</li>
                   </ul>
                   <p>It is up to the Officials reviewing each game to decide how to convert metrics into points — a continuous formula (e.g. <em>time ÷ 10 = points</em>) or a stepwise function (e.g. <em>under 2 min = 50 pts, 2–4 min = 25 pts</em>). The final call belongs to the Camporee Official.</p>`
        },
        official: {
            title: 'Competition Overview',
            body: `<p>This view gives Officials a summary of scoring turned in — organized by game and competition.</p>
                   <ul style="padding-left:1.2rem;margin:0.5rem 0;">
                     <li>The <strong>pulldown in the upper right</strong> switches the view between competitions (e.g. Patrol Games, Troop Challenges, Exhibition Events).</li>
                     <li>All games in the selected competition are listed along with the <strong>number of scores uploaded</strong> to the Collator.</li>
                     <li>Use the <strong>Open</strong> button to drill down and see the full scoring breakdown for any game.</li>
                     <li>A <strong>toggle</strong> on each game lets Officials mark when scoring and rankings have been completed.</li>
                   </ul>`
        },
        'utils-qrcode': {
            title: 'QR Code Generator',
            body: `<p>Create custom QR codes to hand to judges at the start of the event.</p>
                   <p>A judge scans the QR code with their phone — it automatically connects them to the local WiFi network <strong>and</strong> opens the Judge web app in one step. No typing URLs, no manual network setup.</p>
                   <p>Print one QR code per game station and post it where judges can find it.</p>`
        },
        'utils-debug': {
            title: 'System & Debug Tools',
            body: `<p>This page is a catch-all work-in-progress and will likely be reorganized soon.</p>
                   <p>Its most important feature is the <strong>Cartridge Upload</strong> — this is the first thing a Camporee Director does when bringing up the Collator. A cartridge (created in Camporee Composer) is uploaded here to load the event's games, rosters, and configuration into the Collator.</p>
                   <p>It also allows Officials to set the <strong>primary and accent colors</strong> used in the Judge and Official applications, so the look can match the theme of the Camporee.</p>
                   <p>The remaining tools are for testing and debugging the Collator and event setup.</p>`
        },
        'utils-awards': {
            title: 'Awards Creator',
            body: `<p>From this window Officials can generate award materials for the ceremony.</p>
                   <ul style="padding-left:1.2rem;margin:0.5rem 0;">
                     <li><strong>Award Label PDF</strong> — generates a printable PDF with the Camporee name, theme/title, event name, and winners' names. Print onto full-sheet sticky labels, then cut and apply to award ribbons.</li>
                     <li><strong>CSV Export</strong> — exports the same information for use in another application or mail-merge workflow.</li>
                     <li><strong>Announcer Notes</strong> — printable script with event name and 1st, 2nd, and 3rd place finishers for the Awards Emcee to read from the stage.</li>
                   </ul>`
        },
        utils: {
            title: 'Director Utilities',
            body: `<p>Day-of tools for the Camporee Director.</p>
                   <p>Generate <strong>printable scoresheets</strong> to hand to judges before the event, print <strong>QR code station cards</strong>, and manage game status as the day progresses.</p>
                   <p>Judges get paper scoresheets as a backup to the phone app — these utilities produce them in one click.</p>`
        },
        'demo-phone': {
            title: 'Judge Phone Emulator',
            body: `<p>This is the <strong>side-by-side demo view</strong> — a simulated judge phone next to the Officials Game Overview.</p>
                   <p>Pick an open game in the emulator, select a patrol, enter scores, and hit <strong>Submit</strong>. Watch the Officials Game Overview on the right update instantly.</p>
                   <p>This is exactly what the judge experience looks like on a real Android phone at a game station.</p>`
        },
        identify: {
            title: 'Demo Sign-In',
            body: `<p>This is the <strong>official sign-in page</strong> for the Collator.</p>
                   <p>In the demo, <strong>any email address works</strong> — no password, no account needed. Just enter an email and you're in as a demo director.</p>
                   <p>In a real event deployment, sign-in is restricted to officials listed in the event cartridge.</p>`
        }
    };

    function getPageId() {
        const pathname = window.location.pathname;
        if (pathname.startsWith('/composer')) return 'composer';
        const filename = pathname.split('/').pop().replace('.html', '');
        const hash = window.location.hash.replace('#', '');
        if (filename === 'utils' && hash) return `utils-${hash}`;
        return filename || 'admin';
    }

    function storageKey(pageId) {
        return HINT_PREFIX + pageId;
    }

    function isDismissed(pageId) {
        return localStorage.getItem(storageKey(pageId)) === 'dismissed';
    }

    function closeModal(pageId, permanently) {
        if (permanently) {
            localStorage.setItem(storageKey(pageId), 'dismissed');
        }
        document.getElementById('dh-backdrop')?.remove();
    }

    window.resetDemoHints = function () {
        KNOWN_PAGES.forEach(p => localStorage.removeItem(HINT_PREFIX + p));
    };

    window.showDemoHint = function (id) {
        const hint = HINTS[id];
        if (!hint || isDismissed(id)) return;
        if (!document.getElementById('dh-backdrop')) {
            document.body.appendChild(buildModal(id, hint));
        }
    };

    function buildModal(pageId, hint) {
        const backdrop = document.createElement('div');
        backdrop.id = 'dh-backdrop';
        Object.assign(backdrop.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(0,0,0,0.5)',
            zIndex: '1050',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        });

        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            background: '#fff', borderRadius: '8px',
            maxWidth: hint.maxWidth || '480px', width: '100%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            overflow: 'hidden'
        });

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            background: 'var(--brand-header, #1a3a2a)', color: '#fff',
            padding: '1rem 1.25rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem'
        });
        header.innerHTML = `<span style="background:var(--gold,#d4a017);color:#1a3a2a;font-weight:700;font-size:0.7rem;letter-spacing:0.08em;padding:2px 8px;border-radius:3px;text-transform:uppercase;">DEMO</span>
                            <strong style="font-size:1rem;">${hint.title}</strong>`;

        // Body
        const body = document.createElement('div');
        Object.assign(body.style, {
            padding: '1.25rem', fontSize: '0.95rem',
            lineHeight: '1.6', color: '#333'
        });
        body.innerHTML = hint.body;

        // Footer
        const footer = document.createElement('div');
        Object.assign(footer.style, {
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid #e5e5e5',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem'
        });

        const left = document.createElement('div');
        Object.assign(left.style, { display: 'flex', flexDirection: 'column', gap: '0.3rem' });

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'dh-dont-show';
        checkbox.checked = true;
        checkbox.style.cursor = 'pointer';

        const checkLabel = document.createElement('label');
        checkLabel.htmlFor = 'dh-dont-show';
        Object.assign(checkLabel.style, { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#555', cursor: 'pointer' });
        checkLabel.appendChild(checkbox);
        checkLabel.appendChild(document.createTextNode("Don't show again"));

        const resetLink = document.createElement('a');
        resetLink.href = '#';
        resetLink.textContent = 'Reset all hints';
        Object.assign(resetLink.style, { fontSize: '0.8rem', color: '#999' });
        resetLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.resetDemoHints();
            closeModal(pageId, false);
        });

        left.appendChild(checkLabel);
        left.appendChild(resetLink);

        const gotItBtn = document.createElement('button');
        gotItBtn.textContent = 'Got it';
        Object.assign(gotItBtn.style, {
            background: 'var(--brand-main, #2d6a4f)', color: '#fff',
            border: 'none', borderRadius: '5px',
            padding: '0.45rem 1.25rem',
            fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap'
        });
        gotItBtn.addEventListener('click', () => closeModal(pageId, checkbox.checked));

        footer.appendChild(left);
        footer.appendChild(gotItBtn);

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        backdrop.appendChild(dialog);
        return backdrop;
    }

    function buildFAB(pageId, hint) {
        const btn = document.createElement('button');
        btn.id = 'dh-fab';
        btn.textContent = '?';
        btn.title = 'Demo Help';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '1.25rem', right: '1.25rem',
            width: '2.5rem', height: '2.5rem', borderRadius: '50%',
            background: 'var(--brand-main, #2d6a4f)', color: '#fff',
            border: 'none', fontSize: '1.1rem', fontWeight: '700',
            cursor: 'pointer', zIndex: '1040',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        });
        btn.addEventListener('click', () => {
            if (!document.getElementById('dh-backdrop')) {
                document.body.appendChild(buildModal(pageId, hint));
            }
        });
        return btn;
    }

    async function init() {
        if (window.self !== window.top) return; // suppress inside iframes

        const pageId = getPageId();
        const hint = HINTS[pageId];
        if (!hint) return;

        try {
            const res = await fetch((window.API_BASE || '/collator') + '/api/demo-mode');
            if (!res.ok) return;
            const { demo } = await res.json();
            if (!demo) return;
        } catch {
            return;
        }

        document.body.appendChild(buildFAB(pageId, hint));

        if (!isDismissed(pageId)) {
            document.body.appendChild(buildModal(pageId, hint));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
