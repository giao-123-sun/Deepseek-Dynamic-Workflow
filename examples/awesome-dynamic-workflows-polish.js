export const meta = {
  name: 'awesome-dynamic-workflows-polish',
  description: 'Polish the generated awesome-dynamic-workflows repository using a DDW research agent.',
}

const workflowTag = 'awesome-dynamic-workflows-polish'

function tagged({ phaseName, agentName, context, task }) {
  return [
    `C_FDW_WORKFLOW: ${workflowTag}`,
    'C_FDW_DESCRIPTION: Polish generated awesome-dynamic-workflows repository and remove placeholder entries.',
    `C_FDW_PHASE: ${phaseName}`,
    `C_FDW_AGENT: ${agentName}`,
    `C_FDW_CONTEXT: ${context}`,
    '',
    'You are running inside a real Open Dynamic Workflows run. Use DDW tools yourself.',
    'Use read_file, grep, github_search_repos, fetch_url, and write_file. Cite sources in your final report.',
    '',
    task,
  ].join('\n')
}

phase('Phase C: Repository Polish')

const polish = await agent(
  tagged({
    phaseName: 'Phase C: Repository Polish',
    agentName: 'polish:placeholder-cleanup',
    context: 'Fix placeholder URLs and obvious quality gaps in the generated awesome repo.',
    task: [
      'Inspect awesome-dynamic-workflows/README.md, awesome-dynamic-workflows/data/projects.json, and research notes.',
      'Remove or replace every placeholder such as https://github.com/your-org/cf-dw.',
      'Use the real DDW repository URL: https://github.com/giao-123-sun/Deepseek-Dynamic-Workflow.',
      'Search for GOODRL. If no trustworthy public project URL exists, remove it from curated lists or mark it only as a paper/topic if a real source is found.',
      'Add a short note explaining that research/ contains raw agent notes while data/ contains curated outputs.',
      'Write all needed file patches with write_file.',
      'Return a concise report listing changed files and remaining risks.',
    ].join('\n'),
  }),
  { label: 'polish:placeholder-cleanup', phase: 'Phase C: Repository Polish', adapter: 'ddw_research' },
)

return { workflow: workflowTag, polish }
