import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// Default to all three services during development if not specified
const ACTIVE_SERVICES = (process.env.ACTIVE_SERVICES || 'curator,composer,collator').split(',').map(s => s.trim().toLowerCase());

const app = express();

// --- DASHBOARD UI (When Multiple Services Run) ---
const renderDashboard = (activeServices) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Camporee Conductor - Multi-Service Launchpad</title>
    <!-- Use the existing bundled Bootstrap CSS for convenience -->
    <link rel="stylesheet" href="/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { background-color: #1a1e23; color: #f8f9fa; }
        .hero { padding: 4rem 2rem; background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%); margin-bottom: 2rem; border-bottom: 4px solid #084298; }
        .service-card { transition: transform 0.2s, box-shadow 0.2s; background: #2b3035; border: 1px solid #495057; }
        .service-card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.3); border-color: #0d6efd; }
        .icon-wrapper { font-size: 3rem; color: #0d6efd; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="hero text-center">
        <h1 class="display-4 fw-bold"><i class="fas fa-campground"></i> Camporee Conductor</h1>
        <p class="lead text-white-50">Local Development Launchpad</p>
    </div>
    
    <div class="container">
        <div class="row justify-content-center g-4">
            ${activeServices.includes('curator') ? `
            <div class="col-md-4">
                <a href="/curator/" class="text-decoration-none text-light">
                    <div class="card service-card h-100 p-4 text-center rounded-4">
                        <div class="icon-wrapper"><i class="fas fa-book-open"></i></div>
                        <h3 class="card-title fw-bold">Curator</h3>
                        <p class="card-text text-muted">The Global Vault. Master repository of Game Templates and library schemas.</p>
                        <span class="btn btn-outline-primary mt-auto">Open Curator</span>
                    </div>
                </a>
            </div>` : ''}
            
            ${activeServices.includes('composer') ? `
            <div class="col-md-4">
                <a href="/composer/" class="text-decoration-none text-light">
                    <div class="card service-card h-100 p-4 text-center rounded-4">
                        <div class="icon-wrapper"><i class="fas fa-drafting-compass"></i></div>
                        <h3 class="card-title fw-bold">Composer</h3>
                        <p class="card-text text-muted">The Planner's Workbench. Design, arrange, and export specific camporee blueprints.</p>
                        <span class="btn btn-outline-primary mt-auto">Open Composer</span>
                    </div>
                </a>
            </div>` : ''}

            ${activeServices.includes('collator') ? `
            <div class="col-md-4">
                <a href="/collator/" class="text-decoration-none text-light">
                    <div class="card service-card h-100 p-4 text-center rounded-4">
                        <div class="icon-wrapper"><i class="fas fa-server"></i></div>
                        <h3 class="card-title fw-bold">Collator</h3>
                        <p class="card-text text-muted">The Offline Engine. Live scoring, bracket management, and event execution.</p>
                        <span class="btn btn-outline-primary mt-auto">Open Collator</span>
                    </div>
                </a>
            </div>` : ''}
        </div>
    </div>
</body>
</html>
`;

// --- MOUNT SERVICES ---
async function startServer() {
    console.log(`Starting Camporee Conductor with services: ${ACTIVE_SERVICES.join(', ')}`);

    // 1. Mount Composer
    if (ACTIVE_SERVICES.includes('composer')) {
        const composerModule = await import('./src/servers/composer.js');
        // Composer handles its own static routing for its UI layout
        app.use('/composer', composerModule.default);
        console.log("-> Mounted Composer at /composer");
    }

    // 2. Mount Collator
    if (ACTIVE_SERVICES.includes('collator')) {
        const collatorModule = await import('./src/servers/collator.js');
        app.use('/collator', collatorModule.default);
        console.log("-> Mounted Collator at /collator");
    }

    // 3. (Optional) Mount Curator if we create a backend for it later.
    // Right now, Curator is purely a frontend app served from /public
    // To maintain isolation, we will map a route to explicitly serve the curator HTML
    if (ACTIVE_SERVICES.includes('curator')) {
        app.get('/curator', (req, res) => res.redirect('/curator/'));
        app.use('/curator/', express.static(path.join(__dirname, 'public')));
        // Also map library for curator UI access
        app.use('/curator/library/games', express.static(process.env.LIBRARY_PATH || path.join(__dirname, 'data', 'library')));
        console.log("-> Mounted Curator UI at /curator/");
    }

    // 4. Global fallback for static assets that all shared views might need 
    // (like bootstrap CSS, fontawesome)
    app.use(express.static('public', { index: false }));

    // --- ROOT ROUTING (The Gateway) ---
    app.get('/', (req, res) => {
        if (ACTIVE_SERVICES.length === 1) {
            // Strict Isolation Redirect
            res.redirect(`/${ACTIVE_SERVICES[0]}/`);
        } else {
            // Developer Dashboard
            res.send(renderDashboard(ACTIVE_SERVICES));
        }
    });

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n==============================================`);
        console.log(`🚀 Conductor Gateway listening on http://0.0.0.0:${PORT}`);
        console.log(`==============================================\n`);
    });
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
