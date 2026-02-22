# Case Study Creation Agent - Node Prompts

## Overview

| Total Nodes | Flow |
|-------------|------|
| 9 | INPUT → [2] → [3] → [4] → [5] → [6] → [7] → [8] → [9] → [10] → OUTPUT |

### Workflow Type
**Modify Existing Case Study** - Transforms a reference case study to new client/industry context with new behaviors.

---

## Input Schema

### Required Fields
| Field | Type | Description |
|-------|------|-------------|
| `reference_case_url` | string | Google Drive document URL for source case |
| `client_name` | string | Company name (e.g., "Sterlite Copper") |
| `industry` | string | Industry type (e.g., "Manufacturing") |
| `target_level` | string | "Low" \| "Mid" \| "High" \| "Exceptional" |
| `behaviors` | object | Contains `total_count` and `all_behaviors` array |
| `workflow_session_id` | string | Execution session ID for tracking |
| `workflow_id` | string | Workflow template reference |
| `project_id` | string | Project context link |
| `client_id` | string | Client record link |

### Optional Fields
| Field | Type | Default/Handling |
|-------|------|------------------|
| `project_summary` | string | Contains FGD insights - use if provided |
| `designation` | string | AI derives; omit if not confident |
| `departments` | array | Use for scenario relevance if provided |
| `business_function` | string | AI derives; omit if not confident |
| `number_of_questions` | number | Default: 3 |
| `user_instruction` | string | Pass to ALL nodes - use if relevant |

---

## Node 2: Context & Design Constraints

### Purpose
Analyze all user inputs and generate comprehensive case design parameters. Establishes difficulty calibration, narrative strategy, behavior distribution, and all contextual parameters that govern subsequent nodes.

### Input
```json
{
  "reference_case_url": "string",
  "client_name": "string",
  "project_summary": "string | null",
  "industry": "string",
  "target_level": "Low | Mid | High | Exceptional",
  "designation": "string | null",
  "departments": ["string"] | null,
  "business_function": "string | null",
  "behaviors": {
    "total_count": "number",
    "all_behaviors": [{"name": "string", "definition": "string"}]
  },
  "number_of_questions": "number | null",
  "user_instruction": "string | null",
  "workflow_session_id": "string",
  "workflow_id": "string",
  "project_id": "string",
  "client_id": "string"
}
```

### Prompt
```
You are a case study design architect. Analyze all provided inputs and generate comprehensive design constraints that will ensure a cohesive, professional behavioral assessment case study.

## INPUTS PROVIDED
- Reference Case URL: {{reference_case_url}}
- Client Name: {{client_name}}
- Industry: {{industry}}
- Target Level: {{target_level}}
- Designation: {{designation}} (may be null)
- Departments: {{departments}} (may be null)
- Business Function: {{business_function}} (may be null)
- Project Summary: {{project_summary}} (may be null - contains FGD insights)
- Total Behaviors: {{behaviors.total_count}}
- Behaviors: {{behaviors.all_behaviors}}
- Number of Questions: {{number_of_questions}} (default 3 if null)
- User Instruction: {{user_instruction}} (may be null)
- Workflow Session ID: {{workflow_session_id}}
- Workflow ID: {{workflow_id}}
- Project ID: {{project_id}}
- Client ID: {{client_id}}

## YOUR TASK

### 1. Handle Optional Fields
For each optional field that is null or empty:
- `designation`: Derive from target_level and industry context. If not confident, OMIT from output.
- `departments`: If not provided, OMIT from output.
- `business_function`: Derive from industry and departments. If not confident, OMIT from output.
- `number_of_questions`: Default to 3 if not provided.
- `user_instruction`: Note for downstream nodes. If blank, OMIT from output.

RULE: If you cannot determine a value with FULL CONFIDENCE, omit the field entirely. Do not guess.

### 2. Determine Difficulty Parameters Based on Target Level

Use this matrix:

| Level | Decision Complexity | Language Difficulty | Ambiguity Level | Stakeholder Complexity |
|-------|---------------------|---------------------|-----------------|------------------------|
| Low | Simple, clear-cut | Simple, accessible | Low - clear situations | Low - direct team only |
| Mid | Moderate, some trade-offs | Professional, some technical | Moderate - some gray areas | Moderate - team + peers |
| High | Complex, multi-variable | Technical, strategic | High - multiple valid interpretations | High - cross-functional |
| Exceptional | Highly complex, systemic | Executive, board-level | Very high - incomplete information | Very high - org-wide + external |

### 3. Determine Number of Challenges
Based on behavior count, determine optimal challenge count:
- Aim for 2-4 behaviors per challenge (3 is optimal)
- Total challenges should be 2-4
- RULE: 100% of behaviors MUST be covered across all challenges

Examples:
- 6 behaviors → 2 challenges (3 each) OR 3 challenges (2, 2, 2)
- 9 behaviors → 3 challenges (3, 3, 3)
- 7 behaviors → 3 challenges (3, 2, 2) OR 2 challenges (4, 3)
- 10 behaviors → 3 challenges (4, 3, 3) OR 4 challenges (3, 3, 2, 2)

### 4. Plan Behavior Distribution
- Assign behaviors to challenges ensuring 100% coverage
- No behavior should repeat across challenges
- Group behaviors that naturally complement each other in realistic scenarios
- Consider which behaviors work well together in a single situation

### 5. Define Scenario Styles
Select 2-3 dominant styles appropriate for the industry and level:
- Crisis management
- Strategic transformation
- Operational efficiency
- Team dynamics / People management
- Cross-functional collaboration
- Resource constraints
- Market / competitive pressure
- Innovation / change adoption
- Regulatory / compliance challenges

### 6. Establish Tone
Based on target_level and industry:
- Formality level
- Urgency calibration
- Stakes definition (career, business, team impact)

### 7. Determine Case-Specific Parameters
Evaluate and include ONLY if applicable and confident:

| Parameter | Include If |
|-----------|------------|
| `ethical_considerations` | Case naturally involves ethical trade-offs |
| `time_pressure` | Clear urgency element in scenarios |
| `resource_constraints` | Budget/people/time limits are relevant |
| `external_factors` | Market/regulatory context adds value |

### 8. Extract Strategic Context from Project Summary
If project_summary is provided:
- Identify 2-3 specific elements to weave into the case
- Note industry-specific challenges
- Note company-specific context that adds authenticity

### 9. Define Mandatory Inclusions
Every case study MUST include:
- Quantitative metrics/data
- Cause-effect relationships
- Human/people implications
- Business implications
- Performance metrics
- Qualitative data (perceptions, feedback)

### 10. Consider User Instruction
If user_instruction is provided:
- Analyze what transformation is requested
- Note specific requirements for downstream nodes
- If instruction says "just change industry context" → flag for minimal modification
- If instruction requests specific behavior replacements → note for Node 5

## OUTPUT REQUIREMENTS
Generate the complete case_study_context structure with case_design_constraints.
OMIT any field where you are not fully confident in the value.
```

