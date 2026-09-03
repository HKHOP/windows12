const fs = require('fs');
const path = require('path');

const changelog = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8');
const match = changelog.match(/\[(\d+\.\d+\.\d+)\]/);
if (!match) {
    console.error('No version found in CHANGELOG.md');
    process.exit(1);
}

const version = match[1];
console.log(`Found version: ${version}`);

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const updated = indexHtml.replace(/\?v=[^\s"']+/g, `?v=${version}`);

if (updated === indexHtml) {
    console.log('No changes needed');
} else {
    fs.writeFileSync(path.join(__dirname, 'index.html'), updated);
    console.log(`Updated all ?v= query strings to ${version}`);
}
