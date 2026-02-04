// designer_server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Set View Engine (uses existing views folder)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json()); // Support JSON bodies

// Main Route
app.get('/', (req, res) => {
    // We will create this view next
    res.render('designer/index', {
        title: 'Coyote Camporee Designer'
    });
});

// Serve Static Files (Shares the 'public' folder with the main app)
app.use(express.static(path.join(__dirname, 'public')));

// API: Save Camporee to Server
app.post('/api/camporee', (req, res) => {
    try {
        const data = req.body;
        // Save to a local file
        fs.writeFileSync(path.join(__dirname, 'camporee_data.json'), JSON.stringify(data, null, 2));
        console.log('Camporee saved to server.');
        res.json({ success: true, message: 'Saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Save Failed' });
    }
});

// API: Load Camporee from Server
app.get('/api/camporee', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'camporee_data.json');
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath, 'utf8');
            res.json(JSON.parse(fileData));
        } else {
            // If no file exists yet, return null or empty structure
            res.status(404).json({ message: 'No saved camporee found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Load Failed' });
    }
});

app.listen(PORT, () => {
    console.log(`--------------------------------------------------`);
    console.log(`Camporee Designer is running safely on Port ${PORT}`);
    console.log(`Access it at: http://localhost:${PORT}`);
    console.log(`--------------------------------------------------`);
});