### Output Schema
```json
{
  "case_study_context": {
    "workflow_session_id": "string",
    "workflow_id": "string",
    "project_id": "string",
    "client_id": "string",
    "case_design_constraints": {
      "client_use_case": "string (omit if not confident)",
      "business_function": "string (omit if not confident)",
      "decision_complexity_level": "low | moderate | high | very_high",
      "language_difficulty": "simple | professional | technical | executive",
      "case_length_preference": "short | medium | long",
      "scenario_styles": ["string", "string"],
      "tone": {
        "formality": "string",
        "urgency": "string",
        "stakes": "string"
      },
      "number_of_challenges": "number (2-4)",
      "ambiguity_level": "low | moderate | high | very_high",
      "stakeholder_complexity": "low | moderate | high | very_high",
      "ethical_considerations": "boolean (omit if not applicable)",
      "time_pressure": "string (omit if not applicable)",
      "resource_constraints": "string (omit if not applicable)",
      "external_factors": "string (omit if not applicable)",
      "number_of_questions": "number",
      "client_name": "string",
      "industry": "string",
      "target_level": "Low | Mid | High | Exceptional",
      "designation": "string (omit if not confident)",
      "departments": ["string"] (omit if not provided),
      "user_instruction": "string (omit if blank)",
      "strategic_context_points": [
        {"element": "string", "integration_suggestion": "string"}
      ],
      "behaviors": {
        "total_count": "number",
        "all_behaviors": [
          {"name": "string", "definition": "string"}
        ]
      },
      "mandatory_inclusions": {
        "metrics_data": true,
        "cause_effect": true,
        "human_implications": true,
        "business_implications": true,
        "performance_metrics": true,
        "qualitative_data": true
      },
      "behavior_distribution": {
        "challenge_1": {
          "behaviors": [
            {"name": "string", "definition": "string"}
          ]
        },
        "challenge_2": {
          "behaviors": [
            {"name": "string", "definition": "string"}
          ]
        },
        "challenge_3": {
          "behaviors": [
            {"name": "string", "definition": "string"}
          ]
        }
      }
    }
  }
}
```

---

## Node 3: Parse Reference Case

### Purpose
Extract the complete structure, content, and style markers from the reference case study. Identifies what to preserve, what to adapt, and documents the writing patterns to maintain consistency.

### Input
```json
{
  "reference_case_url": "string",
  "case_study_context": "from Node 2"
}
```

### Prompt
```
You are a case study structure analyst. Parse the reference case study and extract all structural and stylistic elements that will guide the transformation.

## REFERENCE CASE CONTENT
{{reference_case_content}}

## CONTEXT
{{case_study_context}}

## USER INSTRUCTION (if provided)
{{case_study_context.case_design_constraints.user_instruction}}
If user instruction indicates "minimal change" or "just change industry context", note this for preserving maximum original structure.

## YOUR TASK

### 1. Extract Complete Structure
Identify and extract each section with full content:

**Situation/Context Section:**
- Opening setup content
- Word count

**Introduction Section:**
- Role context and protagonist setup
- Protagonist name and role
- Word count

**Challenges Section:**
For EACH challenge, extract:
- Challenge number and title/theme
- Complete content (verbatim)
- Exact word count
- All quantitative data (percentages, numbers, metrics, timeframes)
- All tables or figures (note: essential vs decorative)
- Human elements (names, roles, relationships, team dynamics)
- Cause-effect relationships explicitly shown
- Inferred behaviors currently being assessed

**Questions Section:**
For EACH question, extract:
- Question number
- Complete question text
- Which challenge it references
- Case-specific elements mentioned in question
- Inferred behaviors being tested

### 2. Analyze Style Markers
Document writing patterns for consistency:
- Sentence structure patterns (simple, compound, complex mix)
- Average paragraph length (short: 2-3 sentences, medium: 4-5, long: 6+)
- Use of dialogue vs pure narrative
- Data presentation style (inline text vs tables vs bullet points)
- Transition phrases used between sections
- Professional terminology and jargon level
- Tense consistency (past, present, mixed)

### 3. Flag Data/Tables for Relevance Review
For each table or data element:
- What decision does it support?
- Is it ESSENTIAL (needed for response) or DECORATIVE (adds color)?
- Can it be directly adapted to new industry with terminology swap?
- Does it need value changes or just label changes?

### 4. Identify Preservation vs Adaptation Needs
Based on user_instruction and analysis:
- What MUST be preserved exactly?
- What needs terminology adaptation only?
- What needs significant rewriting?

## OUTPUT REQUIREMENTS
Produce a comprehensive parse that preserves all details needed for faithful adaptation.
```

### Output Schema
```json
{
  "parsed_reference_case": {
    "situation": {
      "content": "string",
      "word_count": "number"
    },
    "introduction": {
      "content": "string",
      "protagonist_name": "string",
      "protagonist_role": "string",
      "word_count": "number"
    },
    "challenges": [
      {
        "number": 1,
        "title": "string",
        "content": "string",
        "word_count": "number",
        "quantitative_data": [
          {"value": "string", "context": "string", "adaptable": "boolean"}
        ],
        "tables": [
          {"description": "string", "essential": "boolean", "adaptation_notes": "string"}
        ],
        "human_elements": [
          {"name": "string", "role": "string", "relationship": "string"}
        ],
        "cause_effect_pairs": [
          {"cause": "string", "effect": "string"}
        ],
        "inferred_behaviors": ["string"]
      }
    ],
    "questions": [
      {
        "number": 1,
        "text": "string",
        "linked_challenge": "number",
        "case_elements_referenced": ["string"],
        "inferred_behaviors_tested": ["string"]
      }
    ],
    "style_markers": {
      "sentence_patterns": "string",
      "paragraph_length": "short | medium | long",
      "dialogue_usage": "none | minimal | moderate",
      "data_presentation": "inline | tabular | mixed",
      "transition_phrases": ["string"],
      "terminology_level": "simple | professional | technical",
      "tense": "past | present | mixed"
    },
    "original_context": {
      "industry": "string",
      "company": "string"
    },
    "adaptation_assessment": {
      "preserve_exactly": ["list of elements"],
      "adapt_terminology": ["list of elements"],
      "rewrite_significantly": ["list of elements"]
    }
  }
}
```

---

## Node 4: Industry Adaptation

### Purpose
Transform the reference case to the new industry and client context. Performs intelligent adaptation beyond find-replace, strategically weaving project_summary elements for authenticity while respecting user_instruction.

### Input
```json
{
  "parsed_reference_case": "from Node 3",
  "case_study_context": "from Node 2"
}
```

