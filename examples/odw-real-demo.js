export const meta = {
  name: 'cf-dw-real-adapter-demo',
  description: 'Run Open Dynamic Workflows through the cache-first DeepSeek adapter.',
}

const workflowTag = 'odw-real-demo'
const workflowDescription =
  '真实 ODW 动态工作流：并行检查 DDW adapter 的 prefix/session/tool/dashboard 模块，然后综合输出可用性、缓存命中和 demo 建议。'

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

phase('Phase A: Adapter Surface Inspection')

const surfaceTasks = [
  {
    phaseName: 'Phase A: Adapter Surface Inspection',
    agentName: 'inspect:prefix-builder',
    context: '检查 Repomix prefix builder 和 immutable prefix 是否适合 ODW adapter。',
    task: [
      'Use tools to inspect src/prefix-cli.ts and src/prefix-builder.ts.',
      'Return a concise Chinese assessment with: implemented features, risks, and one next improvement.',
    ].join('\n'),
  },
  {
    phaseName: 'Phase A: Adapter Surface Inspection',
    agentName: 'inspect:session-loop',
    context: '检查 AgentSession loop、append-only log、usage ledger 和 DeepSeek user_id 映射。',
    task: [
      'Use tools to inspect src/run-agent-session.ts, src/session-store.ts, and src/usage-ledger.ts.',
      'Return a concise Chinese assessment with: implemented features, risks, and one next improvement.',
    ].join('\n'),
  },
]

const surfaceReports = await parallel(
  surfaceTasks.map((item) => () =>
    agent(tagged(item), { label: item.agentName, phase: item.phaseName }),
  ),
)

phase('Phase B: Visualization & Demo Planning')

const planningTasks = [
  {
    phaseName: 'Phase B: Visualization & Demo Planning',
    agentName: 'inspect:workflow-dashboard',
    context: '检查动态工作流 dashboard 是否能展示 workflow、phase、agent、token、tool、cache 和 artifact。',
    task: [
      'Use tools to inspect src/dashboard.ts and src/workflow-view.ts.',
      'Return a concise Chinese assessment with: current visualization surface, missing data, and one next improvement.',
    ].join('\n'),
  },
  {
    phaseName: 'Phase B: Visualization & Demo Planning',
    agentName: 'plan:practical-demos',
    context: '基于 README 和当前模块，提出实际可演示的 DDW 应用场景。',
    task: [
      'Use tools to inspect README.md and examples/odw.config.json.',
      'Return 5 practical demos for this product. For each demo include target user, input, workflow phases, and measurable metric.',
    ].join('\n'),
  },
]

const planningReports = await parallel(
  planningTasks.map((item) => () =>
    agent(tagged(item), { label: item.agentName, phase: item.phaseName }),
  ),
)

phase('Phase C: Synthesis')

const synthesis = await agent(
  tagged({
    phaseName: 'Phase C: Synthesis',
    agentName: 'synthesis:system-readiness',
    context: '综合前面四个 agent 输出，判断这个 ODW + DDW adapter 是否能真实跑东西。',
    task: [
      'Synthesize the reports below into one Chinese final report.',
      'Include: 1) whether the real ODW integration works, 2) cache-hit observations to look at, 3) risks, 4) best practical demos.',
      '',
      'Surface reports:',
      surfaceReports.filter(Boolean).join('\n\n---\n\n'),
      '',
      'Planning reports:',
      planningReports.filter(Boolean).join('\n\n---\n\n'),
    ].join('\n'),
  }),
  { label: 'synthesis:system-readiness', phase: 'Phase C: Synthesis' },
)

return {
  workflow: workflowTag,
  surfaceReports,
  planningReports,
  synthesis,
}
