/**
 * OBSOLETE — superseded by scripts/migrate-unified-folders.js (2026-02-26)
 * DO NOT RUN: This script created the old production_folders structure that has
 * since been merged into the main folders tree. Running it would corrupt metadata.json.
 */
throw new Error('This script is obsolete. See scripts/migrate-unified-folders.js');

/**
 * One-time script: Restructure metadata.json to add production_folders as a
 * separate flat tree (one folder per workflow slug), and remove empty production
 * stubs from the dev/staging folders tree.
 */

const fs = require('fs');
const path = require('path');

const metaPath = path.join(process.cwd(), 'n8n/workflows/metadata.json');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

const productionStubs = {}; // slug -> { type, description, uses_sub_workflows, used_by }

// 1. Walk dev tree, collect slug metadata from dev entries
function collectFromDev(folders) {
  for (const folder of (folders || [])) {
    if (folder.environment === 'development') {
      for (const wf of (folder.workflows || [])) {
        if (!productionStubs[wf.slug]) {
          productionStubs[wf.slug] = {
            slug: wf.slug,
            type: wf.type,
            description: wf.description || null,
            uses_sub_workflows: wf.uses_sub_workflows,
            used_by: wf.used_by,
          };
        }
      }
    }
    collectFromDev(folder.folders);
  }
}
collectFromDev(meta.folders);

// 2. Strip production env folders from the dev/staging tree
function stripProductionFolders(folders) {
  for (const folder of (folders || [])) {
    folder.folders = (folder.folders || []).filter(f => f.environment !== 'production');
    stripProductionFolders(folder.folders);
  }
}
stripProductionFolders(meta.folders);

// 3. Build production_folders — one flat folder per slug
const slugOrder = [
  'pre-work-summary',
  'session-slides',
  'case-study-creator',
  'document-summary-extractor',
  'project-memory-updater',
  'llm-sub-workflow',
  'drive-utils',
];

const production_folders = slugOrder
  .filter(slug => productionStubs[slug])
  .map(slug => {
    const stub = productionStubs[slug];
    const wfEntry = {
      n8nId: null,
      name: slug,
      slug,
      type: stub.type,
      webhookPath: null,
      active: false,
      lastDeployedAt: null,
      archived: false,
      description: stub.description,
    };
    if (stub.uses_sub_workflows) wfEntry.uses_sub_workflows = stub.uses_sub_workflows;
    if (stub.used_by) wfEntry.used_by = stub.used_by;

    return {
      folder_id: null,
      folder_name: slug,
      environment: 'production',
      folders: [],
      workflows: [wfEntry],
    };
  });

// 4. Update top-level metadata
meta.production_project_id = 'JIV2elLHsVFXybZ2';
meta.production_folders = production_folders;

fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

console.log('production_project_id:', meta.production_project_id);
console.log('production_folders:', production_folders.map(f => `${f.folder_name} (${production_folders.find(x => x.folder_name === f.folder_name)?.workflows[0]?.type})`));
