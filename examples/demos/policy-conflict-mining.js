export const meta = {
  name: 'cf-dw-policy-conflict-mining',
  description: 'Simulate a policy/legal conflict-mining workflow with ReasoniX multi-step agents.',
}

const workflowTag = 'demo-policy-conflict-mining'
const workflowDescription =
  'Policy Conflict Mining: extract candidate rules, compare jurisdictions, verify conflicts, and produce a scored report.'

const corpus = [
  'City A: procurement pilots may approve supplier shortlists within 5 working days if budget is below 2M.',
  'City B: public resource transactions must publish shortlist review comments for at least 7 calendar days.',
  'Province Rule: any public procurement shortlist above 500K must include a public objection window.',
  'City C: emergency digital-infrastructure projects may skip objection windows after bureau approval.',
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

phase('Phase A: Extract Rules')

const extraction = await parallel(
  corpus.map((doc, index) => () =>
    agent(
      tagged({
        phaseName: 'Phase A: Extract Rules',
        agentName: `reasonix:rule-extractor-${index + 1}`,
        context: 'Extract normative rule, threshold, exception, and possible conflict hooks.',
        task: [
          'This is a multi-step extraction task.',
          '1. Extract the normative rule.',
          '2. Identify thresholds, timing, exceptions, and publication obligations.',
          '3. List possible conflict hooks against higher-level rules.',
          '',
          `Document: ${doc}`,
        ].join('\n'),
      }),
      { label: `reasonix:rule-extractor-${index + 1}`, phase: 'Phase A: Extract Rules', adapter: 'cf_dw_reasonix' },
    ),
  ),
)

phase('Phase B: Conflict Verification')

const verification = await agent(
  tagged({
    phaseName: 'Phase B: Conflict Verification',
    agentName: 'reasonix:conflict-verifier',
    context: 'Compare extracted rules and verify likely conflicts.',
    task: [
      'Perform a three-step conflict verification:',
      '1. Group rules by obligation type.',
      '2. Identify candidate conflicts and explain the tension.',
      '3. Score each candidate as high, medium, or low confidence.',
      '',
      extraction.filter(Boolean).join('\n\n---\n\n'),
    ].join('\n'),
  }),
  { label: 'reasonix:conflict-verifier', phase: 'Phase B: Conflict Verification', adapter: 'cf_dw_reasonix' },
)

return { workflow: workflowTag, extraction, verification }
