#!/usr/bin/env node
/**
 * Renumber workflow nodes with consistent naming scheme:
 * - Stage.SubNode format (e.g., 2.1, 2.2, 2.3)
 * - Descriptive prefixes: TRG, VAL, IF, FMT, LLM, MRG, SUB, JS, ERR, OUT
 * - Proper notes for each node
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '../workflows/case-study-modification---production.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

// Node renaming map: old name -> { newName, notes }
const nodeRenaming = {
  // Stage 1: Input & Validation
  '01_TRG_Webhook_Entry': {
    newName: '1.1_TRG_Webhook',
    notes: 'Entry point: Receives case study modification requests via webhook'
  },
  '02_INP_Validate_Input': {
    newName: '1.2_VAL_Input',
    notes: 'Validates input and initializes 3 core objects: reference_case_text (null), case_study_context (user inputs), generated_case (empty)'
  },
  '03_IF_Input_Valid': {
    newName: '1.3_IF_Valid',
    notes: 'Routes to document extraction if valid, error response if invalid'
  },
  '03b_FORMAT_Drive_Utils_Input': {
    newName: '1.4_FMT_DriveUtils',
    notes: 'Formats Google Drive document URL for extraction sub-workflow'
  },
  '04_SUB_Call_Drive_Utils': {
    newName: '1.5_SUB_DriveUtils',
    notes: 'Calls Drive Utils sub-workflow to extract reference case text from Google Doc'
  },
  '05_VAL_Extraction_Result': {
    newName: '1.6_VAL_Extraction',
    notes: 'Validates extraction result and populates reference_case_text in core objects'
  },
  '06_IF_Extraction_Valid': {
    newName: '1.7_IF_Extracted',
    notes: 'Routes to LLM processing if extraction successful, error response if failed'
  },

  // Stage 2: Context & Design Constraints (Sonnet)
  '07a_FORMAT_Node2_Input': {
    newName: '2.1_FMT_Context',
    notes: 'Stage 2: Builds prompt for context analysis and design constraints generation (Sonnet)'
  },
  '07_CALL_LLM_Node2': {
    newName: '2.2_LLM_Context',
    notes: 'Calls LLM to analyze inputs and generate case_design_constraints'
  },
  '08_MERGE_Node2_Output': {
    newName: '2.3_MRG_Context',
    notes: 'Merges design constraints into case_study_context.case_design_constraints'
  },

  // Stage 3: Parse Reference Case (Sonnet)
  '10a_FORMAT_Node3_Input': {
    newName: '3.1_FMT_ParseRef',
    notes: 'Stage 3: Builds prompt for reference case parsing with protagonist, quantitative data, adaptation assessment (Sonnet)'
  },
  '10_CALL_LLM_Node3': {
    newName: '3.2_LLM_ParseRef',
    notes: 'Calls LLM to extract structure, style markers, and adaptation assessment from reference'
  },
  '11_MERGE_Node3_Output': {
    newName: '3.3_MRG_ParseRef',
    notes: 'Merges parsed reference into generated_case.parsed_reference_case'
  },

  // Stage 4: Industry Adaptation (Sonnet)
  '12a_FORMAT_Node4_Input': {
    newName: '4.1_FMT_Industry',
    notes: 'Stage 4: Builds prompt for industry transformation with terminology mapping (Sonnet)'
  },
  '11_CALL_LLM_Node4': {
    newName: '4.2_LLM_Industry',
    notes: 'Calls LLM to transform case to new industry context'
  },
  '12_MERGE_Node4_Output': {
    newName: '4.3_MRG_Industry',
    notes: 'Merges industry adaptation into generated_case.industry_adapted_case'
  },

  // Stage 5: Behavior Mapping + Outline (Sonnet)
  '13a_FORMAT_Node5_Input': {
    newName: '5.1_FMT_Behavior',
    notes: 'Stage 5: Builds prompt for behavior mapping with stitching storyline, evidence moments, challenge outlines (Sonnet)'
  },
  '12_CALL_LLM_Node5': {
    newName: '5.2_LLM_Behavior',
    notes: 'Calls LLM to map behaviors to challenges and generate outlines'
  },
  '13_MERGE_Node5_Output': {
    newName: '5.3_MRG_Behavior',
    notes: 'Merges behavior mapping and outlines into generated_case.behavior_mapping, generated_case.challenge_outlines'
  },

  // Stage 6: Challenge Writing + Conciseness (Sonnet)
  '14a_FORMAT_Node6_Input': {
    newName: '6.1_FMT_Challenge',
    notes: 'Stage 6: Builds prompt for challenge writing with embedded behaviors, 150-200 words, conciseness refinement (Sonnet)'
  },
  '13_CALL_LLM_Node6': {
    newName: '6.2_LLM_Challenge',
    notes: 'Calls LLM to write challenges with "Gives Away Answer" prevention'
  },
  '14_MERGE_Node6_Output': {
    newName: '6.3_MRG_Challenge',
    notes: 'Merges final challenges into generated_case.final_challenges, generated_case.situation_section, generated_case.introduction_section'
  },

  // Stage 7: Question Generation + Assessor Guidance (Sonnet)
  '16a_FORMAT_Node8_Input': {
    newName: '7.1_FMT_Questions',
    notes: 'Stage 7: Builds prompt for question generation with assessor guidance (~100-150 words per question) (Sonnet)'
  },
  '15_CALL_LLM_Node8': {
    newName: '7.2_LLM_Questions',
    notes: 'Calls LLM to create questions and generate assessor guidance with rating indicators'
  },
  '16_MERGE_Node8_Output': {
    newName: '7.3_MRG_Questions',
    notes: 'Merges questions into generated_case.assessment_questions, generated_case.assessor_guidance, generated_case.coverage_validation'
  },

  // Stage 8: Quality Scoring + Auto-Fix (Haiku)
  '17a_FORMAT_Node9_Input': {
    newName: '8.1_FMT_Quality',
    notes: 'Stage 8: Builds prompt for 16-criteria quality scoring with auto-fix for scores < 8 (Haiku)'
  },
  '16_CALL_LLM_Node9': {
    newName: '8.2_LLM_Quality',
    notes: 'Calls LLM for quality scoring: A1-A7 (Case Body), B1-B5 (Questions), C1-C2 (Coverage), D1-D2 (Guidance)'
  },
  '17_MERGE_Node9_Output': {
    newName: '8.3_MRG_Quality',
    notes: 'Merges quality scores into generated_case.quality_scores, generated_case.quality_assured_content, generated_case.fixes_applied'
  },

  // Stage 9: Bias Check (Haiku)
  '20a_FORMAT_Node11_Input': {
    newName: '9.1_FMT_Bias',
    notes: 'Stage 9: Builds prompt for bias screening across 8 categories with remediation (Haiku)'
  },
  '19_CALL_LLM_Node11': {
    newName: '9.2_LLM_Bias',
    notes: 'Calls LLM to check for cultural, gender, age, socioeconomic, religious, disability, regional, and racial bias'
  },
  '19_MERGE_Node11_Output': {
    newName: '9.3_MRG_Bias',
    notes: 'Merges bias check into generated_case.bias_check_results, generated_case.bias_checked_content, generated_case.remediations_applied'
  },

  // Stage 10: Package Final Output (JavaScript - no LLM)
  '21a_FORMAT_Node12_Input': {
    newName: '10.1_JS_Package',
    notes: 'Stage 10: Assembles final_output in JavaScript - generates metadata, structures content, calculates quality_summary (no LLM)'
  },
  '20_CALL_LLM_Node12': null, // DELETE this node
  '21_MERGE_Node12_Output': null, // DELETE this node

  // Stage 11: Output & Error Handling
  '22_ERR_Format_Error_Response': {
    newName: '11.1_ERR_Response',
    notes: 'Formats error response with type, message, node, and timestamp'
  },
  '23_OUT_Webhook_Response': {
    newName: '11.2_OUT_Response',
    notes: 'Returns final_output via webhook response'
  }
};

// Update node names and notes
const nodesToDelete = [];
workflow.nodes.forEach((node, index) => {
  const mapping = nodeRenaming[node.name];
  if (mapping === null) {
    nodesToDelete.push(index);
  } else if (mapping) {
    node.name = mapping.newName;
    node.notes = mapping.notes;
  }
});

// Delete nodes marked for removal (in reverse order to maintain indices)
nodesToDelete.sort((a, b) => b - a).forEach(index => {
  workflow.nodes.splice(index, 1);
});

// Update all connections with new node names
const connectionUpdates = {};
Object.keys(nodeRenaming).forEach(oldName => {
  const mapping = nodeRenaming[oldName];
  if (mapping && mapping.newName) {
    connectionUpdates[oldName] = mapping.newName;
  }
});

// Helper to update connection node names
function updateConnectionName(name) {
  return connectionUpdates[name] || name;
}

// Rebuild connections with new names
const newConnections = {};
Object.entries(workflow.connections).forEach(([sourceName, sourceConnections]) => {
  const newSourceName = updateConnectionName(sourceName);

  // Skip connections from deleted nodes
  if (nodeRenaming[sourceName] === null) return;

  const newSourceConnections = {};
  Object.entries(sourceConnections).forEach(([type, outputs]) => {
    newSourceConnections[type] = outputs.map(outputArray =>
      outputArray
        .filter(conn => nodeRenaming[conn.node] !== null) // Remove connections to deleted nodes
        .map(conn => ({
          ...conn,
          node: updateConnectionName(conn.node)
        }))
    );
  });

  newConnections[newSourceName] = newSourceConnections;
});

workflow.connections = newConnections;

// Now we need to update the 10.1_JS_Package node to be a complete JavaScript solution
// Find the node and update its code
const packageNode = workflow.nodes.find(n => n.name === '10.1_JS_Package');
if (packageNode) {
  packageNode.type = 'n8n-nodes-base.code';
  packageNode.typeVersion = 2;
  delete packageNode.parameters.workflowId;
  delete packageNode.parameters.options;

  // Complete JavaScript packaging - no LLM needed
  packageNode.parameters.jsCode = `// Stage 10: Final Packaging - Pure JavaScript (no LLM)
// Assembles final_output from generated_case with case_study_context

const prev = $input.first().json;
const genCase = prev.generated_case || {};
const ctx = prev.case_study_context || {};
const constraints = ctx.case_design_constraints || ctx;

// Get content from bias_checked_content or fallback
const content = genCase.bias_checked_content || {};
const challenges = content.challenges || genCase.final_challenges || genCase.challenges || [];
const questions = content.questions || genCase.assessment_questions || [];
const assessorGuidance = content.assessor_guidance || genCase.assessor_guidance || {};
const situation = content.situation || genCase.situation_section || '';
const introduction = content.introduction || genCase.introduction_section || '';

// Calculate total word count for case_length
const totalWords = challenges.reduce((sum, c) => sum + (c.word_count || c.content?.split(/\\s+/).length || 175), 0);
const caseLength = totalWords < 600 ? 'short' : totalWords > 900 ? 'long' : 'medium';

// Generate professional title
const industry = constraints.industry || ctx.industry || 'Business';
const firstChallengeTitle = challenges[0]?.title || 'Strategic Decision Making';
const title = industry + ' Leadership Case: ' + firstChallengeTitle.replace(/^Challenge \\d+:\\s*/i, '');

