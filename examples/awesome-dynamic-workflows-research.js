export const meta = {
  name: 'awesome-dynamic-workflows-research',
  description: 'Use DDW agents to research dynamic workflow applications and build an awesome-dynamic-workflows repository.',
}

const workflowTag = 'awesome-dynamic-workflows-research'
const workflowDescription =
  'Find dynamic workflow applications across the web, classify open-source implementations, industry use cases, and research use cases, then build an awesome-dynamic-workflows repository.'

function tagged({ phaseName, agentName, context, task }) {
  return [
    `C_FDW_WORKFLOW: ${workflowTag}`,
    `C_FDW_DESCRIPTION: ${workflowDescription}`,
    `C_FDW_PHASE: ${phaseName}`,
    `C_FDW_AGENT: ${agentName}`,
    `C_FDW_CONTEXT: ${context}`,
    '',
    'You are running inside a real Open Dynamic Workflows run. Do the work yourself with DDW tools.',
    'Use github_search_repos, github_get_readme, web_search, fetch_url, grep/read_file, and write_file when useful.',
    'Cite URLs. Prefer first-party sources, official docs, GitHub repositories, and papers.',
    '',
    task,
  ].join('\n')
}

function structuredHandoff(items, options = {}) {
  const label = options.label ?? 'ddw-handoff'
  const maxItemChars = options.maxItemChars ?? 1200
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

phase('Phase A: Distributed Discovery')

const discovery = await parallel([
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Distributed Discovery',
        agentName: 'research:open-source-implementations',
        context: 'Find open-source dynamic workflow and agent workflow implementations.',
        task: [
          'Search GitHub and the web for open-source projects that implement dynamic workflows, agent workflows, workflow graphs, multi-agent orchestration, or workflow optimization.',
          'Include ODW-style runtimes, graph runtimes, agent frameworks, low-code workflow tools, browser/web automation agents, and workflow optimization repos.',
          'For each strong candidate: name, URL, category, stars if available, license if available, what makes it dynamic, and a one-line reason to include it.',
          'Write your detailed notes to awesome-dynamic-workflows/research/open-source-implementations.md.',
          'Return a concise markdown summary with citations.',
        ].join('\n'),
      }),
      { label: 'research:open-source-implementations', phase: 'Phase A: Distributed Discovery', adapter: 'ddw_research' },
    ),
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Distributed Discovery',
        agentName: 'research:industry-use-cases',
        context: 'Find industry and product use cases for dynamic workflows.',
        task: [
          'Search the web for industry/product use cases of dynamic workflows or agentic workflows.',
          'Look for coding agents, enterprise automation, customer support, document/claims processing, browser automation, data/analytics, DevOps, and robotic/process automation.',
          'Prefer official docs, official blogs, sample repos from vendors, and product documentation.',
          'For each case: organization/product, URL, workflow pattern, why dynamic workflows matter, and evidence quality.',
          'Write your detailed notes to awesome-dynamic-workflows/research/industry-use-cases.md.',
          'Return a concise markdown summary with citations.',
        ].join('\n'),
      }),
      { label: 'research:industry-use-cases', phase: 'Phase A: Distributed Discovery', adapter: 'ddw_research' },
    ),
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Distributed Discovery',
        agentName: 'research:scientific-use-cases',
        context: 'Find scientific and research use cases for dynamic workflows.',
        task: [
          'Search for papers, benchmark repos, and research projects about dynamic workflows, agentic workflow optimization, multi-agent workflow search, scientific workflow agents, and LLM agent orchestration.',
          'Include survey/awesome repos when useful, but prioritize papers or project repos with clear methods.',
          'For each item: title, URL, method family, use case, and why it belongs in an awesome dynamic workflows list.',
          'Write your detailed notes to awesome-dynamic-workflows/research/scientific-use-cases.md.',
          'Return a concise markdown summary with citations.',
        ].join('\n'),
      }),
      { label: 'research:scientific-use-cases', phase: 'Phase A: Distributed Discovery', adapter: 'ddw_research' },
    ),
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Distributed Discovery',
        agentName: 'research:taxonomy',
        context: 'Design a taxonomy for dynamic workflow applications.',
        task: [
          'Independently search for definitions and examples of dynamic workflows, agentic workflows, graph-based agents, workflow optimization, low-code automation, and multi-agent systems.',
          'Create a taxonomy that can organize an awesome list for humans: categories, inclusion rules, quality signals, and anti-patterns.',
          'Write the taxonomy to awesome-dynamic-workflows/research/taxonomy.md.',
          'Return a concise taxonomy summary with citations.',
        ].join('\n'),
      }),
      { label: 'research:taxonomy', phase: 'Phase A: Distributed Discovery', adapter: 'ddw_research' },
    ),
])

phase('Phase B: Synthesis And Repository Build')

const repoPlan = await agent(
  tagged({
    phaseName: 'Phase B: Synthesis And Repository Build',
    agentName: 'synthesis:awesome-repo-builder',
    context: 'Build the initial awesome-dynamic-workflows repository from upstream research.',
    task: [
      'Read the files under awesome-dynamic-workflows/research and synthesize an initial awesome-dynamic-workflows repository.',
      'Create or overwrite these files with write_file:',
      '- awesome-dynamic-workflows/README.md',
      '- awesome-dynamic-workflows/CONTRIBUTING.md',
      '- awesome-dynamic-workflows/LICENSE',
      '- awesome-dynamic-workflows/data/projects.json',
      '- awesome-dynamic-workflows/data/industry-use-cases.md',
      '- awesome-dynamic-workflows/data/research-use-cases.md',
      '- awesome-dynamic-workflows/data/taxonomy.md',
      '',
      'README requirements:',
      '- Title: Awesome Dynamic Workflows',
      '- Short definition of dynamic workflows',
      '- Categories: Open-source implementations, Industry use cases, Scientific/research use cases, Workflow optimization, Tooling/observability, Related awesome lists',
      '- Each item should include a URL and a terse reason to include it.',
      '- Add a "How to contribute" section and a "Selection criteria" section.',
      '',
      'Upstream summaries:',
      structuredHandoff(discovery, { label: 'phase-a-discovery' }),
    ].join('\n'),
  }),
  { label: 'synthesis:awesome-repo-builder', phase: 'Phase B: Synthesis And Repository Build', adapter: 'ddw_research' },
)

const reviewer = await agent(
  tagged({
    phaseName: 'Phase B: Synthesis And Repository Build',
    agentName: 'review:repo-quality-audit',
    context: 'Review the generated awesome-dynamic-workflows repository.',
    task: [
      'Inspect awesome-dynamic-workflows/README.md and data files.',
      'Check whether the repository includes open-source implementations, industry use cases, and scientific/research use cases.',
      'Check for obvious missing links, bad categorization, or uncited claims.',
      'If needed, patch files with write_file.',
      'Return a quality report with exact file paths and remaining gaps.',
      '',
      structuredHandoff([repoPlan], { label: 'repo-builder-output' }),
    ].join('\n'),
  }),
  { label: 'review:repo-quality-audit', phase: 'Phase B: Synthesis And Repository Build', adapter: 'ddw_research' },
)

return {
  workflow: workflowTag,
  discovery,
  repoPlan,
  reviewer,
}
