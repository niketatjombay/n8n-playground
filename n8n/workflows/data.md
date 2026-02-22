# Claude Code in Our Development Team
### How We Build Smarter — Without Losing Our Engineering Brain

**Duration:** 60 Minutes | **Audience:** Mixed (Technical + Non-Technical)

---

---

## SECTION 1: WHAT IS CLAUDE CODE

---

### Slide 1 — What is Claude Code?

**An agentic coding tool that lives in your terminal.**

Claude Code is a command-line tool built by Anthropic that goes far beyond code autocomplete. Unlike tools that suggest the next line, Claude Code understands your entire codebase, reasons about architecture, and executes multi-step development tasks autonomously.

**How it works:**
- You open your terminal, point it at your project, and give it instructions in plain English
- It reads your files, understands the structure, and proposes or executes changes
- It can create files, edit existing code, run commands, and debug errors — all in context

**Key difference from other AI tools:**

| Tool | What It Does | How It Works |
|------|-------------|--------------|
| GitHub Copilot | Line-by-line autocomplete | Works inside your editor, suggests next lines |
| ChatGPT / Claude Chat | Answer questions, generate snippets | Copy-paste workflow, no project context |
| Cursor | AI-powered editor | Editor with built-in AI, file-level context |
| **Claude Code** | **Agentic development partner** | **Terminal-based, reads full codebase, executes multi-step tasks** |

**Think of it this way:**
Copilot is like spell-check for code. Claude Code is like having a junior developer sitting next to you who has read every file in your project.

---

### Slide 2 — Our Setup: Claude Code + Figma + n8n

**We have not just adopted Claude Code — we have connected it into our workflow.**

**The Integration:**

- **Figma → Claude Code:** Designers create UI in Figma. We feed the designs to Claude Code to generate initial Flutter components. This bridges the design-to-code gap and reduces UI implementation time significantly.

- **n8n + Claude Code:** We use Claude Code to generate, debug, and optimize our n8n automation workflows. Complex data transformations, API integrations, and dashboard generation flows are built faster with AI assistance.

**What this means for the team:**
- Designers and developers share a tighter feedback loop
- Automation workflows that used to take days are prototyped in hours
- The AI handles the repetitive translation work (design → code, logic → workflow) while developers focus on architecture and business logic

**Important note:** These integrations amplify productivity — but they also amplify mistakes if we are not careful. That is why our process matters (more on that later).

---

---

## SECTION 2: HOW WE USE CLAUDE CODE

---

### Slide 3 — Our 6 Use Cases (Part 1)

**We use Claude Code across the entire development lifecycle — not just for writing code.**

---

**1. Architecture & System Design**

We feed project requirements, constraints, and tech stack details to Claude Code and ask it to propose system architecture. It helps us think through database schemas, API structures, service boundaries, and data flow before writing a single line of code.

*Example: When designing a new assessment module, we described the requirements in plain English and Claude Code proposed the folder structure, API endpoints, database models, and integration points — giving us a starting blueprint to refine.*

---

**2. Feature Development**

This is the most common use case. Developers describe a feature, and Claude Code writes the implementation — models, controllers, views, API calls — while staying aware of the existing codebase conventions.

*Example: Adding a new report generation feature — Claude Code read our existing report modules, followed the same patterns, and generated the new feature with consistent code style.*

---

**3. Creating n8n Automation Flows**

We use Claude Code to generate n8n workflow JSON configurations, write JavaScript transformation nodes, build HTML email templates, and debug complex multi-step automations.

*Example: Our succession planning dashboard workflow — Claude Code generated the complete n8n flow including API calls, data transformation logic, and the final HTML dashboard output.*

---

### Slide 4 — Our 6 Use Cases (Part 2)

---

**4. Code Standards Analysis**

We point Claude Code at our codebase and ask it to audit against our coding standards. It identifies inconsistencies in naming conventions, file structure violations, missing error handling, and deviations from our established patterns.

*Example: Running a standards check on a newly developed module revealed 15+ inconsistencies in naming patterns and missing null-safety checks that manual review had missed.*

---

**5. Security Issue Detection**

Claude Code scans our code for common security vulnerabilities — hardcoded credentials, SQL injection risks, insecure API endpoints, missing authentication checks, improper data validation, and sensitive data exposure.

*Example: During a recent security audit, Claude Code flagged SSL pinning gaps, exposed API keys in configuration files, and insecure data storage patterns in our mobile application.*

---

**6. Automated Testing with Playwright (MVP Stage)**

We have started using Claude Code to generate end-to-end test scripts using Microsoft Playwright. Given a user flow description, it writes the complete test — navigation, interactions, assertions, and edge cases.