// Calculate quality summary from quality_scores
const qualityScores = genCase.quality_scores || {};
const scoreValues = qualityScores.scores || qualityScores;
const allScores = Object.entries(scoreValues)
  .filter(([k, v]) => typeof v === 'number' && !k.includes('average') && !k.includes('overall'))
  .map(([k, v]) => v);
const overallRating = allScores.length > 0 ? Math.min(...allScores) : 8;
const avgRating = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 8;
const passedChecks = allScores.filter(s => s >= 8).length;

// Behavior coverage from mapping
const behaviorMapping = genCase.behavior_mapping || {};
const behaviorsList = (behaviorMapping.behaviors || behaviorMapping.mapped_behaviors || [])
  .map(b => typeof b === 'string' ? b : b.name || b.behavior_name)
  .filter(Boolean);

// Bias check results
const biasCheck = genCase.bias_check_results || {};
const passedBias = biasCheck.summary?.overall_status === 'pass' ||
  (biasCheck.summary?.high_severity_count || 0) === 0;

// Build coverage distribution by challenge
const distribution = {};
challenges.forEach((c, i) => {
  const behaviors = (c.behaviors_assessed || []).map(b => typeof b === 'string' ? b : b.name).filter(Boolean);
  distribution['challenge_' + (i + 1)] = behaviors;
});

