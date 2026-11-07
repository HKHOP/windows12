// scripts/tag-iframe-apps.js
// Automatically adds "iframe-app": true to manifests of apps whose main.js
// uses an <iframe> as the primary content (web-wrapper pattern).
// Apps that use iframes internally for other reasons (browser, fileExplorer,
// words) are excluded by the EXCLUDE list.
// Run with: node scripts/tag-iframe-apps.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'js', 'apps');

// Apps that use iframes internally but are NOT iframe wrappers
const EXCLUDE = new Set(['browser', 'fileExplorer', 'words', 'vscode']);

let tagged = 0;
let skipped = 0;
let alreadyTagged = 0;

const apps = fs.readdirSync(APPS_DIR).sort();
for (const app of apps) {
    const p = path.join(APPS_DIR, app);
    if (!fs.statSync(p).isDirectory()) continue;
    if (EXCLUDE.has(app)) { skipped++; continue; }

    const manifestPath = path.join(p, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const mainPath = path.join(p, manifest.entry || 'main.js');
    if (!fs.existsSync(mainPath)) continue;

    const main = fs.readFileSync(mainPath, 'utf8');
    const hasIframe = /<iframe\b/i.test(main) || /createElement\(['"]iframe['"]\)/i.test(main);

    if (!hasIframe) continue;

    if (manifest['iframe-app'] === true) {
        console.log(`  already tagged: ${app}`);
        alreadyTagged++;
        continue;
    }

    // Add iframe-app flag and bump patch version
    manifest['iframe-app'] = true;

    // Bump patch version
    const verParts = String(manifest.version || '1.0.0').split('.').map(Number);
    verParts[2] = (verParts[2] || 0) + 1;
    manifest.version = verParts.join('.');

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`  tagged ${app} -> v${manifest.version}`);
    tagged++;
}

console.log(`\nDone: ${tagged} tagged, ${alreadyTagged} already tagged, ${skipped} excluded.`);