*Current status: MVP / proof of concept. We have validated the approach but have not yet rolled this out for our production applications. Early results are promising — test scripts that would take a developer hours are generated in minutes.*

---

---

## SECTION 3: THE HARD TRUTH — PROBLEMS WE HAVE SEEN

---

### Slide 5 — What Went Wrong (Developer Behavior)

**AI is a powerful tool. But power without discipline creates new problems.**

Here is what we observed in our team — honestly:

---

**Problem 1: Developers Stopped Using Their Brain**

The most dangerous shift we saw. Developers started going directly to Claude Code for every problem — skipping the thinking step entirely. Instead of understanding the problem, reasoning about solutions, and then using AI to accelerate execution, they became prompt-writers instead of engineers.

*The risk: If AI goes down tomorrow, can your developer still solve the problem? If the answer is no, you have a dependency problem, not a productivity gain.*

---

**Problem 2: Blind Trust in AI Output**

Developers started treating Claude Code output as "correct by default." Code was merged without proper reading, without understanding the logic, and without questioning the approach. The assumption became: "AI wrote it, so it must be right."

*The reality: AI generates plausible code, not necessarily correct code. It can produce logic that passes a quick glance but fails under edge cases, load, or real-world data.*

---

**Problem 3: Loss of Learning**

Junior developers are the most affected. When AI writes all your code, you skip the struggle that builds understanding. You never learn why a pattern exists, how an algorithm works, or what trade-offs a design decision carries. You become an operator, not an engineer.

*The long-term cost: A team that cannot function without AI is a fragile team.*

---

### Slide 6 — What Went Wrong (Code Quality)

**The code itself told us something was off.**

---

**Problem 4: Over-Engineering by Default**

Claude Code generates comprehensive, feature-rich code — even when you ask for something simple. A basic CRUD endpoint comes back with pagination, filtering, sorting, caching, rate limiting, and error handling for scenarios that do not exist yet. The code works, but it is 3x more complex than what the current requirement demands.

*The impact: More code means more bugs, more maintenance, more testing, and more cognitive load for the next developer who reads it.*

---

**Problem 5: Unwanted Scope Creep in Code**

Related to over-engineering but subtler. Claude Code anticipates what you *might* need next and builds it proactively. It adds helper functions, utility classes, configuration options, and abstraction layers for features that are not in the current sprint — or even on the roadmap.

*The impact: Your codebase grows faster than your product. You are maintaining code for features that may never ship.*

---

**Problem 6: Hallucination & Context Drift**

On larger codebases, Claude Code sometimes loses track of context. It may reference non-existent functions, use outdated API patterns, import packages that do not exist, or generate code that contradicts patterns established elsewhere in the project. The code looks correct at first glance but breaks on execution.

*The impact: Debugging AI-generated code that "looks right" is harder than debugging code you wrote yourself, because you do not have the mental model of why it was written that way.*

---

**Problem 7: The False Sense of Speed**

"I built that feature in 10 minutes!" — followed by 2 hours of debugging, refactoring, and fixing edge cases that the AI missed. The perceived speed gain disappears when you account for the full cycle: generation + review + correction + testing.

*The honest truth: AI makes the first 80% faster. The last 20% — the part that actually matters — still requires a thinking developer.*

---

---

## SECTION 4: OUR SOLUTION — THE 6-STEP MANDATORY PROCESS

---

### Slide 7 — The Framework: Think First, AI Second

**We do not ban AI. We put a process around it.**

Every developer on our team now follows a mandatory 6-step workflow for AI-assisted development. The core principle is simple:

> **"You are the engineer. AI is the tool. The process ensures it stays that way."**

**The 6 Steps at a Glance:**

```
Step 1 → DEFINE the problem clearly
Step 2 → DESIGN your solution first (no AI yet)
Step 3 → PLAN with AI (ask for execution plan, do not execute)
Step 4 → VALIDATE the plan (check for scope creep, security, correctness)
Step 5 → HYGIENE check (code quality, performance, testing strategy)
Step 6 → EXECUTE with AI (in chunks, with verification at each step)
```

**Why 6 steps?**
Because every problem we saw — blind trust, over-engineering, scope creep, loss of learning — traces back to skipping one of these steps. The process is not bureaucracy. It is engineering discipline applied to a new tool.

**The non-negotiable rule:**
AI does not touch code until Step 6. Steps 1 through 5 are human thinking. This is what separates an engineer using AI from a human typing prompts.

---

### Slide 8 — Steps 1 to 3: The Thinking Phase

**Before AI writes a single line of code, the developer must do three things.**

---

**Step 1: DEFINE THE PROBLEM WELL**

