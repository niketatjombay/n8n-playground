#!/usr/bin/env node
/**
 * Build the restructured pre-work-summary workflow JSON.
 * Reads current workflow to extract the parser/renderer code,
 * then constructs the new 15-node architecture.
 */

const fs = require('fs');
const path = require('path');

// Read current workflow to extract Code in JavaScript1's jsCode
const currentWorkflow = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'main_workflow.json'), 'utf8')
);

// Extract ONLY the jsonToSlideDocText renderer function from "Code in JavaScript1"
// The JSON extraction/repair code is no longer needed because the LLM sub-workflow's
// "Parse JSON Response" node already handles all JSON parsing with robust error handling.
const parserNode = currentWorkflow.nodes.find(n => n.name === 'Code in JavaScript1');
if (!parserNode) throw new Error('Could not find "Code in JavaScript1" node');

// Extract just the jsonToSlideDocText function (everything before "// Targeted JSON repair function")
const fullCode = parserNode.parameters.jsCode;
const rendererEndIdx = fullCode.indexOf('// Targeted JSON repair function');
if (rendererEndIdx === -1) throw new Error('Could not find renderer function boundary');
const rendererFunction = fullCode.substring(0, rendererEndIdx).trim();

// Build new simplified parser code:
// - Uses $input.first().json.llm_response (already parsed by sub-workflow)
// - Keeps the jsonToSlideDocText renderer
// - Outputs same format as before for downstream nodes
const parserCode = rendererFunction + `

// Main logic — LLM sub-workflow returns { llm_response: <parsed JSON object> }
// The sub-workflow's "Parse JSON Response" already handles JSON extraction and repair.
const webhook = $('1.1_TRG_Webhook').first().json.body;
const jsonData = $input.first().json.llm_response;

if (!jsonData || typeof jsonData !== 'object') {
  return [{
    "status": "error",
    "error_message": "No valid LLM response received. Expected llm_response object.",
    "client_id": webhook.client_id,
    "client_name": webhook.client_name,
    "project_id": webhook.project_id,
    "project_name": webhook.project_name,
    "workflow_id": webhook.workflow_id,
    "workflow_name": webhook.workflow_name,
    "workflow_session_id": webhook.workflow_session_id,
    "workflow_session_name": webhook.workflow_session_name
  }];
}

try {
  var content = jsonToSlideDocText(jsonData);

  return [{
    "status": "processed",
    "agent_response": jsonData,
    "content": content,
    "google_drive_folder_id": webhook.google_drive_folder_id,
    "client_id": webhook.client_id,
    "client_name": webhook.client_name,
    "project_id": webhook.project_id,
    "project_name": webhook.project_name,
    "workflow_id": webhook.workflow_id,
    "workflow_name": webhook.workflow_name,
    "workflow_session_id": webhook.workflow_session_id,
    "workflow_session_name": webhook.workflow_session_name
  }];

} catch(renderError) {
  return [{
    "status": "error",
    "error_message": "Rendering failed: " + renderError.message,
    "agent_response": jsonData,
    "client_id": webhook.client_id,
    "client_name": webhook.client_name,
    "project_id": webhook.project_id,
    "project_name": webhook.project_name,
    "workflow_id": webhook.workflow_id,
    "workflow_name": webhook.workflow_name,
    "workflow_session_id": webhook.workflow_session_id,
    "workflow_session_name": webhook.workflow_session_name
  }];
}`;

// Extract pinData (update key name from "Webhook" to "1.1_TRG_Webhook")
const pinData = {};
if (currentWorkflow.pinData && currentWorkflow.pinData.Webhook) {
  pinData['1.1_TRG_Webhook'] = currentWorkflow.pinData.Webhook;
}

