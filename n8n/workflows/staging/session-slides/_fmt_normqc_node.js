// 7.1f_FMT_NormQC — Format QC normalizer prompt for Haiku
const raw = $input.first().json;

const systemPrompt = `ROLE: JSON Schema Normalizer for QC review data.

You receive merged output from 3 parallel QC review calls (structural, instructional, quality).
The input may have any structure — your job is to extract and reorganize into the TARGET SCHEMA.

RULES:
- Output MUST match TARGET SCHEMA exactly
- Merge slide_reviews from all 3 QC categories
- Extract checklist_compliance data from ANY location (it may be under overall_assessment, instructional_sequence_review, learning_objectives_review, content_development_checklist, etc.)
- If checklist data is truly absent, provide descriptive defaults based on available data
- Count flags for review_summary

TARGET SCHEMA:
{
  "review_summary": {
    "overall_quality": "High|Medium|Low",
    "total_flags": "integer",
    "critical_flags": "integer",
    "calls_completed": "integer (how many of the 3 QC categories have data)"
  },
  "slide_reviews": {
    "slide_1": {
      "status": "Flagged|Clear",
      "flags": [{"category": "structural|instructional|quality", "severity": "critical|major|minor", "issue": "string", "suggestion": "string"}]
    },
    ...slide_2 through slide_N (one entry per slide in the session)
  },
  "checklist_compliance": {
    "gagne_coverage": "string describing coverage of Gagne's 9 events across slides",
    "kolb_coverage": "string describing coverage of Kolb's 4 stages",
    "ages_coverage": "string describing AGES factor distribution",
    "provenance_coverage": "string describing New/Reused/Adapted distribution",
    "bloom_compliance": "string describing Bloom's taxonomy alignment of objectives"
  },
  "attention_items": [
    {"category": "string", "issue": "string", "severity": "string", "affected_slides": ["string"]}
  ]
}

COMMON INPUT PATTERNS:
- QC calls may lack "category" field — infer from content: structural (layout/format), instructional (pedagogy/frameworks/bloom/gagne), quality (content accuracy/depth)
- "overall_assessment" often contains checklist data under different keys
- "instructional_sequence_review" often has gagne/kolb/ages data
- "learning_objectives_review" often has bloom data
- "content_development_checklist" is another variant with framework coverage`;

// Truncate raw data to fit within Haiku context limits (~30K chars max for user prompt)
let rawStr = JSON.stringify(raw.raw_qc_results || raw);
if (rawStr.length > 20000) rawStr = rawStr.substring(0, 20000) + '... [TRUNCATED]';

const userPrompt = `Normalize this merged QC review output to match the TARGET SCHEMA. Return ONLY valid JSON, no markdown.

RAW INPUT:
${rawStr}`;

const validatedInput = $('1.2_PREP_Input').first().json;
return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'NormQC',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
