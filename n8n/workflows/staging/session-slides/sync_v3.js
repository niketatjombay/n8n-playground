/**
 * sync_v3.js
 *
 * Syncs v3 JS files into main_workflow.json node jsCode properties
 * and adds the new 6.5_JS_CoverageCheck node with proper connections.
 *
 * Usage: node sync_v3.js
 */

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const wfPath = path.join(dir, 'main_workflow.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

// ── Step 1: Sync existing node jsCode from JS files ──────────────────

const nodeFileMap = {
  '2.0b_FMT_AlignOutline': '_fmt_alignoutline_node.js',
  '2.0d_JS_AlignOutline':  '_js_alignoutline_node.js',
  '2.8_FMT_TagContent':    '_fmt_tag_content_node.js',
  '3.1_FMT_Agent1A':       '_fmt_agent1a_node.js',
  '4.1_JS_SplitGroups':    '_js_splitgroups_node.js',
  '5a.1_FMT_Group1':       '_fmt_group1_node.js',
  '5b.1_FMT_Group2':       '_fmt_group2_node.js',
  '5c.1_FMT_Group3':       '_fmt_group3_node.js',
  '5d.1_FMT_Group4':       '_fmt_group4_node.js',
  '5e.1_FMT_Group5':       '_fmt_group5_node.js',
  '5f.1_FMT_Group6':       '_fmt_group6_node.js',
  '5g.1_FMT_Group7':       '_fmt_group7_node.js',
  '7.1c_FMT_QC_Quality':   '_fmt_qc_quality_node.js',
  '7.3_JS_PrepScripts':    '_js_prep_scripts_node.js',
  '7.4a.1_FMT_Scr1':       '_fmt_scr1_node.js',
  '7.4b.1_FMT_Scr2':       '_fmt_scr2_node.js',
  '7.4c.1_FMT_Scr3':       '_fmt_scr3_node.js',
  '7.4d.1_FMT_Scr4':       '_fmt_scr4_node.js',
  '7.4e.1_FMT_Scr5':       '_fmt_scr5_node.js',
  '7.4f.1_FMT_Scr6':       '_fmt_scr6_node.js',
  '7.4g.1_FMT_Scr7':       '_fmt_scr7_node.js',
  '8.1_JS_Assemble':        '_js_assemble_node.js'
};

let updated = 0;
let warnings = [];

for (const node of wf.nodes) {
  const jsFile = nodeFileMap[node.name];
  if (jsFile) {
    const filePath = path.join(dir, jsFile);
    if (fs.existsSync(filePath)) {
      const code = fs.readFileSync(filePath, 'utf8');
      if (node.parameters && node.parameters.jsCode !== undefined) {
        node.parameters.jsCode = code;
        updated++;
        console.log('Updated: ' + node.name + ' <- ' + jsFile);
      } else {
        warnings.push('WARN: ' + node.name + ' has no jsCode parameter');
      }
    } else {
      warnings.push('WARN: File not found: ' + jsFile);
    }
  }
}

console.log('\nTotal nodes updated: ' + updated + ' / ' + Object.keys(nodeFileMap).length);
if (warnings.length > 0) {
  console.log('\nWarnings:');
  warnings.forEach(w => console.log('  ' + w));
}

// ── Step 2: Add 6.5_JS_CoverageCheck node ────────────────────────────

const coverageNodeName = '6.5_JS_CoverageCheck';
const existingCovNode = wf.nodes.find(n => n.name === coverageNodeName);

if (existingCovNode) {
  console.log('\n' + coverageNodeName + ' already exists, updating jsCode only');
  const covCode = fs.readFileSync(path.join(dir, '_js_coverage_check_node.js'), 'utf8');
  existingCovNode.parameters.jsCode = covCode;
} else {
  const covCode = fs.readFileSync(path.join(dir, '_js_coverage_check_node.js'), 'utf8');
  const newNode = {
    parameters: {
      jsCode: covCode,
      mode: 'runOnceForAllItems'
    },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [6750, 300],
    id: 'coverage-check-v3',
    name: coverageNodeName,
    notesInFlow: true,
    notes: 'v3: Outline coverage validation (pure JS, no LLM)'
  };
  wf.nodes.push(newNode);
  console.log('\nAdded node: ' + coverageNodeName);
}

// ── Step 3: Rewire connections ────────────────────────────────────────

// Current: 6.4_JS_NormContent main[0] → [7.1a, 7.1b, 7.1c]
// New:     6.4_JS_NormContent main[0] → 6.5_JS_CoverageCheck
//          6.5_JS_CoverageCheck main[0] → [7.1a, 7.1b, 7.1c]
// Keep:    6.4_JS_NormContent main[1] (error) → 9.1_ERR_Format

const normContentConn = wf.connections['6.4_JS_NormContent'];
if (!normContentConn) {
  console.log('ERROR: No connections found for 6.4_JS_NormContent');
  process.exit(1);
}

// Save the current main[0] targets (the 3 QC nodes)
const qcTargets = normContentConn.main[0].slice();
console.log('\nOriginal 6.4 main[0] targets: ' + qcTargets.map(t => t.node).join(', '));

// Replace main[0] with just the coverage check node
normContentConn.main[0] = [
  {
    node: coverageNodeName,
    type: 'main',
    index: 0
  }
];

// Add connections FROM coverage check node TO the 3 QC nodes
wf.connections[coverageNodeName] = {
  main: [
    qcTargets
  ]
};

console.log('Rewired: 6.4_JS_NormContent -> ' + coverageNodeName + ' -> [' + qcTargets.map(t => t.node).join(', ') + ']');

// Verify error connection is still intact
const errorConn = normContentConn.main[1];
if (errorConn && errorConn.length > 0) {
  console.log('Error path preserved: 6.4_JS_NormContent main[1] -> ' + errorConn[0].node);
} else {
  console.log('WARN: No error path found on 6.4_JS_NormContent main[1]');
}

// ── Step 4: Write back ───────────────────────────────────────────────

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('\nWorkflow JSON written to: ' + wfPath);
console.log('Total nodes now: ' + wf.nodes.length);
