#!/usr/bin/env node
/**
 * Deploy workflows from local JSON files to n8n.
 *
 * Usage:
 *   node deploy.js --env development                              # deploy all
 *   node deploy.js --env development --slug case-study-creator    # single main workflow
 *   node deploy.js                                                # legacy flat deploy
 *
 * Deploys shared sub-workflows first, then main workflows.
 *
 * Directory layout:
 *   workflows/{env}/{slug}/main_workflow.json  — main workflows
 *   workflows/{env}/sub_workflows/{sub}.json   — shared sub-workflows
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const N8nClient = require('../lib/n8n-client');
const {
  readMetadata, listWorkflowSlugs, getSubWorkflows,
  updateWorkflowEnv, updateSubWorkflowEnv
} = require('../lib/metadata');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const envFlag = getFlagValue('--env');
const slugFlag = getFlagValue('--slug');

function getFlagValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function filterWorkflowPayload(workflow) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: {
      executionOrder: workflow.settings?.executionOrder || 'v1'
    }
  };
}

async function deployWorkflows() {
  try {
    const client = new N8nClient();

    if (!envFlag) {
      await legacyDeploy(client);
      return;
    }

    console.log(`Deploying workflows for environment: ${envFlag}\n`);

    const meta = readMetadata();

    // Deploy shared sub-workflows first
    const allSubs = getSubWorkflows();
    for (const [subSlug, subEntry] of Object.entries(allSubs)) {
      const subPath = path.join(
        __dirname, '../workflows', envFlag, 'sub_workflows', `${subSlug}.json`
      );
      if (!fs.existsSync(subPath)) {
        console.warn(`  Sub-workflow file not found: ${subPath} — skipping`);
        continue;
      }

      const subWf = JSON.parse(fs.readFileSync(subPath, 'utf8'));
      const existingId = subEntry[envFlag]?.n8nId;
      const result = await deploySingle(client, subWf, existingId);

      if (result.created) {
        updateSubWorkflowEnv(subSlug, envFlag, { n8nId: result.id });
        console.log(`  Updated metadata: sub_workflows.${subSlug}.${envFlag}.n8nId = ${result.id}`);
      }
    }

    // Deploy main workflows
    const slugs = slugFlag ? [slugFlag] : listWorkflowSlugs();

    for (const slug of slugs) {
      const entry = meta[slug];
      if (!entry) {
        console.warn(`Workflow "${slug}" not found in metadata.json — skipping`);
        continue;
      }

      const envBlock = entry[envFlag];
      if (!envBlock) {
        console.warn(`No "${envFlag}" config for "${slug}" — skipping`);
        continue;
      }

      const mainPath = path.join(
        __dirname, '../workflows', envFlag, slug, 'main_workflow.json'
      );
      if (!fs.existsSync(mainPath)) {
        console.warn(`  Main workflow file not found: ${mainPath} — skipping`);
        continue;
      }

      const mainWf = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
      const result = await deploySingle(client, mainWf, envBlock.n8nId);

      if (result.created) {
        updateWorkflowEnv(slug, envFlag, {
          n8nId: result.id,
          lastDeployedAt: new Date().toISOString()
        });
        console.log(`  Updated metadata: ${slug}.${envFlag}.n8nId = ${result.id}`);
      } else {
        updateWorkflowEnv(slug, envFlag, {
          lastDeployedAt: new Date().toISOString()
        });
      }
    }

    console.log('\nDeployment complete!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function deploySingle(client, workflow, existingId) {
  const payload = filterWorkflowPayload(workflow);

  if (existingId && !existingId.startsWith('TODO')) {
    try {
      await client.getWorkflow(existingId);
      await client.updateWorkflow(existingId, payload);
      console.log(`  Updated: ${workflow.name} (${existingId})`);
      return { id: existingId, created: false };
    } catch {
      // Workflow not found — fall through to create
    }
  }

  const created = await client.createWorkflow(payload);
  console.log(`  Created: ${workflow.name} (${created.id})`);
  return { id: created.id, created: true };
}

async function legacyDeploy(client) {
  console.log('Deploying workflows (flat mode)...\n');

  const workflowsDir = path.join(__dirname, '../workflows');
  if (!fs.existsSync(workflowsDir)) {
    console.error('No workflows directory found. Run: npm run n8n:backup first');
    process.exit(1);
  }

  const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json') && f !== 'metadata.json');
  if (files.length === 0) {
    console.log('No workflow files found');
    return;
  }

  for (const file of files) {
    const filepath = path.join(workflowsDir, file);
    const workflow = JSON.parse(fs.readFileSync(filepath, 'utf8'));

    try {
      let existingWorkflow;
      try {
        existingWorkflow = await client.getWorkflow(workflow.id);
      } catch {
        existingWorkflow = null;
      }

      const payload = filterWorkflowPayload(workflow);

      if (existingWorkflow) {
        await client.updateWorkflow(workflow.id, payload);
        console.log(`Updated: ${workflow.name}`);
      } else {
        const created = await client.createWorkflow(payload);
        console.log(`Created: ${workflow.name} (ID: ${created.id})`);
        workflow.id = created.id;
        fs.writeFileSync(filepath, JSON.stringify(workflow, null, 2));
      }
    } catch (error) {
      console.error(`Failed to deploy ${file}: ${error.message}`);
    }
  }

  console.log('\nDeployment complete!');
}

deployWorkflows();