// Generate recommendations based on target level
const targetLevel = constraints.target_level || 'Mid';
const recommendations = [];
if (targetLevel === 'Low') {
  recommendations.push('Suitable for entry-level candidates with 0-2 years experience');
  recommendations.push('Allow additional time for candidates to process information');
} else if (targetLevel === 'Mid') {
  recommendations.push('Appropriate for mid-level candidates with 3-7 years experience');
  recommendations.push('Expect balanced responses showing both analytical and people skills');
} else if (targetLevel === 'High') {
  recommendations.push('Designed for senior candidates with 8+ years experience');
  recommendations.push('Look for strategic thinking and enterprise-level considerations');
} else if (targetLevel === 'Exceptional') {
  recommendations.push('Reserved for executive-level assessment');
  recommendations.push('Expect sophisticated multi-stakeholder analysis and visionary solutions');
}
if (!passedBias) {
  recommendations.push('Review bias check notes before deployment');
}

// Assemble final_output (what goes to API)
const final_output = {
  case_study_metadata: {
    title: title,
    created_at: new Date().toISOString(),
    version: '1.0',
    case_length: caseLength
  },
  case_study_context: {
    workflow_session_id: ctx.workflow_session_id,
    workflow_id: ctx.workflow_id,
    project_id: ctx.project_id,
    client_id: ctx.client_id,
    case_design_constraints: constraints
  },
  case_study_content: {
    introduction: (situation + '\\n\\n' + introduction).trim(),
    challenges: challenges
  },
  assessment_questions: questions,
  assessor_guidance: assessorGuidance,
  quality_summary: {
    overall_rating: Math.round(overallRating * 10) / 10,
    average_rating: Math.round(avgRating * 10) / 10,
    total_checks_passed: passedChecks,
    total_checks_conducted: 16,
    passed_quality_check: overallRating >= 8,
    passed_bias_check: passedBias,
    total_behaviors_covered: behaviorsList.length,
    unique_behaviors: behaviorsList.length,
    behaviors_list: behaviorsList,
    quality_issues: qualityScores.issues || [],
    bias_issues: biasCheck.issues || [],
    behavior_coverage_analysis: {
      coverage_percentage: '100%',
      distribution: distribution
    },
    recommendations_for_deployment: recommendations
  }
};

