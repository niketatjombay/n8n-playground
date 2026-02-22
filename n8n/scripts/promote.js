#!/usr/bin/env node
/**
 * Promote a workflow from one environment to another.
 *
 * Usage:
 *   node promote.js case-study-creator dev stg
 *   node promote.js case-study-creator stg prod
 *
 * Steps:
 *   1. Promote shared sub-workflows used by this workflow (env-level)
 *   2. Read source main workflow JSON from workflows/{sourceEnv}/{slug}/
 *   3. Remap to target env (name, webhooks, sub-workflow IDs, URLs, creds)
 *   4. Save remapped JSON to workflows/{targetEnv}/{slug}/
 *   5. Deploy to n8n via API (create or update)
 *   6. Update metadata.json with new n8n IDs
 *
 * Directory layout:
 *   workflows/{env}/{slug}/main_workflow.json  — main workflows
 *   workflows/{env}/sub_workflows/{sub}.json   — shared sub-workflows
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const N8nClient = require('../lib/n8n-client');
const { remapWorkflow } = require('../lib/env-remap');
const {
  readMetadata, getSubWorkflows,
  updateWorkflowEnv, updateSubWorkflowEnv,
  findTodoPlaceholders
} = require('../lib/metadata');
const { promotionOrder } = require('../config/environments.config');
const fs = require('fs');
const path = require('path');

const ENV_ALIASES = { dev: 'development', stg: 'staging', prod: 'production' };

function resolveEnv(input) {
  return ENV_ALIASES[input] || input;
}

function filterPayload(workflow) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: {
      executionOrder: workflow.settings?.executionOrder || 'v1'
    }
  };
}

async function promote() {
  const [slug, srcArg, tgtArg] = process.argv.slice(2);

  if (!slug || !srcArg || !tgtArg) {
    console.error('Usage: node promote.js <workflow-slug> <source-env> <target-env>');
    console.error('  Envs: dev | stg | prod  (or full names)');
    console.error('  Example: node promote.js case-study-creator dev stg');
    process.exit(1);
  }

  const sourceEnv = resolveEnv(srcArg);
  const targetEnv = resolveEnv(tgtArg);

  // Validate promotion order
  const srcIdx = promotionOrder.indexOf(sourceEnv);
  const tgtIdx = promotionOrder.indexOf(targetEnv);
  if (srcIdx === -1 || tgtIdx === -1) {
    console.error(`Unknown environment. Valid: ${promotionOrder.join(', ')}`);
    process.exit(1);
  }
  if (tgtIdx <= srcIdx) {
    console.error(`Cannot promote backwards: ${sourceEnv} → ${targetEnv}`);
    console.error(`Promotion order: ${promotionOrder.join(' → ')}`);
    process.exit(1);
  }

  // Check for TODO placeholders in target env
  const todos = findTodoPlaceholders().filter(t =>
    t.path.startsWith(`${slug}.${targetEnv}`) ||
    t.path.startsWith(`sub_workflows.`) && t.path.includes(`.${targetEnv}.`)
  );
  if (todos.length > 0) {
    console.warn('\nNote: TODO placeholders in target env metadata (will be auto-filled on create):');
    todos.forEach(t => console.warn(`  ${t.path}: ${t.value}`));
    console.warn('');
  }

  console.log(`Promoting: ${slug}`);
  console.log(`  ${sourceEnv} → ${targetEnv}\n`);

  const meta = readMetadata();
  const entry = meta[slug];
  if (!entry) {
    console.error(`Workflow "${slug}" not found in metadata.json`);
    process.exit(1);
  }

  const client = new N8nClient();

  // --- Promote shared sub-workflows first ---
  const subSlugs = entry.uses_sub_workflows || [];
  const allSubs = getSubWorkflows();

  for (const subSlug of subSlugs) {
    const subEntry = allSubs[subSlug];
    if (!subEntry) {
      console.warn(`  Sub-workflow "${subSlug}" not in metadata — skipping`);
      continue;
    }

    const subPath = path.join(
      __dirname, '../workflows', sourceEnv, 'sub_workflows', `${subSlug}.json`
    );
    if (!fs.existsSync(subPath)) {
      console.warn(`  Sub-workflow file not found: ${subPath} — skipping`);
      continue;
    }

    console.log(`  Promoting sub-workflow: ${subSlug}`);
    const srcSubWf = JSON.parse(fs.readFileSync(subPath, 'utf8'));

    // Remap (strip metadata, rename)
    const tgtSubWf = remapWorkflow(srcSubWf, slug, sourceEnv, targetEnv);
    const tgtSubDir = path.join(__dirname, '../workflows', targetEnv, 'sub_workflows');
    fs.mkdirSync(tgtSubDir, { recursive: true });
    fs.writeFileSync(
      path.join(tgtSubDir, `${subSlug}.json`),
      JSON.stringify(tgtSubWf, null, 2) + '\n'
    );

    // Deploy — pass target env metadata for project_id/folder_id
    const existingId = subEntry[targetEnv]?.n8nId;
    const subEnvMeta = subEntry[targetEnv] || {};
    const result = await deployOne(client, tgtSubWf, existingId, subEnvMeta);
    console.log(`    ${result.created ? 'Created' : 'Updated'}: ${result.id}`);

    // Update metadata
    updateSubWorkflowEnv(subSlug, targetEnv, { n8nId: result.id });
  }

  // Reload metadata after sub-workflow updates (IDs may have changed)
  const freshMeta = readMetadata();

  // --- Promote main workflow ---
  const mainPath = path.join(
    __dirname, '../workflows', sourceEnv, slug, 'main_workflow.json'
  );
  if (!fs.existsSync(mainPath)) {
    console.error(`Main workflow not found: ${mainPath}`);
    console.error('Run backup first: npm run n8n:backup -- --env ' + sourceEnv);
    process.exit(1);
  }

  console.log(`  Promoting main workflow...`);
  const srcMainWf = JSON.parse(fs.readFileSync(mainPath, 'utf8'));

  // Remap using fresh metadata (which now has correct sub-workflow IDs)
  const tgtMainWf = remapWorkflow(srcMainWf, slug, sourceEnv, targetEnv);
  const tgtMainDir = path.join(__dirname, '../workflows', targetEnv, slug);
  fs.mkdirSync(tgtMainDir, { recursive: true });
  fs.writeFileSync(
    path.join(tgtMainDir, 'main_workflow.json'),
    JSON.stringify(tgtMainWf, null, 2) + '\n'
  );

  // Deploy — pass target env metadata for project_id/folder_id
  const existingMainId = freshMeta[slug]?.[targetEnv]?.n8nId;
  const mainEnvMeta = freshMeta[slug]?.[targetEnv] || {};
  const mainResult = await deployOne(client, tgtMainWf, existingMainId, mainEnvMeta);
  console.log(`    ${mainResult.created ? 'Created' : 'Updated'}: ${mainResult.id}`);

  // Update metadata
  updateWorkflowEnv(slug, targetEnv, {
    n8nId: mainResult.id,
    lastDeployedAt: new Date().toISOString()
  });

  console.log(`\nPromotion complete: ${slug} (${sourceEnv} → ${targetEnv})`);
  console.log(`  n8n ID: ${mainResult.id}`);
  console.log(`  Local: n8n/workflows/${targetEnv}/${slug}/main_workflow.json`);
}

/**
 * Deploy a single workflow — update if it exists, otherwise create.
 * On create: assigns to project_id and moves into folder_id.
 *
 * @param {object} envMeta - env block from metadata (has project_id, folder_id)
 */
async function deployOne(client, workflow, existingId, envMeta = {}) {
  const payload = filterPayload(workflow);

  // Try update first
  if (existingId && !existingId.startsWith('TODO')) {
    try {
      await client.getWorkflow(existingId);
      await client.updateWorkflow(existingId, payload);
      return { id: existingId, created: false };
    } catch {
      // Not found — fall through to create
    }
  }

  // Create new — include projectId so it lands in the right project
  const projectId = envMeta.project_id;
  if (projectId && !projectId.startsWith('TODO')) {
    payload.projectId = projectId;
  }

  const created = await client.createWorkflow(payload);

  // Move into the correct folder within the project
  const folderId = envMeta.folder_id;
  if (folderId && !folderId.startsWith('TODO')) {
    try {
      await client.moveWorkflowToFolder(created.id, folderId);
      console.log(`    Moved to folder: ${folderId}`);
    } catch (err) {
      console.warn(`    Warning: could not move to folder ${folderId}: ${err.message}`);
    }
  }

  return { id: created.id, created: true };
}

promote().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
