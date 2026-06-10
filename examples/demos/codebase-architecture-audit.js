export const meta = {
  name: 'cf-dw-codebase-architecture-audit',
  description: 'Audit the DDW codebase with parallel Native and ReasoniX agents.',
}

const workflowTag = 'demo-codebase-architecture-audit'
const workflowDescription =
  'Codebase Architecture Audit: inspect core modules, identify risks, and synthesize a release-oriented architecture report.'

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

phase('Phase A: Module Inspection')

const moduleReports = await parallel([
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Module Inspection',
        agentName: 'native:session-ledger',
        context: 'Inspect AgentSession and usage ledger implementation.',
        task: [
          'Use file tools to inspect src/run-agent-session.ts, src/session-store.ts, and src/usage-ledger.ts.',
          'Return Chinese notes: current behavior, one architectural risk, and one test to add.',
        ].join('\n'),
      }),
      { label: 'native:session-ledger', phase: 'Phase A: Module Inspection', adapter: 'cf_dw_DeepSeek' },
    ),
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Module Inspection',
        agentName: 'native:dashboard-view',
        context: 'Inspect workflow dashboard and run aggregation.',
        task: [
          'Use file tools to inspect src/dashboard.ts, src/workflow-view.ts, and src/report-data.ts.',
          'Return Chinese notes: current visualization surface, missing release feature, and one improvement.',
        ].join('\n'),
      }),
      { label: 'native:dashboard-view', phase: 'Phase A: Module Inspection', adapter: 'cf_dw_DeepSeek' },
    ),
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Module Inspection',
        agentName: 'reasonix:harness-review',
        context: 'Run a multi-step ReasoniX review of the harness adapter.',
        task: [
          'Perform a three-step architecture review of src/reasonix-agent.ts:',
          '1. Identify how it maps ReasoniX transcript usage into DDW usage.',
          '2. Identify what artifact files it should produce for downstream phases.',
          '3. Recommend one hardening change for release.',
          'Return concise Chinese output.',
        ].join('\n'),
      }),
      { label: 'reasonix:harness-review', phase: 'Phase A: Module Inspection', adapter: 'cf_dw_reasonix' },
    ),
])

phase('Phase B: Release Architecture Report')

const report = await agent(
  tagged({
    phaseName: 'Phase B: Release Architecture Report',
    agentName: 'reasonix:architecture-synthesis',
    context: 'Synthesize module findings into a release architecture report.',
    task: [
      'Synthesize the module reports into a release-oriented architecture assessment.',
      'Include: what is ready, what is risky, what must be tested before GitHub release.',
      'Use the structured handoff JSON as upstream evidence. Prefer sha/excerpt references over copying full text.',
      '',
      structuredHandoff(moduleReports, { label: 'module-inspection-reports' }),
    ].join('\n'),
  }),
  { label: 'reasonix:architecture-synthesis', phase: 'Phase B: Release Architecture Report', adapter: 'cf_dw_reasonix' },
)

return { workflow: workflowTag, moduleReports, report }
