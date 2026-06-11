export const meta = {
  name: 'awesome-dynamic-workflows-publish',
  description: 'Publish the generated awesome-dynamic-workflows repository to GitHub.',
}

phase('Phase D: GitHub Publish')

const published = await agent(
  [
    'C_FDW_WORKFLOW: awesome-dynamic-workflows-publish',
    'C_FDW_DESCRIPTION: Publish generated awesome-dynamic-workflows repository to GitHub.',
    'C_FDW_PHASE: Phase D: GitHub Publish',
    'C_FDW_AGENT: publish:github-repo',
    'C_FDW_CONTEXT: Use shell tools to initialize git, create the GitHub repo if needed, and push.',
    '',
    'You are running inside a real Open Dynamic Workflows run. Use DDW tools yourself.',
    'Use run_shell to execute commands and read_file/grep for verification.',
    '',
    'Task:',
    '1. Inspect awesome-dynamic-workflows/README.md.',
    '2. Initialize awesome-dynamic-workflows as an independent git repository if it is not already one.',
    '3. Commit the generated files with message "Initial awesome dynamic workflows list".',
    '4. Create GitHub repository giao-123-sun/awesome-dynamic-workflows as public if it does not already exist.',
    '5. Push the local repository to GitHub main.',
    '6. Return the GitHub URL, commit hash, and any warnings.',
    '',
    'Use PowerShell/cmd-compatible shell commands. Do not modify the parent DDW repository except through the generated awesome-dynamic-workflows folder.',
  ].join('\n'),
  { label: 'publish:github-repo', phase: 'Phase D: GitHub Publish', adapter: 'ddw_research' },
)

return { workflow: 'awesome-dynamic-workflows-publish', published }
