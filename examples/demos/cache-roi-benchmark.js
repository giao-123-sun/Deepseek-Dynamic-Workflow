export const meta = {
  name: 'cf-dw-cache-roi-benchmark',
  description: 'Measure whether a stable prefix and repeated workflow shape produce warm-cache gains.',
}

const workflowTag = 'demo-cache-roi-benchmark'
const workflowDescription =
  'Cache ROI Benchmark: compare cache-first Native and ReasoniX agents on stable workflow prompts.'

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

phase('Phase A: Prefix Surface')

const prefixReports = await parallel([
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Prefix Surface',
        agentName: 'native:prefix-stability',
        context: 'Inspect the prefix builder and identify cache-stability requirements.',
        task: [
          'Use the available file tools to inspect src/prefix-cli.ts and src/prefix-builder.ts.',
          'Return exactly three bullets in Chinese: stable inputs, drift risks, and one improvement.',
        ].join('\n'),
      }),
      { label: 'native:prefix-stability', phase: 'Phase A: Prefix Surface', adapter: 'cf_dw_deepseek' },
    ),
  () =>
    agent(
      tagged({
        phaseName: 'Phase A: Prefix Surface',
        agentName: 'reasonix:cache-economics',
        context: 'Run a multi-step ReasoniX cost/cache reasoning task.',
        task: [
          'Perform a three-step analysis in Chinese:',
          '1. Explain why stable prefixes matter for dynamic workflows.',
          '2. Identify two sources of prompt drift in multi-agent workflows.',
          '3. Propose a measurement plan for cold vs warm cache ROI.',
          'Keep the answer concise and operational.',
        ].join('\n'),
      }),
      { label: 'reasonix:cache-economics', phase: 'Phase A: Prefix Surface', adapter: 'cf_dw_reasonix' },
    ),
])

phase('Phase B: ROI Synthesis')

const synthesis = await agent(
  tagged({
    phaseName: 'Phase B: ROI Synthesis',
    agentName: 'reasonix:roi-synthesis',
    context: 'Synthesize Native and ReasoniX cache observations into a benchmark checklist.',
    task: [
      'Read the two reports below and produce a compact benchmark checklist.',
      'Include: metrics, expected cold/warm behavior, and a pass/fail gate for 80-90% warm cache hit.',
      '',
      prefixReports.filter(Boolean).join('\n\n---\n\n'),
    ].join('\n'),
  }),
  { label: 'reasonix:roi-synthesis', phase: 'Phase B: ROI Synthesis', adapter: 'cf_dw_reasonix' },
)

return { workflow: workflowTag, prefixReports, synthesis }
