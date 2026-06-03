import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

const SUBMISSIONS_DIR  = process.env.SUBMISSIONS_PATH || path.join(__dirname, '../../data/landing');
const SUBMISSIONS_FILE = path.join(SUBMISSIONS_DIR, 'submissions.json');

app.use(express.json());

// Static assets — serve from public/
const PUBLIC = path.join(__dirname, '../../public');
app.use('/css',    express.static(path.join(PUBLIC, 'css')));
app.use('/images', express.static(path.join(PUBLIC, 'images')));
app.use('/favicon.ico', express.static(path.join(PUBLIC, 'favicon.ico')));

// Landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC, 'camporee-conductor-landing.html'));
});

// Early access form handler
app.post('/api/early-access', (req, res) => {
    const { name, email, council, district, role, years, units, patrols,
            scouts, unit_adults, adult_staff, youth_staff } = req.body;

    if (!email) return res.status(400).json({ ok: false, error: 'Email required' });

    const entry = {
        timestamp:   new Date().toISOString(),
        name:        name        || '',
        email,
        council:     council     || '',
        district:    district    || '',
        role:        role        || '',
        years:       years       != null ? Number(years)       : null,
        units:       units       != null ? Number(units)       : null,
        patrols:     patrols     != null ? Number(patrols)     : null,
        scouts:      scouts      != null ? Number(scouts)      : null,
        unit_adults: unit_adults != null ? Number(unit_adults) : null,
        adult_staff: adult_staff != null ? Number(adult_staff) : null,
        youth_staff: youth_staff != null ? Number(youth_staff) : null,
    };

    try {
        fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
        let submissions = [];
        try { submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8')); } catch { /* new file */ }
        submissions.push(entry);
        fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2));
        console.log(`[early-access] new submission from ${email}`);
        res.json({ ok: true });
    } catch (err) {
        console.error('[early-access] write error:', err);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});

// Catch-all 404
app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => console.log(`Landing server running on port ${PORT}`));

export default app;
