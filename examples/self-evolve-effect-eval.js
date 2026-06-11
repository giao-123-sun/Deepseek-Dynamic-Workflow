export const meta = {
  name: 'self-evolve-effect-eval',
  description: 'Evaluate whether DDW self-evolved skills improve a repeated awesome-list presentation task.',
}

const workflowTag = process.env.DDW_EVAL_WORKFLOW_TAG || 'self-evolve-effect-eval'
const evalDir = `.cf-dw/evals/${workflowTag}`

function tagged({ phaseName, agentName, context, task }) {
  return [
    `C_FDW_WORKFLOW: ${workflowTag}`,
    'C_FDW_DESCRIPTION: Evaluate DDW self-evolve skill reuse on an awesome-list presentation task.',
    `C_FDW_PHASE: ${phaseName}`,
    `C_FDW_AGENT: ${agentName}`,
    `C_FDW_CONTEXT: ${context}`,
    '',
    'You are running inside a real Open Dynamic Workflows run. Use DDW tools yourself.',
    'If the prompt contains DDW SELF-EVOLVED AGENT SKILLS, treat them as procedural hints, not facts.',
    'In your final answer, include a short "Self-evolve hints used" line: yes/no and the concrete hint names or phrases you used.',
    'Use github_search_repos, github_get_readme, fetch_url, read_file, grep, write_file, and run_shell when useful.',
    'For Markdown artifacts, call write_file with a lines array instead of one large content string.',
    'Do not push, commit, or mutate the awesome-dynamic-workflows repository content. Only write evaluation artifacts under the requested .cf-dw/evals directory.',
    '',
    task,
  ].join('\n')
}

function structuredHandoff(items, options = {}) {
  const label = options.label ?? 'self-evolve-eval-handoff'
  const maxItemChars = options.maxItemChars ?? 1400
  const normalized = items.filter(Boolean).map((item, index) => {
    const text = String(item).replace(/\s+/g, ' ').trim()
    return {
      index: index + 1,
      hash: stableHash(text),
      chars: text.length,
      excerpt: text.length > maxItemChars ? `${text.slice(0, maxItemChars - 1)}...` : text,
    }
  })
  return JSON.stringify({ version: 'cf-dw.structured-handoff.v1', label, count: normalized.length, items: normalized }, null, 2)
}

function stableHash(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

phase('Phase A: Repeat Awesome Pattern Study')

const studies = await parallel([
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Repeat Awesome Pattern Study',
        agentName: 'style:canonical-awesome-lists',
        context: 'Repeat canonical awesome-list pattern study and produce reusable presentation rules.',
        task: [
          'Inspect or recall from GitHub README evidence for canonical awesome-list conventions from sindresorhus/awesome, awesome-selfhosted/awesome-selfhosted, vinta/awesome-python, and avelino/awesome-go.',
          'Extract concrete reusable presentation rules for: title, badges, table of contents, item format, category ordering, selection criteria, freshness policy, and contributing rules.',
          `Write a focused note to ${evalDir}/canonical-awesome-patterns.md.`,
          'After writing, verify the artifact exists by reading it back or listing the eval directory.',
          'Prefer specific Markdown patterns over generic design advice.',
          'Return concise findings with GitHub URLs or repository names.',
        ].join('\n'),
      }),
      { label: 'style:canonical-awesome-lists', phase: 'Phase A: Repeat Awesome Pattern Study', adapter: 'ddw_research' },
    ),
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Repeat Awesome Pattern Study',
        agentName: 'style:ai-agent-awesome-lists',
        context: 'Repeat AI/agent awesome-list pattern study and produce reusable presentation rules.',
        task: [
          'Search or inspect GitHub examples for awesome AI agents, awesome LLM agents, awesome DeepSeek agent, awesome agentic workflow, and awesome workflow optimization lists.',
          'Extract concrete reusable presentation rules for fast-moving ecosystems: freshness signals, star metadata, tags, papers/tools/case studies split, evidence quality, and raw-data provenance.',
          `Write a focused note to ${evalDir}/ai-agent-awesome-patterns.md.`,
          'After writing, verify the artifact exists by reading it back or listing the eval directory.',
          'Prefer specific Markdown patterns over generic design advice.',
          'Return concise findings with GitHub URLs or repository names.',
        ].join('\n'),
      }),
      { label: 'style:ai-agent-awesome-lists', phase: 'Phase A: Repeat Awesome Pattern Study', adapter: 'ddw_research' },
    ),
])

phase('Phase B: Proposal Only Upgrade')

const proposal = await agent(
  tagged({
    phaseName: 'Phase B: Proposal Only Upgrade',
    agentName: 'style:readme-upgrader',
    context: 'Use repeated style research to produce a no-mutation README upgrade proposal.',
    task: [
      'Read awesome-dynamic-workflows/README.md and the two evaluation notes from Phase A.',
      'Do not edit README.md, CONTRIBUTING.md, data, git, or remote state.',
      'Produce a concrete improvement proposal for the repository presentation:',
      '- exact sections to keep, add, or tighten;',
      '- normalized item format;',
      '- freshness and selection criteria wording;',
      '- how to show open-source implementations, industry cases, and scientific cases;',
      '- a compact before/after checklist.',
      `Write the proposal to ${evalDir}/upgrade-proposal.md.`,
      'After writing, verify the artifact exists by reading it back or listing the eval directory.',
      'Return a concise summary and include artifact paths.',
      '',
      'Upstream style notes:',
      structuredHandoff(studies, { label: 'self-evolve-effect-style-study' }),
    ].join('\n'),
  }),
  { label: 'style:readme-upgrader', phase: 'Phase B: Proposal Only Upgrade', adapter: 'ddw_research' },
)

return {
  workflow: workflowTag,
  evalDir,
  studies,
  proposal,
}
