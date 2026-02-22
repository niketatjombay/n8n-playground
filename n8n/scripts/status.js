#!/usr/bin/env node
/**
 * Show deployment status overview for all workflows across all environments.
 *
 * Usage:
 *   node status.js
 *   node status.js --slug case-study-creator
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const {
  readMetadata, listWorkflowSlugs, getSubWorkflows, findTodoPlaceholders
} = require('../lib/metadata');
const { promotionOrder } = require('../config/environments.config');

const args = process.argv.slice(2);
const slugFilter = args.indexOf('--slug') !== -1 ? args[args.indexOf('--slug') + 1] : null;

function status() {
  const meta = readMetadata();

  console.log('\n━━━ n8n Workflow Status ━━━\n');

  // --- Shared sub-workflows ---
  const allSubs = getSubWorkflows();
  const subSlugs = Object.keys(allSubs);

  if (subSlugs.length > 0) {
    console.log('Shared Sub-workflows:');
    for (const subSlug of subSlugs) {
      const sub = allSubs[subSlug];
      console.log(`  🔧 ${subSlug}`);
      if (sub.description) {
        console.log(`     ${sub.description}`);
      }
      if (sub.used_by?.length) {
        console.log(`     Used by: ${sub.used_by.join(', ')}`);
      }

      for (const env of promotionOrder) {
        const envBlock = sub[env];
        if (!envBlock) {
          console.log(`     ${padEnv(env)}  — not configured`);
          continue;
        }

        const id = envBlock.n8nId || '—';
        const isTodo = id.startsWith('TODO');
        const statusIcon = isTodo ? '⚪' : '🟢';
        console.log(`     ${statusIcon} ${padEnv(env)}  ${isTodo ? `(${id})` : id}`);
      }
      console.log('');
    }
  }

  // --- Main workflows ---
  const slugs = slugFilter ? [slugFilter] : listWorkflowSlugs();

  console.log('Main Workflows:');
  for (const slug of slugs) {
    const entry = meta[slug];
    if (!entry) {
      console.warn(`  Workflow "${slug}" not found in metadata.json`);
      continue;
    }

    console.log(`  📦 ${slug}`);
    if (entry.description) {
      console.log(`     ${entry.description}`);
    }
    if (entry.uses_sub_workflows?.length) {
      console.log(`     Uses: ${entry.uses_sub_workflows.join(', ')}`);
    }

    for (const env of promotionOrder) {
      const envBlock = entry[env];
      if (!envBlock) {
        console.log(`     ${padEnv(env)}  — not configured`);
        continue;
      }

      const id = envBlock.n8nId || '—';
      const isTodo = id.startsWith('TODO');
      const active = envBlock.active ? 'ACTIVE' : 'INACTIVE';
      const deployed = envBlock.lastDeployedAt
        ? new Date(envBlock.lastDeployedAt).toLocaleString()
        : 'never';

      const idDisplay = isTodo ? `(${id})` : id;
      const statusIcon = isTodo ? '⚪' : envBlock.active ? '🟢' : '🟡';

      console.log(`     ${statusIcon} ${padEnv(env)}  ID: ${idDisplay}  ${active}  deployed: ${deployed}`);
    }

    console.log('');
  }

  // --- TODO warnings ---
  const todos = findTodoPlaceholders();
  if (todos.length > 0) {
    console.log('━━━ Pending Setup ━━━\n');
    console.log(`${todos.length} TODO placeholder(s) remaining:\n`);
    todos.forEach(t => console.log(`  ${t.path}: ${t.value}`));
    console.log('\nFill these in metadata.json after creating resources in n8n UI.\n');
  }
}

function padEnv(env) {
  return env.padEnd(12);
}

status();
