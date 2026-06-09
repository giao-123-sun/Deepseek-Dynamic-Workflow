export const meta = {
  name: 'cf-dw-reasonix-harness-demo',
  description: 'Run ODW agents through ReasoniX harness and record cache usage.',
}

const tag = 'reasonix-odw-demo'
const description = '真实 ODW 动态工作流：每个 agent 通过 ReasoniX run harness 执行，观察贯穿缓存命中与产出。'

function prompt({ phaseName, agentName, context, task }) {
  return [
    `C_FDW_WORKFLOW: ${tag}`,
    `C_FDW_DESCRIPTION: ${description}`,
    `C_FDW_PHASE: ${phaseName}`,
    `C_FDW_AGENT: ${agentName}`,
    `C_FDW_CONTEXT: ${context}`,
    '',
    task,
  ].join('\n')
}

phase('Phase A: ReasoniX Harness Probes')

const probes = await parallel([
  () =>
    agent(
      prompt({
        phaseName: 'Phase A: ReasoniX Harness Probes',
        agentName: 'reasonix:cache-probe',
        context: '判断 ReasoniX transcript 是否记录 DeepSeek cache hit/miss。',
        task:
          '请用中文简洁说明：ReasoniX run transcript 里应观察哪些字段来判断贯穿缓存命中？只输出 3 个要点。',
      }),
      { label: 'reasonix:cache-probe', phase: 'Phase A: ReasoniX Harness Probes' },
    ),
  () =>
    agent(
      prompt({
        phaseName: 'Phase A: ReasoniX Harness Probes',
        agentName: 'reasonix:harness-fit',
        context: '判断 ReasoniX 是否适合作为 ODW 每个 agent 的 harness。',
        task:
          '请用中文简洁说明：ReasoniX 作为 ODW agent harness 的优点、限制、适合场景。每类一句。',
      }),
      { label: 'reasonix:harness-fit', phase: 'Phase A: ReasoniX Harness Probes' },
    ),
])

phase('Phase B: Synthesis')

const synthesis = await agent(
  prompt({
    phaseName: 'Phase B: Synthesis',
    agentName: 'reasonix:synthesis',
    context: '汇总两个 ReasoniX harness agent 的判断。',
    task: [
      '综合下面两个 agent 的输出，给出一句结论和三个下一步。',
      '',
      probes.filter(Boolean).join('\n\n---\n\n'),
    ].join('\n'),
  }),
  { label: 'reasonix:synthesis', phase: 'Phase B: Synthesis' },
)

return {
  workflow: tag,
  probes,
  synthesis,
}
