#!/usr/bin/env node
/**
 * One-time migration: moves production_folders into the main folders tree.
 * Each production entry becomes a "production" environment-folder under the
 * matching workflow-name-group in folders[0].folders.
 */
const fs = require('fs');
const path = require('path');

const META_PATH = path.join(__dirname, '../n8n/workflows/metadata.json');
const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));

const prodFolders = meta.production_folders || [];
if (prodFolders.length === 0) {
  console.log('No production_folders to migrate.');
  process.exit(0);
}

// Build lookup: workflow-name-group slug → production folder entry
const prodByName = {};
for (const pf of prodFolders) {
  prodByName[pf.folder_name] = pf;
}

// Walk the main tree; for each workflow-name-group, add the production env-folder
function addProductionFolders(folders) {
  for (const folder of (folders || [])) {
    if (folder.environment === null && folder.folder_id === null) {
      // This is a workflow-name-group (virtual folder)
      const prod = prodByName[folder.folder_name];
      if (prod) {
        const alreadyHasProd = (folder.folders || []).some(f => f.environment === 'production');
        if (!alreadyHasProd) {
          folder.folders = folder.folders || [];
          folder.folders.push({
            folder_id: prod.folder_id,
            folder_name: 'production',
            environment: 'production',
            folders: [],
            workflows: prod.workflows || []
          });
          console.log(`  Added production folder to: ${folder.folder_name} (folder_id: ${prod.folder_id})`);
        } else {
          console.log(`  Already has production: ${folder.folder_name} (skipped)`);
        }
      } else {
        console.log(`  No production entry for: ${folder.folder_name}`);
      }
    }
    addProductionFolders(folder.folders);
  }
}

console.log('Migrating production_folders into main tree...');
addProductionFolders(meta.folders);

// Remove production_folders and production_project_id
delete meta.production_folders;
delete meta.production_project_id;

fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n');
console.log('\nDone. metadata.json updated.');
console.log('production_folders and production_project_id removed.');
