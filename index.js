const core = require('@actions/core')
const github = require('@actions/github')

// Matches a patch chunk line and captures the chunk's numbers.
// E.g.: Matches "@@ -27,7 +198,6 @@ ..." and captures 27, 7, 198 and 6
const patchChunkRegexp = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/

run()

async function run() {
  // https://github.com/actions/toolkit/blob/main/docs/action-debugging.md#how-to-access-step-debug-logs
  core.debug('run: Starting...')

  try {
    core.debug('run: calling getDiffs...')
    const diffs = await getDiffs()

    core.debug(`run: Got ${JSON.stringify(diffs.length)} diffs`)

    const files = {}
    diffs.forEach(diff => {
      const { patch, status } = diff
      const { added, removed } = getLineNumbers(patch)

      const totalLines = added.length + removed.length
      const debugMessage = `run: getLineNumbers got ${totalLines} of ${JSON.stringify(
        diff.changes
      )} lines in ${JSON.stringify(diff.filename)}`
      if (totalLines === diff.changes) {
        core.debug(debugMessage)
      } else {
        core.warning(debugMessage)
      }

      files[diff.filename] = {
        added,
        removed,
        status
      }
    })
    core.setOutput('files', files)

    core.startGroup('run: Set outputs.files')
    core.debug(`run: files=${JSON.stringify(files, null, 2)}`)
    core.endGroup()
  } catch (error) {
    core.error(error)

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

  core.debug(`getDiffs: githubToken.length=${githubToken.length}`)

  const octokit = github.getOctokit(githubToken)

  core.debug(`getDiffs: Got octokit`)

  const { payload, eventName } = github.context

  core.startGroup('getDiffs: payload')
  core.debug(`getDiffs: payload=${JSON.stringify(payload, null, 2)}`)
  core.endGroup()
  core.debug(`getDiffs: eventName=${JSON.stringify(eventName)}`)

  const {
    repository: {
      name: repo,
      owner: { login: owner }
    },
    before,
    after: head
  } = payload

  core.debug(`getDiffs: repo=${JSON.stringify(repo)}`)
  core.debug(`getDiffs: owner=${JSON.stringify(owner)}`)
  core.debug(`getDiffs: before=${JSON.stringify(before)}`)
  core.debug(`getDiffs: head=${JSON.stringify(head)}`)

  let base
  if (eventName === 'pull_request') {
    base = payload.pull_request.base
  } else if (eventName === 'push') {
    base = before
  } else {
    throw new Error('The triggering event must be "push" or "pull_request"')
  }

  core.debug(`getDiffs: base=${JSON.stringify(base)}`)

  // https://docs.github.com/en/rest/reference/repos#compare-two-commits
  const {
    data: { diffs }
  } = await octokit.repos.compareCommits({
    owner,
    repo,
    base,
    head,
    mediaType: {
      format: 'json'
    }
  })

  core.startGroup('getDiffs: diffs')
  core.debug(`getDiffs: diffs=${JSON.stringify(diffs, null, 2)}`)
  core.endGroup()

  return diffs
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
