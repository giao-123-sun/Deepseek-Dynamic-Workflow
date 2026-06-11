export const meta = {
  name: 'awesome-dynamic-workflows-style-study',
  description: 'Study strong GitHub awesome lists and improve awesome-dynamic-workflows presentation.',
}

const workflowTag = 'awesome-dynamic-workflows-style-study'

function tagged({ phaseName, agentName, context, task }) {
  return [
    `C_FDW_WORKFLOW: ${workflowTag}`,
    'C_FDW_DESCRIPTION: Study GitHub awesome-list presentation patterns and improve awesome-dynamic-workflows.',
    `C_FDW_PHASE: ${phaseName}`,
    `C_FDW_AGENT: ${agentName}`,
    `C_FDW_CONTEXT: ${context}`,
    '',
    'You are running inside a real Open Dynamic Workflows run. Use DDW tools yourself.',
    'Use github_search_repos, github_get_readme, fetch_url, read_file, grep, write_file, and run_shell when needed.',
    'Focus on GitHub awesome project presentation, not generic web design.',
    '',
    task,
  ].join('\n')
}

function structuredHandoff(items, options = {}) {
  const label = options.label ?? 'style-handoff'
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

phase('Phase A: Awesome Pattern Study')

const studies = await parallel([
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Awesome Pattern Study',
        agentName: 'style:canonical-awesome-lists',
        context: 'Study canonical awesome list structure and contribution norms.',
        task: [
          'Inspect GitHub README patterns from canonical awesome lists such as sindresorhus/awesome, awesome-selfhosted/awesome-selfhosted, vinta/awesome-python, andavelino/awesome-go.',
          'Extract reusable presentation patterns: title, intro, badges, table of contents, category ordering, item formatting, contribution rules, quality thresholds.',
          'Write notes to awesome-dynamic-workflows/research/awesome-style-canonical.md.',
          'Return concise findings with GitHub URLs.',
        ].join('\n'),
      }),
      { label: 'style:canonical-awesome-lists', phase: 'Phase A: Awesome Pattern Study', adapter: 'ddw_research' },
    ),
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Awesome Pattern Study',
        agentName: 'style:ai-agent-awesome-lists',
        context: 'Study AI/agent-specific awesome lists and how they present fast-changing ecosystems.',
        task: [
          'Search GitHub for awesome AI agents, awesome LLM agents, awesome DeepSeek agent, awesome agentic workflow, and awesome workflow optimization lists.',
          'Inspect the strongest README examples. Extract patterns for handling fast-moving repos: freshness notes, stars, tags, evidence quality, sections for papers/tools/case studies.',
          'Write notes to awesome-dynamic-workflows/research/awesome-style-ai-agents.md.',
          'Return concise findings with GitHub URLs.',
        ].join('\n'),
      }),
      { label: 'style:ai-agent-awesome-lists', phase: 'Phase A: Awesome Pattern Study', adapter: 'ddw_research' },
    ),
])

phase('Phase B: Repository Presentation Upgrade')

const upgrade = await agent(
  tagged({
    phaseName: 'Phase B: Repository Presentation Upgrade',
    agentName: 'style:readme-upgrader',
    context: 'Apply learned awesome-list presentation patterns to the generated repository.',
    task: [
      'Read awesome-dynamic-workflows/README.md, CONTRIBUTING.md, data/projects.json, and the new style research notes.',
      'Improve the repository presentation while preserving factual content:',
      '- Add a compact, polished intro.',
      '- Add a clear Table of Contents.',
      '- Normalize item format.',
      '- Add badges or status notes only if appropriate.',
      '- Add selection criteria and freshness policy if missing or weak.',
      '- Add a "Legend" for stars/license/evidence if useful.',
      '- Keep open-source implementations, industry use cases, and scientific/research use cases easy to scan.',
      '- Keep raw research vs curated data explanation.',
      'Write patches with write_file.',
      'Then commit and push changes in the awesome-dynamic-workflows git repository with message "Improve awesome list presentation".',
      '',
      'Upstream style notes:',
      structuredHandoff(studies, { label: 'awesome-style-study' }),
    ].join('\n'),
  }),
  { label: 'style:readme-upgrader', phase: 'Phase B: Repository Presentation Upgrade', adapter: 'ddw_research' },
)

return {
  workflow: workflowTag,
  studies,
  upgrade,
}
