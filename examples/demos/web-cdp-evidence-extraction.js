export const meta = {
  name: 'cf-dw-web-cdp-evidence-extraction',
  description: 'Design and dry-run the CDP evidence extraction workflow shape with ReasoniX agents.',
}

const workflowTag = 'demo-web-cdp-evidence-extraction'
const workflowDescription =
  'Web/CDP Evidence Extraction: plan browser-driven evidence collection, extraction, verification, and artifact capture.'

const targets = [
  'government procurement announcement page with dynamic filters',
  'market regulation notice page requiring pagination',
  'policy database page where details open in modal dialogs',
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

phase('Phase A: CDP Playbooks')

const playbooks = await parallel(
  targets.map((target, index) => () =>
    agent(
      tagged({
        phaseName: 'Phase A: CDP Playbooks',
        agentName: `reasonix:cdp-playbook-${index + 1}`,
        context: `Browser evidence playbook for ${target}.`,
        task: [
          'This is a multi-step browser/CDP planning task.',
          `Target: ${target}`,
          '1. Propose the browser actions an agent should attempt.',
          '2. Define what DOM fields, screenshots, and downloaded files should become artifacts.',
          '3. List two failure modes and a recovery strategy.',
          'Return concise Chinese output.',
        ].join('\n'),
      }),
      { label: `reasonix:cdp-playbook-${index + 1}`, phase: 'Phase A: CDP Playbooks', adapter: 'cf_dw_reasonix' },
    ),
  ),
)

phase('Phase B: Evidence Protocol')

const protocol = await agent(
  tagged({
    phaseName: 'Phase B: Evidence Protocol',
    agentName: 'reasonix:evidence-protocol',
    context: 'Convert playbooks into a CFDW artifact protocol for future CDP agents.',
    task: [
      'Synthesize a browser evidence artifact protocol.',
      'Include: required artifact files, dashboard fields, and pass/fail metrics.',
      '',
      playbooks.filter(Boolean).join('\n\n---\n\n'),
    ].join('\n'),
  }),
  { label: 'reasonix:evidence-protocol', phase: 'Phase B: Evidence Protocol', adapter: 'cf_dw_reasonix' },
)

return { workflow: workflowTag, playbooks, protocol }
