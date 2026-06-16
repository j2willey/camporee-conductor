(function () {
    'use strict';

    const HINT_PREFIX = 'demo-hint-v1-';
    const KNOWN_PAGES = ['admin', 'judge', 'official', 'utils', 'demo-phone', 'identify'];

    const HINTS = {
        admin: {
            title: 'Game Overview',
            body: `<p>You're looking at the <strong>Director Dashboard</strong> — the command center officials use during a live Camporee event.</p>
                   <p>The <strong>top 10 games</strong> show real finalized scores from the 2026 Coyote Creek Circus Camporee. The <strong>bottom 8 games</strong> are open and ready for you to demo live scoring from a judge's phone.</p>
                   <p>Try opening the <strong>Judge Emulator</strong> from the menu to submit a score and watch it appear here in real time.</p>`
        },
        judge: {
            title: 'Judge App',
            body: `<p>This is the <strong>Judge PWA</strong> — exactly what a judge sees on their phone at a game station.</p>
                   <p>No app install needed. Works offline. Try <strong>selecting a patrol</strong>, filling in the scores, and hitting Submit — the leaderboard updates live.</p>
                   <p>At a real event, each judge gets a QR code linking them directly to their assigned game.</p>`
        },
        official: {
            title: 'Live Leaderboard',
            body: `<p>This is the <strong>Official Leaderboard</strong> — the standings screen displayed at the awards ceremony.</p>
                   <p>Rankings update automatically as scores come in. The data shown is real finalized results from the <strong>2026 Coyote Creek Circus Camporee</strong> (205 Scouts, 18 games).</p>
                   <p>Submit a score from the Judge Emulator and watch the standings shift in real time.</p>`
        },
        utils: {
            title: 'Director Utilities',
            body: `<p>Day-of tools for the Camporee Director.</p>
                   <p>Generate <strong>printable scoresheets</strong> to hand to judges before the event, print <strong>QR code station cards</strong>, and manage game status as the day progresses.</p>
                   <p>Judges get paper scoresheets as a backup to the phone app — these utilities produce them in one click.</p>`
        },
        'demo-phone': {
            title: 'Judge Phone Emulator',
            body: `<p>This is the <strong>side-by-side demo view</strong> — a simulated judge phone next to the live leaderboard.</p>
                   <p>Pick an open game in the emulator, select a patrol, enter scores, and hit <strong>Submit</strong>. Watch the leaderboard on the right update instantly.</p>
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
        const filename = window.location.pathname.split('/').pop().replace('.html', '');
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
            maxWidth: '480px', width: '100%',
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