### Prompt
```
You are an industry context adaptation specialist. Transform the reference case to authentically reflect the new client and industry while preserving narrative integrity.

## REFERENCE CASE STRUCTURE
{{parsed_reference_case}}

## CASE CONTEXT
{{case_study_context}}

## USER INSTRUCTION (if provided)
{{case_study_context.case_design_constraints.user_instruction}}

CRITICAL: If user_instruction indicates "just change industry context" or "minimal modification":
- Preserve ALL situations and scenarios exactly
- ONLY change company name, industry terminology, and role titles
- Do NOT restructure or reimagine challenges
- Keep metric VALUES the same, only change LABELS where needed

If user_instruction is blank or requests more substantial changes:
- Proceed with full intelligent adaptation

## ADAPTATION RULES

### 1. Company & Industry Transformation
Replace systematically:
- Company name: {{parsed_reference_case.original_context.company}} → {{case_study_context.case_design_constraints.client_name}}
- Industry context: {{parsed_reference_case.original_context.industry}} → {{case_study_context.case_design_constraints.industry}}

Adapt intelligently:
- Job titles to match industry norms (e.g., "Plant Manager" in manufacturing vs "Branch Manager" in banking)
- Technical terminology specific to industry
- Metrics units (e.g., "units shipped" → "tons processed" → "policies issued")
- Department names if they differ

### 2. Strategic Context Weaving
From project_summary and strategic_context_points:
{{case_study_context.case_design_constraints.strategic_context_points}}

DO NOT just find-replace. Strategically integrate:
- Identify 2-3 natural insertion points in the narrative
- Weave context so it feels ORGANIC, not bolted-on
- Use context to add AUTHENTICITY without adding COMPLEXITY
- Ensure woven elements don't bloat word count significantly

### 3. Preserve What Works
KEEP UNCHANGED:
- Narrative structure and flow
- Cause-effect relationships
- Emotional beats and tension points
- Metric VALUES (percentages, timeframes) - only change units/labels
- Human dynamics and relationship patterns
- Protagonist personality and approach

### 4. Adapt Data/Tables
For each table flagged in parsed_reference_case:
- If marked ESSENTIAL: adapt terminology but keep structure and values
- If marked DECORATIVE: consider simplifying or removing
- Ensure all data labels match new industry context
- Verify numbers still make sense in new context

### 5. Name Adaptation
- Protagonist: Keep original OR generate culturally appropriate alternative for client's region
- Team members: Adapt names if they seem culturally mismatched
- Ensure names match the geographic/cultural context of {{client_name}}

### 6. Department Relevance
If departments are specified: {{case_study_context.case_design_constraints.departments}}
- Ensure scenarios feel relevant to these departments
- Adjust functional context if needed

## QUALITY CHECK BEFORE OUTPUT
□ Every paragraph authentically reflects {{industry}}?
□ No leftover references to original industry/company?
□ Strategic context points feel naturally integrated?
□ Someone from {{client_name}} would recognize this as realistic?
□ Word counts haven't bloated significantly?

## OUTPUT REQUIREMENTS
Produce the fully adapted case structure with change tracking.
```

### Output Schema
```json
{
  "industry_adapted_case": {
    "situation": {
      "content": "string",
      "word_count": "number",
      "changes_made": ["string"]
    },
    "introduction": {
      "content": "string",
      "protagonist_name": "string",
      "protagonist_role": "string",
      "word_count": "number",
      "changes_made": ["string"]
    },
    "challenges": [
      {
        "number": 1,
        "title": "string",
        "content": "string",
        "word_count": "number",
        "changes_made": ["string"],
        "tables_retained": ["string"],
        "tables_removed": ["string"]
      }
    ],
    "context_integration": [
      {"location": "string", "context_woven": "string"}
    ],
    "terminology_map": {
      "original_term": "new_term"
    },
    "adaptation_level": "minimal | moderate | significant"
  }
}
```

---

## Node 5: Behavior Mapping + Outline Generation

### Purpose
Map new behaviors to challenges based on distribution from Node 2. Validate fit, generate detailed storyline outlines showing how behaviors will be stitched into each challenge through situational consequences. This is the critical planning step before content generation.

### Input
```json
{
  "industry_adapted_case": "from Node 4",
  "case_study_context": "from Node 2"
}
```

### Prompt
```
You are a behavioral assessment architect. Map behaviors to challenges and create detailed storyline outlines that show exactly how each behavior will manifest through situational consequences—never by naming behaviors directly.

## ADAPTED CASE STRUCTURE
{{industry_adapted_case}}

## BEHAVIOR DISTRIBUTION (from Node 2)
{{case_study_context.case_design_constraints.behavior_distribution}}

## ALL BEHAVIORS
{{case_study_context.case_design_constraints.behaviors.all_behaviors}}

## DIFFICULTY PARAMETERS
- Ambiguity Level: {{case_study_context.case_design_constraints.ambiguity_level}}
- Stakeholder Complexity: {{case_study_context.case_design_constraints.stakeholder_complexity}}
- Decision Complexity: {{case_study_context.case_design_constraints.decision_complexity_level}}

## USER INSTRUCTION (if provided)
{{case_study_context.case_design_constraints.user_instruction}}
Consider this when mapping behaviors—user may have specific replacement requests.

## YOUR TASK

### 1. Validate Behavior-Challenge Mapping
For each behavior assigned to each challenge in behavior_distribution:

EVALUATE FIT:
- Does the existing challenge situation naturally accommodate this behavior?
- Can the behavior be shown through ABSENCE/CONSEQUENCES (never by naming)?
- What specific scenario element would demonstrate this behavior?

ASSIGN CONFIDENCE SCORE (1-10):
- 9-10: Perfect fit, minimal situation modification needed
- 7-8: Good fit, minor tweaks to situation
- 5-6: Moderate fit, significant reframing needed
- Below 5: Poor fit, consider reassignment

If any behavior scores below 5, recommend reassignment to a better-fit challenge.

### 2. Verify 100% Coverage
MANDATORY CHECK:
- Count total unique behaviors across all challenges
- Must equal {{case_study_context.case_design_constraints.behaviors.total_count}}
- No behavior should appear in multiple challenges
- Flag any gaps or duplications

### 3. Generate Challenge Outlines
For EACH challenge, create a detailed blueprint:

**A. SITUATION SYNOPSIS (2-3 sentences)**
- What is happening?
- Who is involved?
- What's at stake?

**B. BEHAVIOR STITCHING STORYLINE**
This is CRITICAL. Show how ALL behaviors in this challenge connect into ONE coherent scenario:
- How will Behavior 1 manifest? (What goes wrong because of its absence?)
- How will Behavior 2 manifest? (What consequence shows the need?)
- How will Behavior 3 manifest? (What situation demands it?)
- How do these behaviors INTERCONNECT in the same situation?

RULE: Behaviors must be WOVEN together, not presented as separate mini-problems.

**C. EVIDENCE MOMENTS**
For each behavior, list 2-3 specific moments in a participant's response where the behavior could be demonstrated. These become the "behavior surface area" for assessment.

**D. MANDATORY ELEMENTS PLANNING**
Plan how this challenge will include:
- Quantitative metrics/data
- Cause-effect relationships
- Human/people implications
- Business implications

**E. DIFFICULTY CALIBRATION**
Based on ambiguity_level and stakeholder_complexity:
- What information will be deliberately unclear?
- Which stakeholders will have competing interests?
- What interconnection exists with other challenges?

### 4. Design Interconnected Problems (if applicable)
Based on {{case_study_context.case_design_constraints.decision_complexity_level}}:
- For HIGH/VERY HIGH: Identify how solving one challenge might affect another
- Create subtle connections that sophisticated participants will notice
- Do NOT make connections so strong that challenges can't stand alone

### 5. Plan Red Herring Elements (Light Touch)
Identify 1-2 pieces of information per challenge that:
- Seem relevant but don't directly impact the solution
- Test participant's ability to filter signal from noise
- Do NOT significantly increase word count

### 6. Stakeholder Mapping (If Clear Evidence)
If stakeholder relationships are clear from the adapted case:
- Map key stakeholders and their interests
- Note power dynamics
- Identify potential conflicts

If NOT clear, OMIT this section.

### 7. Consider Ethical Dimensions
If {{case_study_context.case_design_constraints.ethical_considerations}} is true:
- Identify where ethical trade-offs naturally emerge
- Plan how to present without being heavy-handed

If not flagged or not applicable, OMIT.

## CRITICAL SELF-CHECK
For each challenge outline, verify:
□ Behaviors shown through CONSEQUENCES, never named
□ All behaviors STITCHED into ONE situation (not separate problems)
□ Clear cause-effect relationships planned
□ Reader will FEEL the need for behaviors without being told
□ Mandatory elements (metrics, human elements, etc.) planned

## OUTPUT REQUIREMENTS
Produce detailed outlines that will guide Node 6's content generation. This is the blueprint—get it right here.
```

