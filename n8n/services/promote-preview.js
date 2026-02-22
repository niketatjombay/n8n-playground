const { loadEnv } = require('../lib/env-loader');
const { readMetadata, buildSubWorkflowIdMap } = require('../lib/metadata');
const { environments } = require('../config/environments.config');

function promotePreview({ slug, sourceEnv, targetEnv }) {
  loadEnv();

  const srcCfg = environments[sourceEnv];
  const tgtCfg = environments[targetEnv];
  if (!srcCfg || !tgtCfg) {
    return { success: false, error: 'Invalid environment' };
  }

  const meta = readMetadata();
  const entry = meta[slug];
  if (!entry) {
    return { success: false, error: `Workflow "${slug}" not found` };
  }

  const changes = [];

  changes.push({
    field: 'Workflow name prefix',
    from: srcCfg.prefix,
    to: tgtCfg.prefix,
  });

  const srcWebhook = entry[sourceEnv]?.webhookPath;
  const tgtWebhook = entry[targetEnv]?.webhookPath;
  if (srcWebhook || tgtWebhook) {
    changes.push({
      field: 'Webhook path',
      from: srcWebhook || '(none)',
      to: tgtWebhook || '(none)',
    });
  }

  const subIdMap = buildSubWorkflowIdMap(slug, sourceEnv, targetEnv);
  for (const [srcId, tgtId] of Object.entries(subIdMap)) {
    changes.push({
      field: 'Sub-workflow ID',
      from: srcId,
      to: tgtId,
    });
  }

  if (srcCfg.coreApiUrl !== tgtCfg.coreApiUrl) {
    changes.push({
      field: 'Core API URL',
      from: srcCfg.coreApiUrl,
      to: tgtCfg.coreApiUrl,
    });
  }

  const srcCred = srcCfg.credentials?.httpHeaderAuth;
  const tgtCred = tgtCfg.credentials?.httpHeaderAuth;
  if (srcCred?.id !== tgtCred?.id) {
    changes.push({
      field: 'httpHeaderAuth credential',
      from: `${srcCred?.name} (${srcCred?.id})`,
      to: `${tgtCred?.name} (${tgtCred?.id})`,
    });
  }

  changes.push({
    field: 'Stripped fields',
    from: 'id, createdAt, updatedAt, versionId, etc.',
    to: '(removed)',
  });

  return { success: true, slug, sourceEnv, targetEnv, changes };
}

module.exports = { promotePreview };