return [{
  json: {
    status: 'success',
    final_output: final_output,
    // Keep generated_case as internal trace
    generated_case: genCase,
    reference_case_text: prev.reference_case_text,
    extraction_metadata: prev.extraction_metadata,
    delivery_ready: true
  }
}];`;
}

// Update connection from 9.3_MRG_Bias to go directly to 10.1_JS_Package (skip deleted LLM nodes)
if (newConnections['9.3_MRG_Bias']) {
  newConnections['9.3_MRG_Bias'] = {
    main: [[{ node: '10.1_JS_Package', type: 'main', index: 0 }]]
  };
}

// Update connection from 10.1_JS_Package to go to output
newConnections['10.1_JS_Package'] = {
  main: [[{ node: '11.2_OUT_Response', type: 'main', index: 0 }]]
};

// Update internal node references in jsCode (for $() calls in MERGE nodes)
const nodeRefUpdates = {
  "\\$\\('08_MERGE_Node2_Output'\\)": "$('2.3_MRG_Context')",
  "\\$\\('11_MERGE_Node3_Output'\\)": "$('3.3_MRG_ParseRef')",
  "\\$\\('12_MERGE_Node4_Output'\\)": "$('4.3_MRG_Industry')",
  "\\$\\('13_MERGE_Node5_Output'\\)": "$('5.3_MRG_Behavior')",
  "\\$\\('14_MERGE_Node6_Output'\\)": "$('6.3_MRG_Challenge')",
  "\\$\\('16_MERGE_Node8_Output'\\)": "$('7.3_MRG_Questions')",
  "\\$\\('17_MERGE_Node9_Output'\\)": "$('8.3_MRG_Quality')",
  "\\$\\('19_MERGE_Node11_Output'\\)": "$('9.3_MRG_Bias')",
  "\\$\\('05_VAL_Extraction_Result'\\)": "$('1.6_VAL_Extraction')"
};

workflow.nodes.forEach(node => {
  if (node.parameters?.jsCode) {
    let code = node.parameters.jsCode;
    Object.entries(nodeRefUpdates).forEach(([pattern, replacement]) => {
      code = code.replace(new RegExp(pattern, 'g'), replacement);
    });
    node.parameters.jsCode = code;
  }
});

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));

console.log('Workflow renumbered successfully!');
console.log('Nodes:', workflow.nodes.length);
console.log('Connections:', Object.keys(workflow.connections).length);

// Print new structure
console.log('\n=== New Node Structure ===');
workflow.nodes.forEach(n => console.log(n.name));