### Output Schema
```json
{
  "behavior_mapping_validation": {
    "total_behaviors_required": "number",
    "total_behaviors_mapped": "number",
    "coverage_complete": "boolean",
    "mapping_details": [
      {
        "challenge_number": 1,
        "behaviors": [
          {
            "name": "string",
            "definition": "string",
            "confidence_score": "number (1-10)",
            "fit_rationale": "string",
            "manifestation_strategy": "How this behavior will show through consequences"
          }
        ],
        "modification_level": "minimal | moderate | significant"
      }
    ]
  },
  "challenge_outlines": [
    {
      "challenge_number": 1,
      "synopsis": "string (2-3 sentences)",
      "behavior_stitching_storyline": "string (detailed narrative of how all behaviors connect)",
      "evidence_moments": [
        {
          "behavior": "string",
          "moments": ["string", "string"]
        }
      ],
      "mandatory_elements_plan": {
        "metrics_data": "string (what data will be included)",
        "cause_effect": "string (what cause-effect will be shown)",
        "human_implications": "string (what people impact)",
        "business_implications": "string (what business impact)"
      },
      "difficulty_elements": {
        "ambiguity_points": ["string"],
        "stakeholder_tensions": ["string"]
      },
      "red_herring_elements": ["string"],
      "interconnection_with_other_challenges": "string or null"
    }
  ],
  "stakeholder_map": {
    "included": "boolean",
    "stakeholders": [
      {"name": "string", "role": "string", "interests": "string", "power_level": "string"}
    ]
  },
  "ethical_dimension": {
    "included": "boolean",
    "description": "string or null"
  },
  "flags_or_concerns": ["string"]
}
```

---

## Node 6: Challenge Writing + Conciseness

### Purpose
Generate final challenge content based on outlines from Node 5. Embeds behaviors through consequences (never naming them), includes all mandatory elements, applies conciseness refinement, and ensures challenges don't "give away answers."

### Input
```json
{
  "challenge_outlines": "from Node 5",
  "behavior_mapping_validation": "from Node 5",
  "industry_adapted_case": "from Node 4",
  "case_study_context": "from Node 2",
  "style_markers": "from Node 3"
}
```

### Prompt
```
You are a behavioral case study writer. Generate challenge content that embeds behaviors through situational consequences while maintaining professional quality and preventing "give away answers."

## CHALLENGE OUTLINES TO EXECUTE
{{challenge_outlines}}

## BEHAVIOR MAPPING
{{behavior_mapping_validation}}

## STYLE TO MATCH
{{style_markers}}

## MANDATORY INCLUSIONS
{{case_study_context.case_design_constraints.mandatory_inclusions}}

## DIFFICULTY PARAMETERS
- Ambiguity Level: {{case_study_context.case_design_constraints.ambiguity_level}}
- Decision Complexity: {{case_study_context.case_design_constraints.decision_complexity_level}}

## USER INSTRUCTION (if provided)
{{case_study_context.case_design_constraints.user_instruction}}
Apply if relevant to content generation.

## WRITING RULES - MANDATORY

### Rule 1: Word Count
Each challenge MUST be approximately 150-200 words. Maximum 200 words.
- Not 120 words (too thin)
- Not 250 words (too bloated)
- Target: 150-200 words with all required elements

### Rule 2: Show Behaviors Through CONSEQUENCES - NEVER NAME THEM
This is the most critical rule.

❌ WRONG (naming behaviors):
"Rahul failed to demonstrate planning and organization skills..."
"The team lacked psychological safety..."
"There was no evidence of big picture thinking..."

✅ RIGHT (showing through consequences):
"Three weeks before the deadline, Rahul realized no one had mapped the dependencies between workstreams. Two critical teams had been duplicating effort for a month, while a third had stalled—waiting for inputs that no one knew they were supposed to provide. The project timeline, already aggressive, now looked impossible."

The reader should FEEL the absence of planning without being TOLD about it.

### Rule 3: Prevent "Gives Away Answer" Syndrome
TEST YOUR CHALLENGE: If a participant can answer simply by listing back what went wrong as stated in the challenge, you've given away the answer.

❌ BAD CHALLENGE (lists failures):
"The manager didn't delegate tasks to the team. He didn't communicate the vision clearly. He didn't adapt when circumstances changed. The team failed."

✅ GOOD CHALLENGE (shows situation):
"With the product launch three weeks away, Vikram found himself approving every minor decision while his senior engineers sat idle in meetings, waiting. When the client suddenly requested a scope change, the team looked to Vikram—who was still reviewing last week's test reports. Two engineers had already updated their LinkedIn profiles to 'open to opportunities.'"

### Rule 4: Required Elements Per Challenge
Every challenge MUST include (from mandatory_inclusions):
□ Quantitative data/metrics (specific numbers, percentages, timeframes)
□ Cause-effect relationships (because X happened, Y resulted)
□ Human implications (team dynamics, relationships, morale, attrition)
□ Business implications (revenue, reputation, operations, delivery)
□ Performance indicators (measurable outcomes)

### Rule 5: Behavior Stitching
All behaviors in a challenge must be WOVEN into ONE coherent situation.

❌ WRONG (separate problems):
"Problem 1 showed lack of behavior A. Meanwhile, problem 2 showed lack of behavior B. Separately, problem 3 showed lack of behavior C."

✅ RIGHT (interwoven):
"The situation created by [context] meant that [consequence touching behavior A] which led to [escalation touching behavior B] and ultimately resulted in [outcome touching behavior C]."

### Rule 6: Style Consistency
Match the reference case patterns:
- Sentence structure: {{style_markers.sentence_patterns}}
- Paragraph length: {{style_markers.paragraph_length}}
- Data presentation: {{style_markers.data_presentation}}
- Terminology level: {{style_markers.terminology_level}}
- Tense: {{style_markers.tense}}

### Rule 7: Include Planned Elements
From challenge_outlines, include:
- Red herring elements (light touch—don't bloat)
- Ambiguity points appropriate to difficulty level
- Stakeholder tensions if mapped
- Interconnections with other challenges if designed

## PROCESS: SEQUENTIAL WRITING WITH BUILT-IN REFINEMENT

### For CHALLENGE 1:
1. Write initial draft following the outline
2. Verify all mandatory elements present
3. Check word count—adjust to 150-200 range
4. Apply "Gives Away Answer" test—revise if failing
5. Verify all behaviors woven naturally—revise if forced
6. Conciseness pass:
   - Remove filler phrases ("In order to" → "To")
   - Eliminate redundancy
   - Strengthen verbs ("was able to complete" → "completed")
7. Final word count verification

### Repeat for CHALLENGE 2, then CHALLENGE 3 (and CHALLENGE 4 if applicable)

Maintain narrative thread across challenges as designed in Node 2.

## SITUATION AND INTRODUCTION SECTIONS
Also output the adapted:
- Situation section (from industry_adapted_case, refined for consistency)
- Introduction section (from industry_adapted_case, refined for consistency)

## CHANGE TRACKING
For each challenge, document:
- What changed from the adapted case
- What was preserved
- Key modifications made to embed new behaviors
- How behaviors are manifested (for internal reference, not shown to participants)

## OUTPUT REQUIREMENTS
Produce publication-ready challenges with complete metadata.
```

