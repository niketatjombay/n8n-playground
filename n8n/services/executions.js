const { loadEnv } = require('../lib/env-loader');
const N8nClient = require('../lib/n8n-client');
const { getWorkflowEnv } = require('../lib/metadata');

const ENV_ALIASES = { dev: 'development', stg: 'staging', prod: 'production' };
function resolveEnv(input) { return ENV_ALIASES[input] || input; }

async function getExecutions({ slug, env: envArg, limit = 20 }) {
  loadEnv();

  if (!slug || !envArg) {
    return { success: false, error: 'slug and env are required' };
  }

  const env = resolveEnv(envArg);
  let envBlock;
  try {
    envBlock = getWorkflowEnv(slug, env);
  } catch (error) {
    return { success: false, error: error.message };
  }

  const n8nId = envBlock.n8nId;
  if (!n8nId || n8nId.startsWith('TODO')) {
    return { success: false, error: `No valid n8n ID for ${slug}/${env}` };
  }

  try {
    const client = new N8nClient();
    const result = await client.getExecutions(n8nId, limit);
    const executions = (result.data || []).map((exec) => ({
      id: exec.id,
      status: exec.status,
      startedAt: exec.startedAt,
      stoppedAt: exec.stoppedAt,
      mode: exec.mode,
      duration: exec.stoppedAt && exec.startedAt
        ? new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()
        : null,
    }));

    return { success: true, slug, env, n8nId, executions };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/* ---------------------------------------------------------------------------
 * Execution Detail — helpers and main function
 * --------------------------------------------------------------------------- */

// Known LLM node types in n8n
const LLM_NODE_TYPES = [
  '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  '@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatOllama',
  '@n8n/n8n-nodes-langchain.lmChatGroq',
  '@n8n/n8n-nodes-langchain.lmChatMistralCloud',
  '@n8n/n8n-nodes-langchain.openAi',
  '@n8n/n8n-nodes-langchain.chainLlm',
  '@n8n/n8n-nodes-langchain.agent',
  '@n8n/n8n-nodes-langchain.chainSummarization',
  'n8n-nodes-base.openAi',
];

// Known Execute Workflow (sub-workflow) node types
const EXECUTE_WORKFLOW_NODE_TYPES = [
  'n8n-nodes-base.executeWorkflow',
  '@n8n/n8n-nodes-base.executeWorkflow',
];

/**
 * Check if a node type is an LLM node.
 */
function isLlmNode(nodeType) {
  if (!nodeType) return false;
  return LLM_NODE_TYPES.some(
    (t) => nodeType === t || nodeType.startsWith(t + '.')
  );
}

/**
 * Check if a node type is an Execute Workflow node.
 */
function isExecuteWorkflowNode(nodeType) {
  if (!nodeType) return false;
  return EXECUTE_WORKFLOW_NODE_TYPES.some(
    (t) => nodeType === t || nodeType.startsWith(t + '.')
  );
}

/**
 * Search node output data for actual token usage reported by the LLM provider.
 * Looks in several well-known paths within the output JSON items.
 * Returns { model, inputTokens, outputTokens, source: 'actual' } or null.
 */
function extractTokenUsage(outputData) {
  if (!outputData || !outputData.main) return null;

  // outputData.main is an array of branches; each branch is an array of items
  for (const branch of outputData.main) {
    if (!Array.isArray(branch)) continue;
    for (const item of branch) {
      if (!item || !item.json) continue;
      const json = item.json;

      // Paths where providers commonly stash usage info
      const candidates = [
        json.usage,
        json.response?.usage,
        json.message?.usage,
        json.data?.usage,
        json.tokenUsage,
        json.response?.body?.usage,
      ];

      for (const usage of candidates) {
        if (!usage) continue;
        const inputTokens =
          usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0;
        const outputTokens =
          usage.completion_tokens ??
          usage.output_tokens ??
          usage.completionTokens ??
          0;
        if (inputTokens || outputTokens) {
          return {
            model: usage.model || json.model || null,
            inputTokens,
            outputTokens,
            source: 'actual',
          };
        }
      }
    }
  }
  return null;
}

/**
 * Estimate token count for a string using js-tiktoken (gpt-4o encoding).
 * Falls back to a simple char/4 heuristic if encoding fails.
 */
let _encoder = null;
function estimateTokens(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  try {
    if (!_encoder) {
      const { encodingForModel } = require('js-tiktoken');
      _encoder = encodingForModel('gpt-4o');
    }
    return _encoder.encode(str).length;
  } catch {
    return Math.ceil(str.length / 4);
  }
}

/**
 * Estimate token usage from the raw input/output of a node when actual usage
 * is not available. Extracts model name from node parameters.
 * Returns { model, inputTokens, outputTokens, source: 'estimated' } or null.
 */
function estimateNodeTokenUsage(nodeData, workflowNode) {
  // Try to derive text from input / output
  let inputText = '';
  let outputText = '';

  // nodeData is one execution run entry (the first element of the array for a node)
  if (nodeData?.data?.main) {
    for (const branch of nodeData.data.main) {
      if (!Array.isArray(branch)) continue;
      for (const item of branch) {
        if (item?.json) {
          outputText += JSON.stringify(item.json);
        }
      }
    }
  }

  // Attempt to grab input from the node's inputData if available
  if (nodeData?.inputData?.main) {
    for (const branch of nodeData.inputData.main) {
      if (!Array.isArray(branch)) continue;
      for (const item of branch) {
        if (item?.json) {
          inputText += JSON.stringify(item.json);
        }
      }
    }
  }

  if (!inputText && !outputText) return null;

  // Model name: try workflow node parameters
  const model =
    workflowNode?.parameters?.model ||
    workflowNode?.parameters?.modelId ||
    workflowNode?.parameters?.options?.model ||
    null;

  return {
    model,
    inputTokens: estimateTokens(inputText),
    outputTokens: estimateTokens(outputText),
    source: 'estimated',
  };
}

/**
 * Build an ordered node list from runData and workflowData.
 * Each entry: { name, type, status, executionTimeMs, startTime, inputData,
 *   outputData, tokenUsage, isSubWorkflow, subExecution, error }
 */
function buildNodeList(runData, workflowData) {
  if (!runData) return [];

  // Index workflow nodes by name for quick lookup
  const workflowNodesByName = {};
  if (workflowData?.nodes) {
    for (const n of workflowData.nodes) {
      workflowNodesByName[n.name] = n;
    }
  }

  const nodes = [];

  for (const [nodeName, executions] of Object.entries(runData)) {
    if (!Array.isArray(executions)) continue;

    for (const exec of executions) {
      const workflowNode = workflowNodesByName[nodeName] || {};
      const nodeType = workflowNode.type || 'unknown';

      const outputData = exec.data || null;

      // Token usage: prefer actual, fall back to estimated for LLM nodes
      let tokenUsage = null;
      if (isLlmNode(nodeType)) {
        tokenUsage = extractTokenUsage(outputData);
        if (!tokenUsage) {
          tokenUsage = estimateNodeTokenUsage(exec, workflowNode);
        }
      }

      // If extractTokenUsage found usage but no model, try workflowNode params
      if (tokenUsage && !tokenUsage.model) {
        tokenUsage.model =
          workflowNode?.parameters?.model ||
          workflowNode?.parameters?.modelId ||
          workflowNode?.parameters?.options?.model ||
          'unknown';
      }

      nodes.push({
        name: nodeName,
        type: nodeType,
        status: exec.executionStatus || null,
        executionTimeMs: exec.executionTime ?? null,
        startTime: exec.startTime ?? null,
        inputData: null, // reserved for future use
        outputData,
        tokenUsage,
        isSubWorkflow: isExecuteWorkflowNode(nodeType),
        subExecution: null, // populated later for sub-workflows
        error: exec.error || null,
      });
    }
  }

  // Sort by startTime ascending
  nodes.sort((a, b) => {
    if (a.startTime == null && b.startTime == null) return 0;
    if (a.startTime == null) return 1;
    if (b.startTime == null) return -1;
    return a.startTime - b.startTime;
  });

  return nodes;
}

/**
 * Aggregate token usage across all nodes (recursing into subExecution.nodes)
 * grouped by model name.
 * Returns { [model]: { inputTokens, outputTokens, source } }
 */
function aggregateTokenSummary(nodes) {
  const summary = {};

  function accumulate(nodeList) {
    for (const node of nodeList) {
      if (node.tokenUsage) {
        const model = node.tokenUsage.model || 'unknown';
        if (!summary[model]) {
          summary[model] = { inputTokens: 0, outputTokens: 0, source: node.tokenUsage.source };
        }
        summary[model].inputTokens += node.tokenUsage.inputTokens;
        summary[model].outputTokens += node.tokenUsage.outputTokens;

        // If sources differ for the same model, mark as mixed
        if (node.tokenUsage.source !== summary[model].source) {
          summary[model].source = 'mixed';
        }
      }

      // Recurse into sub-execution nodes
      if (node.subExecution?.nodes) {
        accumulate(node.subExecution.nodes);
      }
    }
  }

  accumulate(nodes);
  return summary;
}

/**
 * Fetch full execution detail including per-node breakdown and token usage.
 * Recursively fetches sub-workflow executions.
 */
async function getExecutionDetail({ executionId }) {
  loadEnv();

  if (!executionId) {
    return { success: false, error: 'executionId is required' };
  }

  try {
    const client = new N8nClient();
    const raw = await client.getExecution(executionId);

    const runData = raw.data?.resultData?.runData;
    const workflowData = raw.workflowData;

    const nodes = buildNodeList(runData, workflowData);

    // Collect sub-workflow execution IDs and their corresponding nodes
    const subFetches = [];
    for (const node of nodes) {
      if (!node.isSubWorkflow || !node.outputData) continue;

      let subExecutionId = null;

      // Try to find sub-execution ID from output data items
      if (node.outputData.main) {
        for (const branch of node.outputData.main) {
          if (!Array.isArray(branch) || subExecutionId) break;
          for (const item of branch) {
            if (item?.json?.executionId) {
              subExecutionId = String(item.json.executionId);
              break;
            }
          }
        }
      }

      // Fallback: metadata path
      if (!subExecutionId && node.outputData.metadata?.subExecution?.executionId) {
        subExecutionId = String(node.outputData.metadata.subExecution.executionId);
      }

      if (subExecutionId) {
        subFetches.push({ node, subExecutionId });
      }
    }

    // Fetch all sub-workflow executions in parallel
    if (subFetches.length > 0) {
      const results = await Promise.allSettled(
        subFetches.map(({ subExecutionId }) => client.getExecution(subExecutionId))
      );

      for (let i = 0; i < subFetches.length; i++) {
        const { node, subExecutionId } = subFetches[i];
        const result = results[i];

        if (result.status === 'fulfilled') {
          const subRaw = result.value;
          const subRunData = subRaw.data?.resultData?.runData;
          const subWorkflowData = subRaw.workflowData;
          const subNodes = buildNodeList(subRunData, subWorkflowData);

          node.subExecution = {
            id: subExecutionId,
            workflowName: subWorkflowData?.name || null,
            status: subRaw.status || null,
            nodes: subNodes,
          };
        } else {
          // Sub-execution fetch failed — leave as null, don't break the parent
          node.subExecution = null;
        }
      }
    }

    const tokenSummary = aggregateTokenSummary(nodes);

    // Build execution metadata
    const startedAt = raw.startedAt || null;
    const stoppedAt = raw.stoppedAt || null;
    const duration =
      stoppedAt && startedAt
        ? new Date(stoppedAt).getTime() - new Date(startedAt).getTime()
        : null;

    const execution = {
      id: raw.id,
      status: raw.status || null,
      startedAt,
      stoppedAt,
      duration,
      mode: raw.mode || null,
      finished: raw.finished ?? null,
      workflowName: workflowData?.name || null,
      error: raw.data?.resultData?.error || null,
    };

    return { success: true, execution, nodes, tokenSummary, raw };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { getExecutions, getExecutionDetail };
