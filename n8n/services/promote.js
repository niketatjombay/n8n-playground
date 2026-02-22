/**
 * Promote service — promotes a workflow from one environment to another.
 *
 * Extracts logic from scripts/promote.js but returns structured JSON.
 * Validates promotion order, promotes sub-workflows first, then main workflow.
 */

const { loadEnv } = require('../lib/env-loader');
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

/**
 * Resolve short env names to full names.
 * @param {string} input - 'dev', 'stg', 'prod', or full name
 * @returns {string}
 */
function resolveEnv(input) {
  return ENV_ALIASES[input] || input;
}

/**
 * Filter a workflow JSON to only the fields needed for the n8n API payload.
 */
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

/**
 * Deploy a single workflow — update if it exists, otherwise create.
 * On create: assigns to project_id and moves into folder_id.
 *
 * @param {N8nClient} client
 * @param {object} workflow - Remapped workflow JSON
 * @param {string|null} existingId - Current n8n ID (may be TODO placeholder)
 * @param {object} envMeta - env block from metadata (has project_id, folder_id)
 * @returns {Promise<{id: string, action: string, movedToFolder?: boolean, folderWarning?: string}>}
 */
async function deployOne(client, workflow, existingId, envMeta = {}) {
  const payload = filterPayload(workflow);

  // Try update first
  if (existingId && !existingId.startsWith('TODO')) {
    try {
      await client.getWorkflow(existingId);
      await client.updateWorkflow(existingId, payload);
      return { id: existingId, action: 'updated' };
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
  const result = { id: created.id, action: 'created' };

  // Move into the correct folder within the project
  const folderId = envMeta.folder_id;
  if (folderId && !folderId.startsWith('TODO')) {
    try {
      await client.moveWorkflowToFolder(created.id, folderId);
      result.movedToFolder = true;
    } catch (err) {
      result.folderWarning = `Could not move to folder ${folderId}: ${err.message}`;
    }
  }

  return result;
}

/**
 * Promote a workflow from one environment to another.
 *
 * @param {{ slug: string, sourceEnv: string, targetEnv: string }} options
 * @returns {Promise<{
 *   success: boolean,
 *   slug?: string,
 *   sourceEnv?: string,
 *   targetEnv?: string,
 *   steps: Array<{type, slug, status, action?, id?, error?, reason?, movedToFolder?, folderWarning?, todos?}>,
 *   error?: string
 * }>}
 */
async function promote({ slug, sourceEnv: srcArg, targetEnv: tgtArg }) {
  loadEnv();

  if (!slug || !srcArg || !tgtArg) {
    return {
      success: false,
      error: 'slug, sourceEnv, and targetEnv are all required'
    };
  }

  const sourceEnv = resolveEnv(srcArg);
  const targetEnv = resolveEnv(tgtArg);

  // Validate promotion order
  const srcIdx = promotionOrder.indexOf(sourceEnv);
  const tgtIdx = promotionOrder.indexOf(targetEnv);

  if (srcIdx === -1 || tgtIdx === -1) {
    return {
      success: false,
      error: `Unknown environment. Valid: ${promotionOrder.join(', ')}`
    };
  }

  if (tgtIdx <= srcIdx) {
    return {
      success: false,
      error: `Cannot promote backwards: ${sourceEnv} -> ${targetEnv}. Promotion order: ${promotionOrder.join(' -> ')}`
    };
  }

  const meta = readMetadata();
  const entry = meta[slug];
  if (!entry) {
    return {
      success: false,
      error: `Workflow "${slug}" not found in metadata.json`
    };
  }

  const steps = [];

  // Check for TODO placeholders in target env (informational)
  const todos = findTodoPlaceholders().filter(t =>
    t.path.startsWith(`${slug}.${targetEnv}`) ||
    (t.path.startsWith('sub_workflows.') && t.path.includes(`.${targetEnv}.`))
  );
  if (todos.length > 0) {
    steps.push({
      type: 'info',
      slug: null,
      status: 'warning',
      reason: 'TODO placeholders in target env metadata (will be auto-filled on create)',
      todos
    });
  }

  const client = new N8nClient();

  // --- Promote shared sub-workflows first ---
  const subSlugs = entry.uses_sub_workflows || [];
  const allSubs = getSubWorkflows();

  for (const subSlug of subSlugs) {
    const subEntry = allSubs[subSlug];
    if (!subEntry) {
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'skipped',
        reason: 'not in metadata'
      });
      continue;
    }

    const subPath = path.join(
      __dirname, '../workflows', sourceEnv, 'sub_workflows', `${subSlug}.json`
    );
    if (!fs.existsSync(subPath)) {
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'skipped',
        reason: 'source file not found'
      });
      continue;
    }

    try {
      const srcSubWf = JSON.parse(fs.readFileSync(subPath, 'utf8'));

      // Remap to target env
      const tgtSubWf = remapWorkflow(srcSubWf, slug, sourceEnv, targetEnv);

      // Write remapped file to target directory
      const tgtSubDir = path.join(__dirname, '../workflows', targetEnv, 'sub_workflows');
      fs.mkdirSync(tgtSubDir, { recursive: true });
      fs.writeFileSync(
        path.join(tgtSubDir, `${subSlug}.json`),
        JSON.stringify(tgtSubWf, null, 2) + '\n'
      );

      // Deploy
      const existingId = subEntry[targetEnv]?.n8nId;
      const subEnvMeta = subEntry[targetEnv] || {};
      const result = await deployOne(client, tgtSubWf, existingId, subEnvMeta);

      // Update metadata
      updateSubWorkflowEnv(subSlug, targetEnv, { n8nId: result.id });

      const step = {
        type: 'sub-workflow',
        slug: subSlug,
        status: 'success',
        action: result.action,
        id: result.id
      };
      if (result.movedToFolder) step.movedToFolder = true;
      if (result.folderWarning) step.folderWarning = result.folderWarning;
      steps.push(step);
    } catch (error) {
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'error',
        error: error.message
      });
    }
  }

  // --- Promote main workflow ---
  const mainPath = path.join(
    __dirname, '../workflows', sourceEnv, slug, 'main_workflow.json'
  );
  if (!fs.existsSync(mainPath)) {
    return {
      success: false,
      slug,
      sourceEnv,
      targetEnv,
      steps,
      error: `Main workflow not found: ${mainPath}. Run backup first.`
    };
  }

  try {
    const srcMainWf = JSON.parse(fs.readFileSync(mainPath, 'utf8'));

    // Remap using fresh metadata (sub-workflow IDs may have changed above)
    const tgtMainWf = remapWorkflow(srcMainWf, slug, sourceEnv, targetEnv);

    // Write remapped file to target directory
    const tgtMainDir = path.join(__dirname, '../workflows', targetEnv, slug);
    fs.mkdirSync(tgtMainDir, { recursive: true });
    fs.writeFileSync(
      path.join(tgtMainDir, 'main_workflow.json'),
      JSON.stringify(tgtMainWf, null, 2) + '\n'
    );

    // Deploy — reload metadata for fresh sub-workflow IDs
    const freshMeta = readMetadata();
    const existingMainId = freshMeta[slug]?.[targetEnv]?.n8nId;
    const mainEnvMeta = freshMeta[slug]?.[targetEnv] || {};
    const mainResult = await deployOne(client, tgtMainWf, existingMainId, mainEnvMeta);

    // Update metadata
    updateWorkflowEnv(slug, targetEnv, {
      n8nId: mainResult.id,
      lastDeployedAt: new Date().toISOString()
    });

    const step = {
      type: 'main',
      slug,
      status: 'success',
      action: mainResult.action,
      id: mainResult.id
    };
    if (mainResult.movedToFolder) step.movedToFolder = true;
    if (mainResult.folderWarning) step.folderWarning = mainResult.folderWarning;
    steps.push(step);
  } catch (error) {
    steps.push({
      type: 'main',
      slug,
      status: 'error',
      error: error.message
    });

    return {
      success: false,
      slug,
      sourceEnv,
      targetEnv,
      steps,
      error: error.message
    };
  }

  return {
    success: true,
    slug,
    sourceEnv,
    targetEnv,
    steps
  };
}

module.exports = { promote, resolveEnv };