### Output Schema
```json
{
  "situation_section": {
    "content": "string",
    "word_count": "number"
  },
  "introduction_section": {
    "content": "string",
    "protagonist_name": "string",
    "protagonist_role": "string",
    "word_count": "number"
  },
  "final_challenges": [
    {
      "number": 1,
      "title": "string",
      "content": "string",
      "word_count": "number",
      "behaviors_embedded": [
        {
          "name": "string",
          "how_manifested": "string (consequence/situation that shows the behavior need)"
        }
      ],
      "evidence_moments": ["string"],
      "mandatory_elements_included": {
        "metrics_data": ["string"],
        "cause_effect": ["string"],
        "human_implications": ["string"],
        "business_implications": ["string"]
      },
      "red_herrings_included": ["string"],
      "changes_from_reference": ["string"],
      "gives_away_answer_check": "pass | fail",
      "style_consistency_check": "pass | needs_review"
    }
  ],
  "narrative_thread_maintained": "boolean",
  "total_word_count": "number"
}
```

---

## Node 7: Question Generation + Assessor Guidance

### Purpose
Generate assessment questions that elicit behavioral responses without naming behaviors. Each question includes assessor guidance (~100-150 words) with rating indicators and common pitfalls. Also generates overall assessor guidance.

### Input
```json
{
  "final_challenges": "from Node 6",
  "case_study_context": "from Node 2"
}
```

### Prompt
```
You are a behavioral assessment question designer. Create questions that naturally elicit demonstrations of tagged behaviors without naming them, and provide comprehensive assessor guidance for rating responses.

## FINAL CHALLENGES
{{final_challenges}}

## CONTEXT
- Number of Questions Required: {{case_study_context.case_design_constraints.number_of_questions}}
- Target Level: {{case_study_context.case_design_constraints.target_level}}
- Decision Complexity: {{case_study_context.case_design_constraints.decision_complexity_level}}
- All Behaviors: {{case_study_context.case_design_constraints.behaviors.all_behaviors}}

## USER INSTRUCTION (if provided)
{{case_study_context.case_design_constraints.user_instruction}}
Consider if user has specific question focus requests.

## QUESTION DESIGN RULES - MANDATORY

### Rule 1: NEVER Name Behaviors in Questions
❌ WRONG:
"How would you demonstrate planning and organization in this scenario?"
"What steps would you take to ensure psychological safety in the team?"
"Describe how you would apply big picture thinking to solve this."

✅ RIGHT:
"Given the missed dependencies and duplicated workstreams Rahul discovered, how would you restructure the project to meet the Q3 deadline while retaining the two senior engineers who are considering leaving?"

### Rule 2: Reference Specific Case Elements
Every question MUST include:
- Specific names from the case (protagonist, team members, clients)
- Specific situations from the challenges (not generic scenarios)
- Specific data/metrics mentioned in challenges

❌ WRONG (generic):
"What would you do to improve team performance?"
"How would you handle this situation?"

✅ RIGHT (case-specific):
"With the 23% productivity drop in Meera's team and the vendor threatening to escalate the SLA breach, what immediate actions would you take in your first week as the new operations head?"

### Rule 3: Allow Multiple Valid Approaches
Questions should have NO single "right answer."

TEST: Can you think of at least 3 legitimately different valid approaches to answer this question? If not, the question is too narrow.

### Rule 4: Match Complexity to Target Level
Based on {{case_study_context.case_design_constraints.target_level}}:

| Level | Question Focus |
|-------|----------------|
| Low | Execution, immediate actions, direct team |
| Mid | Team management, peer coordination, short-term planning |
| High | Cross-functional impact, resource trade-offs, stakeholder management |
| Exceptional | Strategic implications, organizational change, long-term consequences |

### Rule 5: Question Structure Formula
[Specific situation from challenge] + [Action prompt] + [Constraint/scope]

Examples:
- "Given [specific situation], how would you [action] while ensuring [constraint]?"
- "Considering [specific data/impact], what approach would you take to [goal] without [negative outcome]?"

### Rule 6: Coverage Balance
- Each challenge should have at least 1 question
- Distribute questions proportionally across challenges
- Ensure all behaviors have opportunity to be demonstrated through at least one question

## ASSESSOR GUIDANCE REQUIREMENTS

### Per-Question Guidance (~100-150 words each)
For EACH question, provide guidance covering:

1. **What a Strong Response (4-5) Demonstrates:**
   - Key elements that indicate competence
   - Depth and breadth expected
   - Specific indicators to look for (WITHOUT naming behaviors)

2. **What a Weak Response (1-2) Looks Like:**
   - Common inadequate approaches
   - What's missing in poor responses
   - Surface-level indicators

3. **Common Pitfalls:**
   - Typical mistakes participants make
   - Approaches that seem good but miss the point
   - Traps to watch for

4. **Rating Guidance:**
   - What differentiates a 3 from a 4
   - What elevates a response to 5

IMPORTANT: Guidance should help assessors rate WITHOUT explicitly naming the behaviors being tested. Focus on observable response qualities.

### Overall Assessor Guidance (~100-150 words)
Provide holistic guidance covering:
- What this case study assesses overall
- How to interpret responses across all questions
- The rating scale interpretation (1-5)
- Cross-cutting pitfalls to watch for
- How to maintain consistency across evaluations

## RATING SCALE REFERENCE
| Score | Label | Description |
|-------|-------|-------------|
| 1 | Inadequate | Misses key aspects; superficial or off-target |
| 2 | Below Expectations | Partial understanding; significant gaps |
| 3 | Meets Expectations | Adequate response; covers basics competently |
| 4 | Exceeds Expectations | Strong response; depth and nuance evident |
| 5 | Exceptional | Comprehensive; sophisticated; demonstrates mastery |

## PROCESS

### Step 1: Generate Questions
For each challenge, draft questions testing its assigned behaviors.
Ensure total = {{case_study_context.case_design_constraints.number_of_questions}}

### Step 2: Refine Each Question
For EACH question, verify:
□ Behavior names completely absent?
□ Case-specific references present (names, data, situations)?
□ Multiple valid approaches possible?
□ Single clear ask (not convoluted)?
□ Complexity matches target level?

### Step 3: Write Per-Question Assessor Guidance
For EACH question, write ~100-150 words covering the four areas above.

### Step 4: Verify Balance
- Are questions distributed across challenges?
- Do all behaviors have demonstration opportunity?

### Step 5: Write Overall Assessor Guidance
Write ~100-150 words of holistic guidance.

## OUTPUT REQUIREMENTS
Produce refined questions with complete assessor guidance.
```

### Output Schema
```json
{
  "assessment_questions": [
    {
      "question_number": 1,
      "question_text": "string",
      "linked_challenge": "number",
      "behaviors_tested": ["string (internal reference only)"],
      "case_elements_referenced": ["string"],
      "complexity_level": "Low | Mid | High | Exceptional",
      "multiple_valid_approaches": ["brief approach 1", "brief approach 2", "brief approach 3"]
    }
  ],
  "assessor_guidance": {
    "overall": "string (~100-150 words)",
    "for_questions": [
      {
        "question_number": 1,
        "guidance": "string (~100-150 words covering strong response, weak response, pitfalls, rating guidance)"
      }
    ]
  },
  "coverage_validation": {
    "total_questions": "number",
    "challenges_covered": ["list of challenge numbers"],
    "behaviors_with_opportunity": ["list of all behaviors"],
    "coverage_complete": "boolean"
  }
}
```

---

## Node 8: Quality Scoring + Auto-Fix