// Build the restructured workflow
const workflow = {
  name: '[STG] Pre-Work Summary',
  nodes: [
    // Stage 1: Trigger
    {
      parameters: {
        httpMethod: 'POST',
        path: '/staging/pre-work-summary',
        options: {}
      },
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [-1600, 0],
      id: 'trg-webhook-001',
      name: '1.1_TRG_Webhook',
      webhookId: 'pre-work-summary-stg-v1',
      notes: 'Entry point: Receives pre-work summary generation requests via webhook. Returns 200 immediately (default onReceived mode).'
    },

    // Stage 2: Document Extraction (conditional)
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
          conditions: [{
            id: 'has-docs-001',
            leftValue: '={{ $json.body.documents_urls }}',
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty' }
          }],
          combinator: 'and'
        },
        options: {}
      },
      type: 'n8n-nodes-base.if',
      typeVersion: 2.3,
      position: [-1376, 0],
      id: 'if-has-docs-001',
      name: '2.1_IF_HasDocs',
      notes: 'Check if documents_urls field exists and is non-empty'
    },
    {
      parameters: {
        jsCode: "const urls = $('1.1_TRG_Webhook').first().json.body.documents_urls.split(',').map(u => u.trim()).filter(u => u.length > 0);\nreturn urls.map(url => ({ json: { mode: 'EXTRACT_CONTENT', google_drive_file_url: url } }));"
      },
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-1152, -144],
      id: 'js-split-urls-001',
      name: '2.2_JS_SplitUrls',
      notes: 'Split comma-separated document URLs into individual items for drive-utils'
    },
    {
      parameters: {
        workflowId: { __rl: true, mode: 'id', value: '8N4Pzq6oTI5ligt4r8ZJ4' },
        options: {}
      },
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.1,
      position: [-928, -144],
      id: 'sub-extract-doc-001',
      name: '2.3_SUB_ExtractDoc',
      alwaysOutputData: true,
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 3000,
      continueOnFail: true,
      notes: 'Call drive-utils sub-workflow to extract text from each document URL'
    },
    {
      parameters: {
        jsCode: "const docs = [];\nfor (const item of $input.all()) {\n  if (item.json.extracted_text && item.json.status === 'success') {\n    docs.push(item.json.extracted_text);\n  }\n}\nreturn [{ json: { extracted_documents: docs, has_documents: docs.length > 0 } }];"
      },
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-704, -144],
      id: 'js-collect-docs-001',
      name: '2.4_JS_CollectDocs',
      notes: 'Aggregate all successfully extracted document texts into a single array'
    },

    // Stage 3: Prompt Assembly
    {
      parameters: {
        operation: 'get',
        dataTableId: {
          __rl: true,
          value: 'LChiwpG5qGEyeY76',
          mode: 'list',
          cachedResultName: 'agentcore_models',
          cachedResultUrl: '/projects/JIV2elLHsVFXybZ2/datatables/LChiwpG5qGEyeY76'
        },
        matchType: 'allConditions',
        filters: {
          conditions: [{ keyName: 'identifier', keyValue: 'prework_summary_deck_generator' }]
        }
      },
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position: [-480, 0],
      id: 'dt-get-prompt-001',
      name: '3.1_DT_GetPrompt',
      executeOnce: true,
      notes: 'Fetch prompt template from DataTable (single fetch for both docs/no-docs paths)'
    },
    {
      parameters: {
        jsCode: "const webhook = $('1.1_TRG_Webhook').first().json.body;\nlet prompt = $input.first().json.prompt;\n\n// Always add project details and project memory\nprompt += '\\n\\n# Project Details\\n<project_details>';\nprompt += webhook.project_details || '';\nprompt += '</project_details>\\n\\n';\n\nprompt += '\\n\\n# Project Summary\\n<project_summary>';\nprompt += webhook.current_project_memory || '';\nprompt += '</project_summary>\\n\\n';\n\n// Add documents if they were extracted\ntry {\n  const collectNode = $('2.4_JS_CollectDocs');\n  if (collectNode && collectNode.first()) {\n    const docs = collectNode.first().json.extracted_documents;\n    if (docs && docs.length > 0) {\n      prompt += '# Extra documents to refer\\n\\n<project_documents>';\n      docs.forEach(doc => {\n        prompt += '<document>' + doc + '</document>\\n\\n';\n      });\n      prompt += '</project_documents>\\n';\n    }\n  }\n} catch (e) {\n  // No documents path — skip\n}\n\nreturn [{\n  json: {\n    prompt: prompt,\n    client_id: webhook.client_id,\n    project_id: webhook.project_id,\n    workflow_session_id: webhook.workflow_session_id,\n    workflow_id: webhook.workflow_id,\n    workflow_name: webhook.workflow_name,\n    workflow_session_name: webhook.workflow_session_name,\n    client_name: webhook.client_name,\n    project_name: webhook.project_name,\n    google_drive_folder_id: webhook.google_drive_folder_id\n  }\n}];"
      },
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-256, 0],
      id: 'fmt-build-prompt-001',
      name: '3.2_FMT_BuildPrompt',
      notes: 'Assemble full prompt: template + project_details + project_memory + extracted documents (if any)'
    },

    // Stage 4: LLM Call
    {
      parameters: {
        workflowId: { __rl: true, mode: 'id', value: 'GDaWNcJJtLdY8Q6Y4Yv5p' },
        options: {}
      },
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.1,
      position: [-32, 0],
      id: 'sub-call-llm-001',
      name: '4.1_SUB_CallLLM',
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 5000,
      onError: 'continueErrorOutput',
      notes: 'Call LLM sub-workflow with assembled prompt. Output 0 = success, Output 1 = error'
    },

    // Stage 5: Response Processing
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
          conditions: [{
            id: 'llm-error-001',
            leftValue: '={{ $json.body_error }}',
            rightValue: '',
            operator: { type: 'string', operation: 'exists', singleValue: true }
          }],
          combinator: 'and'
        },
        options: {}
      },
      type: 'n8n-nodes-base.if',
      typeVersion: 2.3,
      position: [192, 0],
      id: 'if-llm-error-001',
      name: '5.1_IF_LLMError',
      notes: 'Check if LLM response contains body_error field (indicates API error)'
    },
    {
      parameters: {
        jsCode: parserCode  // Preserved from current workflow, with $('Webhook') → $('1.1_TRG_Webhook')
      },
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [416, 96],
      id: 'js-parse-render-001',
      name: '5.2_JS_ParseAndRender',
      notes: 'Parse JSON from LLM response, render slides to text for Google Doc. Includes robust JSON repair.'
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
          conditions: [{
            id: 'parse-error-001',
            leftValue: '={{ $json.status }}',
            rightValue: 'error',
            operator: { type: 'string', operation: 'equals' }
          }],
          combinator: 'and'
        },
        options: {}
      },
      type: 'n8n-nodes-base.if',
      typeVersion: 2.3,
      position: [640, 96],
      id: 'if-parse-error-001',
      name: '5.3_IF_ParseError',
      notes: 'Check if JSON parsing/rendering failed (status === "error")'
    },

    // Stage 6: Google Doc Output
    {
      parameters: {
        driveId: 'sharedWithMe',
        folderId: '={{ $json.google_drive_folder_id }}',
        title: '={{ $json.workflow_session_name }}_{{ (new Date()).getTime() }}'
      },
      type: 'n8n-nodes-base.googleDocs',
      typeVersion: 2,
      position: [864, 192],
      id: 'gdoc-create-001',
      name: '6.1_GDOC_Create',
      credentials: {
        googleDocsOAuth2Api: { id: '8Se5WgPUVSkK9BjF', name: 'Test User Google Docs Account' }
      },
      onError: 'continueErrorOutput',
      notes: 'Create a new Google Doc in the project Google Drive folder'
    },
    {
      parameters: {
        operation: 'update',
        documentURL: '={{ $json.id }}',
        simple: '={{ true }}',
        actionsUi: {
          actionFields: [{
            action: 'insert',
            text: "={{ $('5.2_JS_ParseAndRender').item.json.content }}"
          }]
        }
      },
      type: 'n8n-nodes-base.googleDocs',
      typeVersion: 2,
      position: [1088, 192],
      id: 'gdoc-update-001',
      name: '6.2_GDOC_Update',
      credentials: {
        googleDocsOAuth2Api: { id: '8Se5WgPUVSkK9BjF', name: 'Test User Google Docs Account' }
      },
      notes: 'Insert rendered slide content into the Google Doc'
    },

    // Stage 7: Report Success
    {
      parameters: {
        method: 'PUT',
        url: "=https://coreapi.ur-nl.com/workflow_sessions/{{ $('5.2_JS_ParseAndRender').item.json.workflow_session_id }}",
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'X-Subdomain', value: 'dashboard' }]
        },
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: "={\n  \"workflow_session\": {\n    \"output_file_url\": \"https://docs.google.com/document/d/{{ $json.documentId }}\",\n    \"output_json\": {{ JSON.stringify($('5.2_JS_ParseAndRender').item.json.agent_response) }},\n    \"status\": \"completed\"\n  }\n}",
        options: {}
      },
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.3,
      position: [1312, 192],
      id: 'api-success-001',
      name: '7.1_API_ReportSuccess',
      credentials: {
        httpHeaderAuth: { id: '9fZP8bOKRNJtilO1', name: 'Jombay Staging API' }
      },
      onError: 'continueErrorOutput',
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 3000,
      notes: 'Report success to coreapi with output_file_url and output_json'
    },

    // Stage 8: Centralized Error Sink
    {
      parameters: {
        jsCode: "// Centralized error formatter\nconst input = $input.first().json;\n\nfunction safeErrorExtract(error) {\n  if (!error) return null;\n  if (error instanceof Error || error.message) {\n    return {\n      message: error.message || 'Unknown error',\n      name: error.name,\n      stack: error.stack,\n      ...Object.keys(error).reduce((acc, key) => {\n        try { acc[key] = error[key]; } catch (e) {}\n        return acc;\n      }, {})\n    };\n  }\n  return error;\n}\n\nconst errorInfo = safeErrorExtract(input);\n\nreturn [{\n  json: {\n    status: 'error',\n    error_message: errorInfo?.message || input?.error_message || input?.body_error || 'Workflow execution failed',\n    workflow_session_id: $('1.1_TRG_Webhook').first().json.body.workflow_session_id,\n    timestamp: new Date().toISOString()\n  }\n}];"
      },
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2400, -200],
      id: 'err-format-001',
      name: '8.1_ERR_Format',
      notes: 'Centralized error formatter — all error paths converge here'
    },
    {
      parameters: {
        method: 'PUT',
        url: '=https://coreapi.ur-nl.com/workflow_sessions/{{ $json.workflow_session_id }}',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'X-Subdomain', value: 'dashboard' }]
        },
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: "={   \"workflow_session\": {  \"status\": \"error\", \"error_message\": \"{{ $json.error_message }}\"   } } ",
        options: {}
      },
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.3,
      position: [2624, -200],
      id: 'err-api-001',
      name: '8.2_API_ReportError',
      credentials: {
        httpHeaderAuth: { id: '9fZP8bOKRNJtilO1', name: 'Jombay Staging API' }
      },
      notes: 'Report error to coreapi with error_message and execution details'
    }
  ],

  connections: {
    // Stage 1 → Stage 2
    '1.1_TRG_Webhook': {
      main: [[{ node: '2.1_IF_HasDocs', type: 'main', index: 0 }]]
    },

    // Stage 2: Document extraction
    '2.1_IF_HasDocs': {
      main: [
        // Output 0 (true = has docs) → split URLs
        [{ node: '2.2_JS_SplitUrls', type: 'main', index: 0 }],
        // Output 1 (false = no docs) → straight to prompt fetch
        [{ node: '3.1_DT_GetPrompt', type: 'main', index: 0 }]
      ]
    },
    '2.2_JS_SplitUrls': {
      main: [[{ node: '2.3_SUB_ExtractDoc', type: 'main', index: 0 }]]
    },
    '2.3_SUB_ExtractDoc': {
      main: [[{ node: '2.4_JS_CollectDocs', type: 'main', index: 0 }]]
    },
    '2.4_JS_CollectDocs': {
      main: [[{ node: '3.1_DT_GetPrompt', type: 'main', index: 0 }]]
    },

    // Stage 3: Prompt assembly
    '3.1_DT_GetPrompt': {
      main: [[{ node: '3.2_FMT_BuildPrompt', type: 'main', index: 0 }]]
    },
    '3.2_FMT_BuildPrompt': {
      main: [[{ node: '4.1_SUB_CallLLM', type: 'main', index: 0 }]]
    },

    // Stage 4: LLM call
    '4.1_SUB_CallLLM': {
      main: [
        // Output 0 (success) → check for body_error
        [{ node: '5.1_IF_LLMError', type: 'main', index: 0 }],
        // Output 1 (error from onError: continueErrorOutput) → error sink
        [{ node: '8.1_ERR_Format', type: 'main', index: 0 }]
      ]
    },

    // Stage 5: Response processing
    '5.1_IF_LLMError': {
      main: [
        // Output 0 (true = has body_error) → error sink
        [{ node: '8.1_ERR_Format', type: 'main', index: 0 }],
        // Output 1 (false = no error) → parse and render
        [{ node: '5.2_JS_ParseAndRender', type: 'main', index: 0 }]
      ]
    },
    '5.2_JS_ParseAndRender': {
      main: [[{ node: '5.3_IF_ParseError', type: 'main', index: 0 }]]
    },
    '5.3_IF_ParseError': {
      main: [
        // Output 0 (true = status is error) → error sink
        [{ node: '8.1_ERR_Format', type: 'main', index: 0 }],
        // Output 1 (false = status is not error) → create Google Doc
        [{ node: '6.1_GDOC_Create', type: 'main', index: 0 }]
      ]
    },

    // Stage 6: Google Doc output
    '6.1_GDOC_Create': {
      main: [
        // Output 0 (success) → update doc
        [{ node: '6.2_GDOC_Update', type: 'main', index: 0 }],
        // Output 1 (error from onError: continueErrorOutput) → error sink
        [{ node: '8.1_ERR_Format', type: 'main', index: 0 }]
      ]
    },
    '6.2_GDOC_Update': {
      main: [[{ node: '7.1_API_ReportSuccess', type: 'main', index: 0 }]]
    },

    // Stage 7: Success reporting (no outgoing connections — terminal node)

    // Stage 8: Error sink
    '8.1_ERR_Format': {
      main: [[{ node: '8.2_API_ReportError', type: 'main', index: 0 }]]
    }
    // 8.2_API_ReportError: no outgoing connections — terminal node
  },

  settings: {
    executionOrder: 'v1',
    availableInMCP: false
  },

  staticData: null,

  meta: {
    templateCredsSetupCompleted: true
  },

  pinData: pinData
};

// Write the restructured workflow
const outputPath = path.join(__dirname, 'restructured_workflow.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

// Validate
const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
console.log(`Workflow: ${parsed.name}`);
console.log(`Nodes: ${parsed.nodes.length}`);
console.log(`Connections: ${Object.keys(parsed.connections).length}`);
console.log(`Node names:`);
parsed.nodes.forEach(n => console.log(`  - ${n.name} (${n.type})`));
console.log(`\nSaved to: ${outputPath}`);
