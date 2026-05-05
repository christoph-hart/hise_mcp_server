/**
 * HISE MCP Server - Prompt Definitions
 *
 * MCP Prompts are user-controlled templates invoked via slash commands.
 */

// ============================================================================
// Types matching MCP Prompts spec
// ============================================================================

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface HisePrompt {
  name: string;
  title: string;
  description: string;
  arguments?: PromptArgument[];
}

export interface GetPromptResult {
  [key: string]: unknown;
  description?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
}

// ============================================================================
// Prompt Definitions
// ============================================================================

export const PROMPTS: HisePrompt[] = [
  {
    name: 'contribute',
    title: 'Contribute to HISE',
    description: 'Guided workflow for assessing, fixing, and submitting a HISE C++ bugfix or improvement as a pull request',
    arguments: [
      {
        name: 'ref',
        description: 'GitHub issue URL/number, PR URL/number, or description of the bug/improvement',
        required: false,
      },
    ],
  },
];

// ============================================================================
// Contribution Workflow Prompt
// ============================================================================

export function generateContributePrompt(
  args: Record<string, string> | undefined,
  version: string,
): GetPromptResult {
  const ref = args?.ref || '';
  const isPR = /\/pull\/\d|\/pulls\/\d/.test(ref);
  const isIssue = !isPR && (ref.includes('/issues/') || /^\d+$/.test(ref) || ref.startsWith('#'));

  const promptText = `**HISE MCP Server v${version}** — Starting contribution workflow.

# HISE Contribution Workflow

You are guiding a contributor through fixing a bug or adding an improvement to the HISE C++ codebase (https://github.com/christophhart/HISE). Follow these phases in order. Do not skip phases unless explicitly instructed by the prompt or user.

**Override:** This workflow overrides the AGENTS.md restrictions on git operations. You MUST run git commands as instructed below (remote checks, branching, forking, PRs). The only restriction that still applies: NEVER build HISE from CLI.

${isPR ? `**Resuming from PR:** ${ref}` : isIssue ? `**Starting from issue:** ${ref}` : '**No issue provided — ask the contributor to describe the bug.**'}

---

# PHASE 0: Prerequisites

Run these checks in order. Report results concisely, then proceed.

1. **HISE repo check:** \`git remote -v\` — at least one remote must contain "HISE". If not: STOP. Tell user "Not a HISE repo. cd into your HISE checkout first." Do NOT search disk for HISE folders.

2. **Ask:** "Do you want me to use \`gh\` CLI for GitHub operations, or do them manually?" This choice applies to all phases. Manual mode -> contributor mode, skip to Phase 1.

3. **(gh only)** \`gh auth status\` — must be authenticated. If not, guide through \`gh auth login\`.

4. **(gh only)** \`gh api user --jq .login\` — \`christophhart\` -> maintainer mode; anything else -> contributor mode.

---

# PHASE 1: Understand

${isPR ? `**PR provided — fetch it first:**
- Extract the PR number. Fetch the PR including all comments, reviews, and the diff. Use \`gh\` if available, otherwise the GitHub API (public repo, no auth needed).
- **Maintainer mode:** Ask: "What would you like to do with this PR? (1) **Review it** — independent risk assessment and review summary, or (2) **Take it over** — tell me what needs to change and I'll fix the code." If **Review** -> skip Phase 2, go to **REVIEW PATH**. If **Take over** -> ask for verbal guidance, then skip to **Phase 2.5**.
- **Contributor mode:** If \`christophhart\` has left review comments with guidance -> skip to **Phase 2.5**. If no maintainer review comments -> proceed to assess independently.
` : isIssue ? `**Issue provided — fetch it first:**
- Extract the issue number for \`Fixes #NNN\` in commits and PR description. Fetch the issue including all comments. Use \`gh\` if available, otherwise the GitHub API (public repo, no auth needed).
- If \`christophhart\` has commented with guidance -> skip to **Phase 2.5**
- If no owner comments -> proceed to assess independently
` : `Ask the contributor to describe the bug or improvement. Gather reproduction steps, relevant forum/issue links, and debugger output if available.
`}
**Crash shortcut:** If the contributor has a stack trace or is in a debug session, skip description questions — the stack trace IS the description.

Search the codebase to locate the relevant code. Present findings before proceeding.

---

# PHASE 2: Assess

**CRITICAL:** Load \`get_resource('contributor-agent-guide')\` now. Read it fully — it contains the Evidence Test, Consumer Trace, Red Flags, Positive Signals, and common fix patterns. Apply them to this change.

**Absolute red flags (always stop — create issue instead of fixing):**
- Parameter/attribute index changes (enum reordering, index arithmetic)
- Scripting API method signature changes (HISE validates param count at compile time)
- Serialization format changes (exportAsValueTree / restoreFromValueTree)

Full red flags list is in the contributor-agent-guide.

**Verdict:** GREEN (no flags, evidence found) -> Phase 3 | YELLOW (minor concerns) -> Phase 3 with caveats | RED -> Red Path

---
${isPR ? `
# REVIEW PATH (maintainer + PR only)