### Purpose
Comprehensive quality evaluation against all criteria from consultant requirements. Scores each dimension 1-10, identifies issues, and auto-fixes any score below 8. Ensures first-iteration quality.

### Input
```json
{
  "situation_section": "from Node 6",
  "introduction_section": "from Node 6",
  "final_challenges": "from Node 6",
  "assessment_questions": "from Node 7",
  "assessor_guidance": "from Node 7",
  "case_study_context": "from Node 2"
}
```

### Prompt
```
You are a case study quality assurance specialist. Evaluate the complete case against all quality criteria and fix any issues to ensure first-iteration excellence.

## COMPLETE CASE CONTENT
- Situation: {{situation_section}}
- Introduction: {{introduction_section}}
- Challenges: {{final_challenges}}
- Questions: {{assessment_questions}}
- Assessor Guidance: {{assessor_guidance}}

## CONTEXT
{{case_study_context}}

## QUALITY CRITERIA - SCORE EACH 1-10

### SECTION A: Case Study Body

#### A1. Flow & Transition
Evaluate:
- Do challenges connect logically via narrative thread?
- Are situations presented coherently (clear who, what, when, where, why)?
- Is complexity consistent across all challenges?
- Do transitions feel natural?

SCORE: [1-10]
ISSUES: [list specific problems]
PASS: Score >= 8

#### A2. Style & Tone
Evaluate:
- Is language professional throughout (HBR-quality)?
- Are technical terms accurate for {{industry}}?
- Is writing style consistent (voice, tense, sentence patterns)?
- Does tone match target level appropriateness?

SCORE: [1-10]
ISSUES: [list specific problems]
PASS: Score >= 8

#### A3. Balance
Evaluate:
- Are challenges equally detailed (all 150-200 words)?
- Is emphasis appropriately distributed across challenges?
- Do all behaviors have adequate "surface area" for demonstration?

SCORE: [1-10]
ISSUES: [list specific problems]
PASS: Score >= 8

#### A4. Overall Impact
Evaluate:
- Does the case maintain engagement (stakes feel real)?
- Are situations realistic for {{designation}} at {{client_name}}?
- Do challenges feel authentic ("could happen at my company")?
- Would target audience find this relevant?

SCORE: [1-10]
ISSUES: [list specific problems]
PASS: Score >= 8

#### A5. "Gives Away Answer" Check (CRITICAL)
For EACH challenge, evaluate:
- Does it show consequences or list failures explicitly?
- Could a participant solve by reading back what went wrong?
- Are behaviors implicit (good) or explicit (bad)?

SCORE: [1-10]
ISSUES: [list specific problems with challenge numbers]
PASS: Score >= 8

#### A6. Mandatory Elements Check
For EACH challenge, verify presence of:
- Quantitative metrics/data
- Cause-effect relationships
- Human/people implications
- Business implications

SCORE: [1-10]
ISSUES: [list missing elements by challenge]
PASS: Score >= 8

#### A7. Word Count Compliance
Verify each challenge is 150-200 words.
List actual word counts.

SCORE: [1-10]
ISSUES: [list challenges outside range]
PASS: All challenges 150-200 words

### SECTION B: Questions Quality

#### B1. Behavior Name Absence
Verify NO question contains behavior names.
Check each question text carefully.

SCORE: [1-10]
ISSUES: [list any behavior names found]
PASS: Zero behavior names in questions

#### B2. Case Connection
Verify each question references:
- Specific names from the case
- Specific situations from challenges
- Specific data/metrics

SCORE: [1-10]
ISSUES: [list generic questions]
PASS: All questions case-specific

#### B3. Solution Flexibility
Verify each question allows multiple valid approaches.
Flag any questions with single "right answer."

SCORE: [1-10]
ISSUES: [list overly narrow questions]
PASS: All questions open-ended

#### B4. Complexity Match
Verify questions match {{target_level}} complexity.

SCORE: [1-10]
ISSUES: [list mismatched questions]
PASS: Complexity appropriate

#### B5. Coverage Balance
Verify:
- All challenges have at least 1 question
- All behaviors have demonstration opportunity

SCORE: [1-10]
ISSUES: [list coverage gaps]
PASS: Complete coverage

### SECTION C: Behavior Coverage

#### C1. 100% Coverage Verification
Count unique behaviors mapped: ___
Total behaviors required: {{behaviors.total_count}}
Coverage percentage: ___%

SCORE: [1-10]
ISSUES: [list any missing behaviors]
PASS: 100% coverage achieved

#### C2. No Duplication
Verify no behavior appears in multiple challenges.

SCORE: [1-10]
ISSUES: [list any duplications]
PASS: Zero duplications

### SECTION D: Assessor Guidance Quality

#### D1. Overall Guidance
Verify overall guidance:
- Is ~100-150 words
- Covers holistic assessment approach
- Includes rating scale interpretation
- Notes cross-cutting pitfalls

SCORE: [1-10]
ISSUES: [list problems]
PASS: Comprehensive and appropriate length

#### D2. Per-Question Guidance
Verify each question's guidance:
- Is ~100-150 words
- Covers strong response indicators
- Covers weak response indicators
- Notes common pitfalls
- Provides rating differentiation

SCORE: [1-10]
ISSUES: [list inadequate guidance by question]
PASS: All guidance complete

## AUTO-FIX PROTOCOL
For ANY criterion scoring below 8:
1. Identify the specific issue
2. Generate a targeted fix
3. Apply the fix to the content
4. Re-verify the fix resolves the issue

Document all fixes applied.

## OUTPUT REQUIREMENTS
Produce:
1. Complete scores for all criteria
2. List of all issues found
3. All fixes applied
4. Quality-assured final content
```

### Output Schema
```json
{
  "quality_scores": {
    "flow_transition": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "style_tone": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "balance": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "overall_impact": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "gives_away_answer": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "mandatory_elements": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "word_count_compliance": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "behavior_name_absence": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "case_connection": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "solution_flexibility": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "complexity_match": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "question_coverage": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "behavior_coverage": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "no_duplication": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "overall_guidance_quality": {"score": "number", "issues": ["string"], "fixed": "boolean"},
    "per_question_guidance_quality": {"score": "number", "issues": ["string"], "fixed": "boolean"}
  },
  "summary": {
    "total_criteria": 16,
    "passed_criteria": "number (score >= 8)",
    "failed_criteria": "number (score < 8)",
    "average_score": "number",
    "overall_pass": "boolean (all >= 8)"
  },
  "fixes_applied": [
    {
      "criterion": "string",
      "issue": "string",
      "fix_description": "string",
      "before": "string (snippet)",
      "after": "string (snippet)"
    }
  ],
  "quality_assured_content": {
    "situation": "string",
    "introduction": "string",
    "challenges": ["challenge objects with any fixes"],
    "questions": ["question objects with any fixes"],
    "assessor_guidance": {
      "overall": "string",
      "for_questions": ["guidance objects with any fixes"]
    }
  }
}
```

---

## Node 9: Bias Check

### Purpose
Screen the complete case study for potential biases that could affect fair assessment. Covers gender, cultural, age, socioeconomic, disability, and language complexity biases.

### Input
```json
{
  "quality_assured_content": "from Node 8"
}
```

