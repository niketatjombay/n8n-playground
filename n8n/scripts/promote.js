#!/usr/bin/env node
/**
 * Promote a workflow from one environment to another.
 *
 * Usage:
 *   node promote.js case-study-creator dev stg
 *   node promote.js case-study-creator stg prod
 *
 * Delegates to n8n/services/promote.js
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const { promote } = require('../services/promote');

const [slug, srcArg, tgtArg] = process.argv.slice(2);

if (!slug || !srcArg || !tgtArg) {
  console.error('Usage: node promote.js <workflow-slug> <source-env> <target-env>');
  console.error('  Envs: dev | stg | prod  (or full names)');
  console.error('  Example: node promote.js case-study-creator dev stg');
  process.exit(1);
}

console.log(`Promoting: ${slug}`);

promote({ slug, sourceEnv: srcArg, targetEnv: tgtArg }).then(result => {
  if (!result.success) {
    console.error(`\nError: ${result.error}`);
    if (result.steps?.length) {
      result.steps.forEach(s => {
        const icon = s.status === 'error' ? '✗' : s.status === 'skipped' ? '~' : '✓';
        const detail = s.action ? ` [${s.action}] id=${s.id}` : s.reason ? ` (${s.reason})` : s.error ? ` — ${s.error}` : '';
        console.log(`  ${icon} [${s.type}] ${s.slug}${detail}`);
      });
    }
    process.exit(1);
  }

  console.log(`  ${result.sourceEnv} → ${result.targetEnv}\n`);
  result.steps.forEach(s => {
    const icon = s.status === 'error' ? '✗' : s.status === 'skipped' ? '~' : '✓';
    const detail = s.action ? ` [${s.action}] id=${s.id}` : s.reason ? ` (${s.reason})` : '';
    const folderNote = s.movedToFolder ? ' moved-to-folder' : s.folderWarning ? ` ⚠ ${s.folderWarning}` : '';
    console.log(`  ${icon} [${s.type}] ${s.slug}${detail}${folderNote}`);
  });

  console.log(`\nPromotion complete: ${slug}`);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