Write a clear problem statement before opening Claude Code. Include:
- What exactly needs to be built or fixed
- What are the success criteria (how do we know it is done)
- What are the constraints (tech stack, performance, timeline, dependencies)
- What is explicitly OUT of scope

*Why this matters: A vague prompt produces vague code. A precise problem statement produces precise solutions. The quality of AI output is directly proportional to the quality of your input.*

---

**Step 2: DEVELOPER COMES UP WITH A SOLUTION FIRST**

Before asking AI anything, the developer must sketch their own approach:
- What is the high-level architecture?
- Which files and modules are affected?
- What is the data flow?
- What are the potential risks or edge cases?

This can be rough — a whiteboard sketch, bullet points in a doc, or pseudocode. The point is not perfection. The point is that the developer has thought about the problem independently.

*Why this matters: If you cannot describe your approach before using AI, you will not be able to evaluate whether AI's approach is correct. You need your own mental model to serve as a reference point.*

---

**Step 3: USE PLAN MODE — DO NOT EXECUTE YET**

Now bring in Claude Code — but only in plan mode. Present your solution and ask:
- "Here is my approach. Give me a detailed execution plan."
- "What files will you modify? What functions will you create?"
- "Walk me through the implementation step by step."

Read the plan. Compare it to your own solution from Step 2. Note where AI agrees and where it differs.

*Why this matters: This is where you catch over-engineering, scope creep, and wrong assumptions BEFORE they become code. It is 10x easier to fix a plan than to fix 500 lines of generated code.*

---

### Slide 9 — Steps 4 to 6: The Validation & Execution Phase

**You have a plan. Now pressure-test it before execution.**

---

**Step 4: VALIDATE THE PLAN**

Go through the AI-generated plan with these questions:

- Does it solve ONLY the defined problem from Step 1? Nothing more.
- Is there any scope creep — features, utilities, abstractions nobody asked for?
- Are there security concerns — exposed endpoints, missing auth, data leaks?
- Does it follow our existing code patterns and conventions?
- Is the complexity proportional to the problem? (Simple problem = simple solution)

If the answer to any of these is wrong, go back to Step 3 and refine the plan. Do not proceed with a flawed plan.

*The rule: If you cannot explain why every file and function in the plan exists, the plan is not ready.*

---

**Step 5: HYGIENE CHECK**

Before execution, define your quality gates:

- **Code quality:** Does the plan follow our naming conventions, file structure, and patterns?
- **Performance:** Are there any obvious bottlenecks — unnecessary loops, redundant API calls, missing caching where needed?
- **Security:** Authentication, authorization, input validation, data sanitization — all accounted for?
- **Testing strategy:** What tests will verify this works? Unit tests? Integration tests? What edge cases must be covered?

Document these expectations. They become your checklist during and after execution.

*Why this matters: These are the things developers skip when they are excited about AI speed. This step forces discipline.*

---

**Step 6: ASK AI TO EXECUTE — WITH SUPERVISION**

Now — and only now — tell Claude Code to execute. But not all at once:

- **Execute in chunks:** Break the plan into logical pieces. Execute one piece at a time.
- **Verify each chunk:** After each piece, read the generated code. Does it match the plan? Does it follow your hygiene checklist?
- **Do not auto-approve:** Review every file change. Question anything that was not in the plan.
- **Test as you go:** Run the code after each chunk. Do not wait until everything is generated to find out it does not work.

*The mindset: You are a tech lead reviewing a junior developer's pull request — not a spectator watching AI work. Stay engaged. Stay critical. Stay in control.*

---

---

## SECTION 5: CLOSING

---

### Slide 10 — Key Takeaways & Q/A

**What to remember from this session:**

---

**Claude Code is powerful.** It accelerates architecture, feature development, automation, security scanning, and testing across our entire workflow.

**But power without process is dangerous.** We saw developers stop thinking, trust blindly, and ship over-engineered, under-validated code.

**Our 6-step process is the fix:**

| Step | Action | Owner |
|------|--------|-------|
| 1 | Define the problem | Developer |
| 2 | Design your solution | Developer |
| 3 | Get AI's execution plan | Developer + AI |
| 4 | Validate the plan | Developer |
| 5 | Run hygiene checks | Developer |
| 6 | Execute with supervision | Developer + AI |

Notice the pattern: **4 out of 6 steps are pure human thinking.** AI only participates in Steps 3 and 6.

---

**The one thing to take away:**

> **AI makes good developers faster. It makes undisciplined developers dangerous. The process is what decides which one you become.**

---

**Questions? Thoughts? Disagreements?**

*Think about: What is the biggest risk you see in your own work with AI? Where have you caught yourself skipping a step?*

---

*Thank You*

---