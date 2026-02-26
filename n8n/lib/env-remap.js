/**
 * Environment remapping for n8n workflow JSONs.
 *
 * Walks every node and rewrites:
 *   1. Workflow name — strip source prefix, apply target prefix
 *   2. Webhook nodes — rewrite parameters.path to target env webhookPath
 *   3. executeWorkflow nodes — swap sub-workflow IDs via metadata map
 *   4. httpRequest nodes — replace coreapi URL and credential id/name
 *   5. Strip instance metadata (id, createdAt, updatedAt, versionId, etc.)
 *
 * LLM URL (agentcoreapi.jombay.com) is identical across envs — no remapping.
 */

const { environments, getEnvironmentConfig } = require('../config/environments.config');
const { buildSubWorkflowIdMap, getWorkflowEnv } = require('./metadata');

/**
 * Deep-clone a workflow JSON and remap it from sourceEnv → targetEnv.
 *
 * @param {object}  workflow   - Full n8n workflow JSON
 * @param {string}  slug       - Workflow slug in metadata.json (e.g. "case-study-creator")
 * @param {string}  sourceEnv  - "development" | "staging" | "production"
 * @param {string}  targetEnv  - "development" | "staging" | "production"
 * @returns {object} remapped workflow (new object, original untouched)
 */
function remapWorkflow(workflow, slug, sourceEnv, targetEnv) {
  const srcCfg = getEnvironmentConfig(sourceEnv);
  const tgtCfg = getEnvironmentConfig(targetEnv);

  if (!srcCfg) throw new Error(`Unknown source environment: ${sourceEnv}`);
  if (!tgtCfg) throw new Error(`Unknown target environment: ${targetEnv}`);

  const tgtMeta = getWorkflowEnv(slug, targetEnv);
  const subIdMap = buildSubWorkflowIdMap(slug, sourceEnv, targetEnv);

  // Deep clone
  const wf = JSON.parse(JSON.stringify(workflow));

  // 1. Remap workflow name
  wf.name = remapName(wf.name, srcCfg.prefix, tgtCfg.prefix);

  // 2–4. Walk nodes
  for (const node of wf.nodes || []) {
    remapNode(node, {
      slug,
      srcCfg,
      tgtCfg,
      tgtMeta,
      subIdMap
    });
  }

  // 5. Strip instance metadata
  stripInstanceMetadata(wf);

  return wf;
}

/**
 * Strip source prefix (if present) and prepend target prefix.
 */
function remapName(name, srcPrefix, tgtPrefix) {
  let cleaned = name;
  if (srcPrefix) {
    cleaned = cleaned.replace(new RegExp('^\\s*' + escapeRegex(srcPrefix) + '\\s*'), '');
  }
  // Also strip any other known prefixes to avoid stacking
  for (const env of Object.values(environments)) {
    if (env.prefix && env.prefix !== tgtPrefix) {
      cleaned = cleaned.replace(new RegExp('^\\s*' + escapeRegex(env.prefix) + '\\s*'), '');
    }
  }
  return `${tgtPrefix} ${cleaned.trim()}`.trim();
}

/**
 * Remap a single node in-place.
 */
function remapNode(node, ctx) {
  const { srcCfg, tgtCfg, tgtMeta, subIdMap } = ctx;

  switch (node.type) {
    case 'n8n-nodes-base.webhook':
      // Rewrite webhook path
      if (tgtMeta.webhookPath) {
        node.parameters.path = tgtMeta.webhookPath;
      }
      break;

    case 'n8n-nodes-base.executeWorkflow':
      // Swap sub-workflow ID
      remapExecuteWorkflow(node, subIdMap);
      break;

    case 'n8n-nodes-base.httpRequest':
      // Swap coreapi URL (not LLM URL — that's the same everywhere)
      remapHttpRequest(node, srcCfg, tgtCfg);
      break;

    default:
      break;
  }
}

/**
 * Remap executeWorkflow node: swap the workflowId if it matches a known
 * source sub-workflow → target sub-workflow mapping.
 */
function remapExecuteWorkflow(node, subIdMap) {
  const wfId = node.parameters?.workflowId;
  if (!wfId) return;

  // workflowId can be a string or { __rl: true, mode: 'id', value: '...' }
  if (typeof wfId === 'object' && wfId.value) {
    const mapped = subIdMap[wfId.value];
    if (mapped) {
      wfId.value = mapped;
    }
  } else if (typeof wfId === 'string') {
    const mapped = subIdMap[wfId];
    if (mapped) {
      node.parameters.workflowId = mapped;
    }
  }
}

/**
 * Remap httpRequest node: replace coreapi URL and credential references.
 * Skips LLM URL (agentcoreapi) since it's the same across envs.
 */
function remapHttpRequest(node, srcCfg, tgtCfg) {
  const params = node.parameters || {};

  // Replace coreapi URL in url field (may be an expression string)
  if (params.url && typeof params.url === 'string') {
    params.url = params.url.replace(srcCfg.coreApiUrl, tgtCfg.coreApiUrl);
  }

  // Replace coreapi URL in body field (embedded URLs in expression strings)
  if (params.body && typeof params.body === 'string') {
    params.body = params.body.replace(
      new RegExp(escapeRegex(srcCfg.coreApiUrl), 'g'),
      tgtCfg.coreApiUrl
    );
  }

  // Also check for execution URLs (e.g. workflows.ur-nl.com/executions/...)
  if (params.body && typeof params.body === 'string' && srcCfg.n8nBaseUrl && tgtCfg.n8nBaseUrl) {
    params.body = params.body.replace(
      new RegExp(escapeRegex(srcCfg.n8nBaseUrl), 'g'),
      tgtCfg.n8nBaseUrl
    );
  }

  // Swap credential id/name if this node uses httpHeaderAuth
  if (node.credentials?.httpHeaderAuth) {
    const tgtCred = tgtCfg.credentials?.httpHeaderAuth;
    if (tgtCred) {
      node.credentials.httpHeaderAuth.id = tgtCred.id;
      node.credentials.httpHeaderAuth.name = tgtCred.name;
    }
  }
}

/**
 * Remove fields that are specific to a particular n8n instance / version.
 * These get regenerated when the workflow is created via API.
 */
function stripInstanceMetadata(wf) {
  const stripKeys = ['id', 'createdAt', 'updatedAt', 'versionId', 'homeProject',
    'sharedWithProjects', 'activeVersion', 'isArchived'];
  for (const key of stripKeys) {
    delete wf[key];
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { remapWorkflow, remapName, stripInstanceMetadata };