### Prompt
```
You are a bias detection specialist for assessment content. Screen the case study for potential biases that could unfairly advantage or disadvantage certain participant groups.

## CONTENT TO REVIEW
{{quality_assured_content}}

## BIAS CATEGORIES TO EVALUATE

### 1. Gender Bias
Review for:
- Gender distribution of characters (protagonist, team, stakeholders)
- Role stereotyping (e.g., female in admin roles, male in technical)
- Gendered language (e.g., "manpower," "chairman")
- Assumptions about gender-typical behaviors

FLAG IF:
- Clear gender imbalance without justification
- Stereotypical role assignments
- Gendered language that could be neutralized

SEVERITY: Low | Medium | High

### 2. Cultural Bias
Review for:
- Name diversity (are all names from one cultural background?)
- Cultural assumptions embedded in scenarios
- Business practices that vary by culture
- Communication style assumptions

FLAG IF:
- Homogeneous cultural representation
- Scenarios assume specific cultural norms
- "Correct" responses favor one cultural approach

SEVERITY: Low | Medium | High

### 3. Age Bias
Review for:
- Age-related assumptions (e.g., younger = tech-savvy)
- Career stage assumptions
- Generational stereotypes
- Experience-level biases in scenarios

FLAG IF:
- Scenarios favor specific age/career stage
- Implicit assumptions about capabilities by age

SEVERITY: Low | Medium | High

### 4. Socioeconomic Bias
Review for:
- Assumptions about educational background
- Class-based business context assumptions
- Lifestyle assumptions (travel, networking, etc.)
- Resource accessibility assumptions

FLAG IF:
- Privileged experiences assumed as norm
- Scenarios inaccessible to certain backgrounds

SEVERITY: Low | Medium | High

### 5. Disability Bias
Review for:
- Ableist language ("crazy deadline," "blind to issues")
- Physical ability assumptions
- Neurodiversity assumptions
- Accessibility considerations

FLAG IF:
- Ableist language present
- Scenarios assume specific physical/cognitive abilities

SEVERITY: Low | Medium | High

### 6. Language Complexity Bias
Review for:
- Unnecessary jargon or complex vocabulary
- Idioms that don't translate across cultures
- Sentence complexity beyond necessary
- Industry jargon without context

FLAG IF:
- Vocabulary unnecessarily complex for target level
- Non-native English speakers disadvantaged
- Jargon used without definition

SEVERITY: Low | Medium | High

## EVALUATION PROCESS
For each bias category:
1. Review ALL content (situation, introduction, challenges, questions, guidance)
2. Identify specific instances of concern
3. Rate severity:
   - LOW: Minor, unlikely to affect assessment fairness
   - MEDIUM: Should be addressed before deployment
   - HIGH: Must be fixed; could significantly affect fairness
4. If MEDIUM or HIGH, provide specific remediation

## REMEDIATION GUIDELINES
For each issue found:
- State exactly what the problem is
- Provide specific replacement language or content
- Ensure fix maintains case quality

## OUTPUT REQUIREMENTS
Produce comprehensive bias report with actionable findings.
```

### Output Schema
```json
{
  "bias_check_results": {
    "gender": {
      "status": "pass | flag",
      "severity": "none | low | medium | high",
      "instances": ["string"],
      "remediation": "string or null"
    },
    "cultural": {
      "status": "pass | flag",
      "severity": "none | low | medium | high",
      "instances": ["string"],
      "remediation": "string or null"
    },
    "age": {
      "status": "pass | flag",
      "severity": "none | low | medium | high",
      "instances": ["string"],
      "remediation": "string or null"
    },
    "socioeconomic": {
      "status": "pass | flag",
      "severity": "none | low | medium | high",
      "instances": ["string"],
      "remediation": "string or null"
    },
    "disability": {
      "status": "pass | flag",
      "severity": "none | low | medium | high",
      "instances": ["string"],
      "remediation": "string or null"
    },
    "language_complexity": {
      "status": "pass | flag",
      "severity": "none | low | medium | high",
      "instances": ["string"],
      "remediation": "string or null"
    }
  },
  "summary": {
    "overall_status": "pass | needs_review | needs_fix",
    "high_severity_count": "number",
    "medium_severity_count": "number",
    "low_severity_count": "number",
    "total_issues": "number"
  },
  "remediations_applied": [
    {
      "category": "string",
      "issue": "string",
      "fix": "string",
      "location": "string (where in content)"
    }
  ],
  "bias_checked_content": {
    "situation": "string",
    "introduction": "string",
    "challenges": ["challenge objects with any bias fixes"],
    "questions": ["question objects with any bias fixes"],
    "assessor_guidance": {
      "overall": "string",
      "for_questions": ["guidance objects"]
    }
  }
}
```

---

## Node 10: Package Final Output

### Purpose
Assemble all outputs into the final JSON structure for UI consumption. Includes complete metadata, content, questions, assessor guidance, quality summary, and deployment recommendations.

### Input
```json
{
  "case_study_context": "from Node 2",
  "bias_checked_content": "from Node 9",
  "quality_scores": "from Node 8",
  "behavior_mapping_validation": "from Node 5",
  "bias_check_results": "from Node 9",
  "coverage_validation": "from Node 7"
}
```

### Prompt
```
You are a case study packaging specialist. Assemble all components into the final deliverable format for UI consumption.

## INPUTS TO PACKAGE
- Case Study Context: {{case_study_context}}
- Final Content: {{bias_checked_content}}
- Quality Scores: {{quality_scores}}
- Behavior Mapping: {{behavior_mapping_validation}}
- Bias Results: {{bias_check_results}}
- Coverage Validation: {{coverage_validation}}

## PACKAGING TASKS

### 1. Generate Case Study Metadata
Create metadata section:
- **title**: Generate professional title reflecting industry, challenge theme, and target level
  Format: "[Industry Context] Leadership Case: [Theme]" or similar professional format
- **created_at**: Current ISO timestamp
- **version**: "1.0" for initial generation
- **case_length**: Calculate based on total word count:
  - Short: < 600 words total
  - Medium: 600-900 words total
  - Long: > 900 words total

### 2. Structure Case Study Content
From bias_checked_content, assemble:
- **introduction**: Combined situation and introduction sections
- **challenges**: Array of challenge objects with:
  - number, title, content, word_count
  - behaviors_assessed (with evidence_moments)
  - metrics highlighted

### 3. Structure Assessment Questions
From bias_checked_content.questions:
- Include all question fields
- Add response_guidance (what strong response demonstrates)
- Add evaluation_criteria (dimensions for judging)

### 4. Include Assessor Guidance
At root level:
- **overall**: The holistic guidance (~100-150 words)
- **for_questions**: Array of per-question guidance

### 5. Compile Quality Summary
Calculate and include:
- **overall_rating**: Lowest score across all criteria (conservative)
- **average_rating**: Mean of all quality scores
- **total_checks_passed**: Count of criteria with score >= 8
- **total_checks_conducted**: Total number of criteria (16)
- **passed_quality_check**: Boolean (all scores >= 8)
- **passed_bias_check**: Boolean (no HIGH severity issues)
- **total_behaviors_covered**: Count from behavior mapping
- **unique_behaviors**: Same as total (should match)
- **behaviors_list**: List of all behavior names
- **quality_issues**: Array of any issues found and their status
- **bias_issues**: Array of any bias issues and their status
- **behavior_coverage_analysis**: Distribution by challenge
- **recommendations_for_deployment**: Based on scores and issues

### 6. Include Complete case_study_context
Include the full case_study_context from Node 2 as-is, with all case_design_constraints.

### 7. Final Validation
Before output, verify:
□ All required fields present
□ No null values in required fields
□ Word counts accurate
□ Behavior counts match
□ IDs correctly passed through

## OUTPUT REQUIREMENTS
Produce the complete final JSON matching the specified schema exactly.
```

