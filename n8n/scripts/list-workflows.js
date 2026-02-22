#!/usr/bin/env node
/**
 * List all n8n workflows, optionally grouped by environment using metadata.
 *
 * Usage:
 *   node list-workflows.js               # list all workflows from n8n API
 *   node list-workflows.js --grouped     # group by environment using metadata
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const N8nClient = require('../lib/n8n-client');
const { readMetadata, listWorkflowSlugs, getSubWorkflows } = require('../lib/metadata');
const { promotionOrder } = require('../config/environments.config');

const grouped = process.argv.includes('--grouped');

async function listWorkflows() {
  try {
    const client = new N8nClient();
    const result = await client.getAllWorkflows();
    const workflows = result.data;

    if (!grouped) {
      // Simple flat list (original behavior)
      console.log(`\nFound ${workflows.length} workflow(s):\n`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      workflows.forEach((wf, i) => {
        const status = wf.active ? 'ACTIVE' : 'INACTIVE';
        console.log(`\n${i + 1}. ${wf.name}`);
        console.log(`   ID: ${wf.id}`);
        console.log(`   Status: ${status}`);
        console.log(`   Nodes: ${wf.nodes?.length || 0}`);
        console.log(`   Updated: ${new Date(wf.updatedAt).toLocaleString()}`);
      });

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    // Grouped by environment
    const meta = readMetadata();

    // Build a lookup: n8nId → { slug, env, type }
    const idLookup = {};

    // Main workflows
    for (const slug of listWorkflowSlugs()) {
      const entry = meta[slug];
      for (const env of promotionOrder) {
        const envBlock = entry[env];
        if (!envBlock) continue;
        if (envBlock.n8nId && !envBlock.n8nId.startsWith('TODO')) {
          idLookup[envBlock.n8nId] = { slug, env, type: 'main' };
        }
      }
    }

    // Shared sub-workflows
    const allSubs = getSubWorkflows();
    for (const [subSlug, subEntry] of Object.entries(allSubs)) {
      for (const env of promotionOrder) {
        const envBlock = subEntry[env];
        if (!envBlock) continue;
        if (envBlock.n8nId && !envBlock.n8nId.startsWith('TODO')) {
          idLookup[envBlock.n8nId] = { slug: subSlug, env, type: 'sub', subSlug };
        }
      }
    }

    // Group workflows
    const envGroups = {};
    const untracked = [];

    for (const wf of workflows) {
      const info = idLookup[wf.id];
      if (info) {
        const key = info.env;
        if (!envGroups[key]) envGroups[key] = [];
        envGroups[key].push({ ...wf, _meta: info });
      } else {
        untracked.push(wf);
      }
    }

    console.log(`\nFound ${workflows.length} workflow(s):\n`);

    for (const env of promotionOrder) {
      const group = envGroups[env] || [];
      console.log(`━━━ ${env.toUpperCase()} (${group.length}) ━━━`);
      if (group.length === 0) {
        console.log('  (none)\n');
        continue;
      }
      for (const wf of group) {
        const status = wf.active ? 'ACTIVE' : 'INACTIVE';
        const typeLabel = wf._meta.type === 'sub' ? `[sub: ${wf._meta.subSlug}]` : '[main]';
        console.log(`  ${wf.name}  ${typeLabel}  ${status}  ID: ${wf.id}`);
      }
      console.log('');
    }

    if (untracked.length > 0) {
      console.log(`━━━ UNTRACKED (${untracked.length}) ━━━`);
      for (const wf of untracked) {
        const status = wf.active ? 'ACTIVE' : 'INACTIVE';
        console.log(`  ${wf.name}  ${status}  ID: ${wf.id}`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

listWorkflows();
