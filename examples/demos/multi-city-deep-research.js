export const meta = {
  name: 'cf-dw-multi-city-deep-research',
  description: 'Run a multi-city, multi-domain research workflow with ReasoniX agents.',
}

const workflowTag = 'demo-multi-city-deep-research'
const workflowDescription =
  'Multi-City Deep Research: fan out by city/domain, normalize evidence, then synthesize cross-city findings.'

const cells = [
  ['Suzhou', 'public resource transactions'],
  ['Hangzhou', 'business environment optimization'],
  ['Shenzhen', 'special economic zone procurement'],
  ['Chengdu', 'PPP operations'],
  ['Wuhan', 'public utility concessions'],
  ['Nanjing', 'market supervision notices'],
]

function tagged({ phaseName, agentName, context, task }) {
  return [
    `C_FDW_WORKFLOW: ${workflowTag}`,
    `C_FDW_DESCRIPTION: ${workflowDescription}`,
    `C_FDW_PHASE: ${phaseName}`,
    `C_FDW_AGENT: ${agentName}`,
    `C_FDW_CONTEXT: ${context}`,
    '',
    task,
  ].join('\n')
}

function structuredHandoff(items, options = {}) {
  const label = options.label ?? 'cf-dw-handoff'
  const maxItemChars = options.maxItemChars ?? 900
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

phase('Phase A: City Domain Research')

const cityReports = await parallel(
  cells.map(([city, domain]) => () =>
    agent(
      tagged({
        phaseName: 'Phase A: City Domain Research',
        agentName: `reasonix:research:${city}`,
        context: `${city} / ${domain} research plan and evidence schema.`,
        task: [
          'This is a multi-step research agent task.',
          `City: ${city}`,
          `Domain: ${domain}`,
          '1. Define what evidence should be collected.',
          '2. Draft a normalized evidence table schema.',
          '3. Identify two risk signals that later phases should compare across cities.',
          'Return concise Chinese output.',
        ].join('\n'),
      }),
      { label: `reasonix:research:${city}`, phase: 'Phase A: City Domain Research', adapter: 'cf_dw_reasonix' },
    ),
  ),
)

phase('Phase B: Normalize & Compare')

const comparison = await agent(
  tagged({
    phaseName: 'Phase B: Normalize & Compare',
    agentName: 'reasonix:cross-city-comparison',
    context: 'Normalize city/domain reports and identify cross-city comparison axes.',
    task: [
      'Perform a structured synthesis:',
      '1. Normalize the city reports into common fields.',
      '2. Identify three cross-city comparison axes.',
      '3. Propose the final report outline.',
      'Use the structured handoff JSON as upstream evidence. Prefer sha/excerpt references over copying full text.',
      '',
      structuredHandoff(cityReports, { label: 'city-domain-reports' }),
    ].join('\n'),
  }),
  { label: 'reasonix:cross-city-comparison', phase: 'Phase B: Normalize & Compare', adapter: 'cf_dw_reasonix' },
)

return { workflow: workflowTag, cityReports, comparison }