### Output Schema
```json
{
  "case_study_metadata": {
    "title": "string",
    "created_at": "ISO timestamp",
    "version": "1.0",
    "case_length": "short | medium | long"
  },
  
  "case_study_context": {
    "workflow_session_id": "string",
    "workflow_id": "string",
    "project_id": "string",
    "client_id": "string",
    "case_design_constraints": {
      "client_use_case": "string (omit if not determined)",
      "business_function": "string (omit if not determined)",
      "decision_complexity_level": "low | moderate | high | very_high",
      "language_difficulty": "simple | professional | technical | executive",
      "case_length_preference": "short | medium | long",
      "scenario_styles": ["string"],
      "tone": {
        "formality": "string",
        "urgency": "string",
        "stakes": "string"
      },
      "number_of_challenges": "number",
      "ambiguity_level": "low | moderate | high | very_high",
      "stakeholder_complexity": "low | moderate | high | very_high",
      "ethical_considerations": "boolean (omit if not applicable)",
      "number_of_questions": "number",
      "client_name": "string",
      "industry": "string",
      "target_level": "Low | Mid | High | Exceptional",
      "designation": "string (omit if not determined)",
      "departments": ["string"] ,
      "user_instruction": "string (omit if blank)",
      "behaviors": {
        "total_count": "number",
        "all_behaviors": [
          {"name": "string", "definition": "string"}
        ]
      },
      "mandatory_inclusions": {
        "metrics_data": true,
        "cause_effect": true,
        "human_implications": true,
        "business_implications": true,
        "performance_metrics": true,
        "qualitative_data": true
      },
      "behavior_distribution": {
        "challenge_1": {
          "behaviors": [{"name": "string", "definition": "string"}]
        },
        "challenge_2": {
          "behaviors": [{"name": "string", "definition": "string"}]
        },
        "challenge_3": {
          "behaviors": [{"name": "string", "definition": "string"}]
        }
      }
    }
  },
  
  "case_study_content": {
    "introduction": "string",
    "challenges": [
      {
        "number": "number",
        "title": "string",
        "content": "string",
        "word_count": "number",
        "behaviors_assessed": [
          {
            "name": "string",
            "evidence_moments": ["string"]
          }
        ],
        "metrics": ["string"]
      }
    ]
  },
  
  "assessment_questions": [
    {
      "question_number": "number",
      "question_text": "string",
      "linked_challenge": "number",
      "behaviors_tested": ["string"],
      "response_guidance": "string",
      "evaluation_criteria": ["string"]
    }
  ],
  
  "assessor_guidance": {
    "overall": "string (~100-150 words)",
    "for_questions": [
      {
        "question_number": "number",
        "guidance": "string (~100-150 words)"
      }
    ]
  },
  
  "quality_summary": {
    "overall_rating": "number (lowest score)",
    "average_rating": "number (mean score)",
    "total_checks_passed": "number",
    "total_checks_conducted": 16,
    "passed_quality_check": "boolean",
    "passed_bias_check": "boolean",
    "total_behaviors_covered": "number",
    "unique_behaviors": "number",
    "behaviors_list": ["string"],
    "quality_issues": [
      {"criterion": "string", "issue": "string", "status": "fixed | noted"}
    ],
    "bias_issues": [
      {"category": "string", "severity": "string", "status": "fixed | noted"}
    ],
    "behavior_coverage_analysis": {
      "coverage_percentage": "100%",
      "distribution": {
        "challenge_1": ["behavior names"],
        "challenge_2": ["behavior names"],
        "challenge_3": ["behavior names"]
      }
    },
    "recommendations_for_deployment": ["string"]
  }
}
```

---

## Quick Reference: Node Flow Summary

| Node | Receives From | Sends To | Core Output |
|------|---------------|----------|-------------|
| **2** | User Input | 3, 4, 5, 6, 7, 10 | `case_study_context` with `case_design_constraints` |
| **3** | 2, Reference URL | 4, 6 | `parsed_reference_case` with style markers |
| **4** | 2, 3 | 5, 6 | `industry_adapted_case` |
| **5** | 2, 4 | 6 | `behavior_mapping_validation` + `challenge_outlines` |
| **6** | 2, 3, 4, 5 | 7, 8 | `final_challenges` + sections |
| **7** | 2, 6 | 8, 10 | `assessment_questions` + `assessor_guidance` |
| **8** | 2, 6, 7 | 9 | `quality_assured_content` + `quality_scores` |
| **9** | 8 | 10 | `bias_checked_content` + `bias_check_results` |
| **10** | 2, 5, 7, 8, 9 | UI | **Final JSON Output** |

---

## Consultant Prompt Coverage Verification

| Requirement | Covered In | Status |
|-------------|------------|--------|
| Structure: Situation → Introduction → Challenges | Node 3, 6 | ✅ |
| Industry + Company + Designation context | Node 2, 4 | ✅ |
| Flexible behaviors per challenge (2-4) | Node 2, 5 | ✅ |
| 100% behavior coverage mandatory | Node 5, 8 | ✅ |
| Challenge: ~150-200 words each | Node 6, 8 | ✅ |
| Challenge: Show behaviors through consequences | Node 5, 6 | ✅ |
| Challenge: Quantifiable impacts | Node 6 (mandatory) | ✅ |
| Challenge: Human elements | Node 6 (mandatory) | ✅ |
| Challenge: Business implications | Node 6 (mandatory) | ✅ |
| Challenge: Cause-effect relationships | Node 6 (mandatory) | ✅ |
| Outline/synopsis BEFORE full case | Node 5 | ✅ |
| Storyline showing behavior stitching | Node 5 | ✅ |
| Questions: Subjective, open-ended | Node 7 | ✅ |
| Questions: No behavior names | Node 7, 8 | ✅ |
| Questions: Reference specific case elements | Node 7, 8 | ✅ |
| Questions: Allow multiple solutions | Node 7, 8 | ✅ |
| Review: Flow, Transition, Style, Balance | Node 8 | ✅ |
| "Gives away answer" prevention | Node 6, 8 | ✅ |
| Assessor guidance (overall + per question) | Node 7, 10 | ✅ |
| Common pitfalls in guidance | Node 7 | ✅ |
| user_instruction passed to all nodes | All nodes | ✅ |
| Optional fields omitted if not confident | All nodes | ✅ |
| All IDs passed through | Node 2, 10 | ✅ |
| Bias screening | Node 9 | ✅ |
| 4 difficulty levels (Low/Mid/High/Exceptional) | Node 2 | ✅ |
| Rating scale 1-5 for assessors | Node 7 | ✅ |

---

## Key Quality Gates

| Gate | Location | Criterion |
|------|----------|-----------|
| 100% Behavior Coverage | Node 5, 8 | All behaviors mapped, no duplicates |
| Word Count | Node 6, 8 | Each challenge 150-200 words |
| No Behavior Names | Node 6, 7, 8 | Zero behavior names in challenges or questions |
| "Gives Away Answer" | Node 6, 8 | Challenges show consequences, not failure lists |
| Mandatory Elements | Node 6, 8 | Metrics, cause-effect, human, business in each challenge |
| Case Specificity | Node 7, 8 | Questions reference specific case elements |
| Quality Threshold | Node 8 | All criteria score >= 8 |
| Bias Check | Node 9 | No HIGH severity issues |