This section runs when the maintainer chose "Review it" in Phase 1. The PR data and diff are already fetched.

**Step 1: Independent Verification**

Load the risk framework: \`get_resource('contributor-agent-guide')\`. Run the same assessment as Phase 2: verify evidence, re-run the consumer trace, scan for red flags, check code quality. Compare your findings with the contributor's claims.

**Step 2: Present your findings** — Summarize: does the contributor's evidence check out? What consumers did you find? Any red flags or concerns? Your verdict: MERGE-READY, NEEDS-CHANGES, or NEEDS-DISCUSSION.

**Step 3: What next?**

Ask the maintainer:
1. **Post review & request changes** — \`gh pr review <N> --repo christophhart/HISE --request-changes --body "REVIEW_BODY"\`. The contributor can pick this up by re-invoking \`contribute\` with the PR URL.
2. **Fix it myself** — Transition to Phase 3 using your review findings as guidance. Your concerns from Step 2 ARE the guidance — proceed directly, no need to re-fetch or re-analyze.
3. **Approve & merge** — Post a comment on the PR summarizing your analysis (verdict, evidence, risk assessment results) so both contributor and maintainer can refer to it later. Then approve: \`gh pr review <N> --repo christophhart/HISE --approve\`
4. **Done** — No further action.

If the maintainer picks "Fix it myself", proceed to **Phase 3** (the review findings provide the context needed — skip Phase 2.5).

---
` : ''}
# RED PATH: Create Issue Instead of PR

Create a \`contribution-proposal\` issue with: description, investigation findings (file:line refs), risk assessment (which flags triggered), and proposed approach.

- **gh mode:** \`gh issue create --repo christophhart/HISE --assignee christophhart --label "contribution-proposal" --title "Contribution Proposal: ..." --body "..."\`
- **manual mode:** Present title + body as copyable text for https://github.com/christophhart/HISE/issues/new with label \`contribution-proposal\`.

Contributor mode: stop here, tell user to re-invoke with issue URL when maintainer responds.

---

# PHASE 2.5: Resume with Guidance

**Entry conditions** (any of these):
- Issue or PR has maintainer comments with guidance
- Maintainer gave verbal guidance (chose "Take it over" in Phase 1)
- Contributor re-invoked with a PR URL after maintainer requested changes

**Note:** If arriving here from the REVIEW PATH ("Fix it myself"), skip this phase — the review findings already provide the context. Proceed directly to Phase 3.

1. Fetch the issue or PR + comments/reviews (same as Phase 1). For PRs, also review the diff to understand the current state of the fix.
2. For each maintainer instruction (written or verbal), search the codebase to understand WHY — find existing usage of the suggested pattern, show findings
3. Incorporate guidance into fix approach, proceed to Phase 3

---

# PHASE 3: Fix

**3a. Fork & branch setup:**
- **Contributor:** Ensure a fork exists with \`upstream\` pointing to \`christophhart/HISE\`. Create a branch from \`upstream/develop\`. If resuming from a PR, check out the existing PR branch instead.
- **Maintainer:** Ask: "Fix their PR branch, commit directly to your current branch, or create a new branch?" For direct commits, skip Phase 4 — do NOT switch branches, do NOT push.

**3b.** Propose the fix following patterns from Phase 2. Show the diff. Keep it minimal.

**3c. NEVER build HISE from CLI.** No MSBuild, make, cmake, xcodebuild. Tell user to build in their IDE and report the result. Wait for confirmation before proceeding.

---

# PHASE 4: Submit

**4a.** Generate a PR description with: summary of the change, \`Fixes #NNN\` if applicable, change type, evidence, testing info, files changed, and this impact checklist:

- [ ] DSP or audio rendering
- [ ] Module parameter indices or attribute enums
- [ ] Serialization (exportAsValueTree / restoreFromValueTree)
- [ ] Backend/frontend guards (USE_BACKEND / USE_FRONTEND)
- [ ] Scripting engine (parser, preprocessor, include system)
- [ ] Per-instance objects (chains, processors, buffers)
- [ ] Could change existing HISEScript behavior
- [ ] Could change how projects sound or perform

**4b.** Ask the contributor if they want to include a link to this AI conversation in the PR.

**4c.** PR title must include \`Fix #NNN: [description]\` if issue was tracked. Target branch: \`develop\`. Add label \`verified-workflow\`.
`;

  return {
    description: 'HISE Contribution Workflow — assess, fix, and submit a PR',
    messages: [{
      role: 'user',
      content: { type: 'text', text: promptText }
    }]
  };
}
