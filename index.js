const core = require('@actions/core')
const github = require('@actions/github')

// Matches a patch chunk line and captures the chunk's numbers.
// E.g.: Matches "@@ -27,7 +198,6 @@ ..." and captures 27, 7, 198 and 6
const patchChunkRegexp = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/

run()

async function run() {
  try {
    const diffs = await getDiffs()
    const files = {}
    diffs.forEach(diff => {
      const { patch, status } = diff
      const { added, removed } = getLineNumbers(patch)
      files[diff.filename] = {
        added,
        removed,
        status
      }
    })
    core.setOutput('files', files)
  } catch (error) {
    core.setFailed(error.message)
  }
}

/**
 * Gets the diffs (one for each file) between the current commit and:
 * - The base branch of the pull request, or
 * - The commit before the push
 *
 * @returns {object[]} File diffs
 */
async function getDiffs() {
  const githubToken = core.getInput('githubToken')
  const octokit = github.getOctokit(githubToken)
  const { payload, eventName } = github.context
  const {
    repository: {
      name: repo,
      owner: { login: owner }
    },
    before,
    after: head
  } = payload
  let base
  if (eventName === 'pull_request') {
    base = payload.pull_request.base
  } else if (eventName === 'push') {
    base = before
  } else {
    throw new Error('The triggering event must be "push" or "pull_request"')
  }

  // https://docs.github.com/en/rest/reference/repos#compare-two-commits
  const {
    data: { files }
  } = await octokit.repos.compareCommits({
    owner,
    repo,
    base,
    head,
    mediaType: {
      format: 'json'
    }
  })

  return files
}

/**
 * Get the line numbers (removed and added) from the patch's chunks
 *
 * @param {string} patch The diff's patch
 * @returns {object} { added: number[], removed: number[] }
 */
function getLineNumbers(patch) {
  const removed = []
  const added = []

  const patchLines = patch.split('\n')
  for (let i = 0, l = patchLines.length; i < l; i++) {
    const match = patchLines[i].match(patchChunkRegexp)
    if (match) {
      const [, remStart, remNumber, addStart, addNumber] = match
      for (let j = 0; j < remNumber; j++) {
        removed.push(remStart + j)
      }
      for (let j = 0; j < addNumber; j++) {
        added.push(addStart + j)
      }
    }
  }

  return { added, removed }
}
