#!/usr/bin/env node
/**
 * Backup workflows from n8n to local JSON files.
 *
 * Usage:
 *   node backup.js --env development          # back up all workflows + sub-workflows
 *   node backup.js --env development --slug case-study-creator  # single main workflow
 *   node backup.js                            # legacy: back up everything flat (no env)
 *
 * Directory layout:
 *   workflows/{env}/{slug}/main_workflow.json  — main workflows
 *   workflows/{env}/sub_workflows/{sub}.json   — shared sub-workflows
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const { clientForEnv } = require('../lib/client-for-env');
const { listWorkflowSlugs, getWorkflowEnv, getSubWorkflows } = require('../lib/metadata');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const envFlag = getFlagValue('--env');
const slugFlag = getFlagValue('--slug');

function getFlagValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

async function backupWorkflows() {
  try {
    if (!envFlag) {
      await legacyBackup(clientForEnv('development'));
      return;
    }

    console.log(`Backing up workflows for environment: ${envFlag}\n`);

    const client = clientForEnv(envFlag);
    const slugs = slugFlag ? [slugFlag] : listWorkflowSlugs();

    // Back up main workflows
    for (const slug of slugs) {
      let envBlock;
      try {
        envBlock = getWorkflowEnv(slug, envFlag);
      } catch (err) {
        console.warn(`Workflow "${slug}" not found for ${envFlag} — skipping`);
        continue;
      }

      const mainId = envBlock.n8nId;
      if (mainId && !mainId.startsWith('TODO')) {
        const mainDir = path.join(__dirname, '../workflows', envFlag, slug);
        fs.mkdirSync(mainDir, { recursive: true });

        const wf = await client.getWorkflow(mainId);
        const mainPath = path.join(mainDir, 'main_workflow.json');
        fs.writeFileSync(mainPath, JSON.stringify(wf, null, 2) + '\n');
        console.log(`Saved: ${envFlag}/${slug}/main_workflow.json`);
      } else {
        console.warn(`  Main workflow ID is placeholder for ${slug}/${envFlag} — skipping`);
      }
    }

    // Back up shared sub-workflows
    const allSubs = getSubWorkflows();
    for (const [subSlug, subEntry] of Object.entries(allSubs)) {
      const subEnv = subEntry[envFlag];
      if (!subEnv) continue;

      const subId = subEnv.n8nId;
      if (!subId || subId.startsWith('TODO')) {
        console.warn(`  Sub-workflow "${subSlug}" ID is placeholder for ${envFlag} — skipping`);
        continue;
      }

      const subDir = path.join(__dirname, '../workflows', envFlag, 'sub_workflows');
      fs.mkdirSync(subDir, { recursive: true });

      const subWf = await client.getWorkflow(subId);
      const subPath = path.join(subDir, `${subSlug}.json`);
      fs.writeFileSync(subPath, JSON.stringify(subWf, null, 2) + '\n');
      console.log(`Saved: ${envFlag}/sub_workflows/${subSlug}.json`);
    }

    console.log('\nBackup complete!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function legacyBackup(client) {
  console.log('Backing up all workflows (flat mode)...\n');

  const result = await client.getAllWorkflows();
  const workflows = result.data;
  const backupDir = path.join(__dirname, '../workflows');

  fs.mkdirSync(backupDir, { recursive: true });

  for (const workflow of workflows) {
    const fullWorkflow = await client.getWorkflow(workflow.id);
    const filename = `${fullWorkflow.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
    const filepath = path.join(backupDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(fullWorkflow, null, 2));
    console.log(`Saved: ${filename}`);
  }

  console.log(`\nBacked up ${workflows.length} workflow(s) to: n8n/workflows/`);
}

backupWorkflows();
