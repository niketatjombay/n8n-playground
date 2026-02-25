/**
 * One-time migration: converts flat metadata.json to hierarchical folder tree.
 *
 * Structure after migration:
 *   project -> parent folder -> agent folder (per slug) -> env folder -> workflow
 *
 * Agent folder_id is null (API doesn't support folder listing).
 * Env folder_id is taken from existing metadata per-env blocks.
 */

const fs = require('fs');
const path = require('path');

const METADATA_PATH = path.join(__dirname, '..', 'n8n', 'workflows', 'metadata.json');
const PROJECT_ID = 'JIV2elLHsVFXybZ2';
const PARENT_FOLDER_ID = 'KGg3wvRmKtMMmlIv';
const ENVS = ['development', 'staging', 'production'];

const old = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));

// Slugs are all top-level keys except sub_workflows
const mainSlugs = Object.keys(old).filter(k => k !== 'sub_workflows');
const subSlugs = Object.keys(old.sub_workflows || {});

function buildEnvFolders(slug, envBlocks, type) {
  const folders = [];
  for (const env of ENVS) {
    const envBlock = envBlocks[env];
    if (!envBlock) continue;

    const n8nId = envBlock.n8nId || null;
    const isTodo = n8nId && n8nId.startsWith('TODO');

    const entry = {
      n8nId: n8nId,
      name: envBlock.name || null,   // will be filled by sync
      slug: slug,
      type: type,
      webhookPath: envBlock.webhookPath || null,
      active: envBlock.active || false,
      lastDeployedAt: envBlock.lastDeployedAt || null,
      archived: false
    };

    // Add top-level metadata fields to the workflow entry
    // (these are the same across env instances)
    // We add them only to first env for non-duplication, but actually
    // we add to ALL instances since sync will update name from live API anyway

    folders.push({
      folder_id: envBlock.folder_id || null,
      folder_name: env,
      environment: env,
      folders: [],
      workflows: isTodo ? [] : [entry]  // skip TODO placeholders
    });
  }
  return folders;
}

// Build agent folders for main workflows
const agentFolders = mainSlugs.map(slug => {
  const wf = old[slug];
  return {
    folder_id: null,
    folder_name: slug,
    environment: null,
    folders: buildEnvFolders(slug, wf, 'main').map(envFolder => {
      // Attach top-level metadata to each workflow in this agent folder
      if (envFolder.workflows.length > 0) {
        const w = envFolder.workflows[0];
        if (wf.description) w.description = wf.description;
        if (wf.uses_sub_workflows) w.uses_sub_workflows = wf.uses_sub_workflows;
        if (wf.input) w.input = wf.input;
      }
      return envFolder;
    }),
    workflows: []
  };
});

// Build agent folders for sub-workflows
const subFolders = subSlugs.map(slug => {
  const sub = old.sub_workflows[slug];
  return {
    folder_id: null,
    folder_name: slug,
    environment: null,
    folders: buildEnvFolders(slug, sub, 'sub').map(envFolder => {
      if (envFolder.workflows.length > 0) {
        const w = envFolder.workflows[0];
        if (sub.description) w.description = sub.description;
        if (sub.used_by) w.used_by = sub.used_by;
        if (sub.api_endpoint) w.api_endpoint = sub.api_endpoint;
        if (sub.nodes) w.nodes = sub.nodes;
        if (sub.input) w.input = sub.input;
        if (sub.output) w.output = sub.output;
        if (sub.notes) w.notes = sub.notes;
      }
      return envFolder;
    }),
    workflows: []
  };
});

const newMeta = {
  project_id: PROJECT_ID,
  project_name: PROJECT_ID,
  folders: [{
    folder_id: PARENT_FOLDER_ID,
    folder_name: 'Workflows',
    environment: null,
    folders: [...agentFolders, ...subFolders],
    workflows: []
  }]
};

fs.writeFileSync(METADATA_PATH, JSON.stringify(newMeta, null, 2) + '\n');
console.log('Migration complete.');
console.log('Main workflows:', mainSlugs.length);
console.log('Sub-workflows:', subSlugs.length);
