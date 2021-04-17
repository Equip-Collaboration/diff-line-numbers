const core = require('@actions/core')
const exec = require('@actions/exec')
const github = require('@actions/github')

run()

/**
 * Sets the variable lineNumbers in the action's output
 */
async function run() {
  // https://github.com/actions/toolkit/blob/main/docs/action-debugging.md#how-to-access-step-debug-logs
  core.debug('run: Starting...')

  try {
    const include = core.getInput('include')
    const ignore = core.getInput('ignore')

    core.debug(`run: include=${JSON.stringify(include, null, 2)}`)
    core.debug(`run: ignore=${JSON.stringify(ignore, null, 2)}`)

    const { base, head } = getRefs()

    core.debug(`run: base=${JSON.stringify(base, null, 2)}`)
    core.debug(`run: head=${JSON.stringify(head, null, 2)}`)

    core.debug(`run: fetching ${base}...`)

    await execAsync('git', ['fetch', 'origin', base], { failOnStdErr: false })

    core.debug(`run: ${base} fetched`)

    const paths = await getPaths(
      base,
      head,
      JSON.parse(include),
      JSON.parse(ignore)
    )

    core.debug(`run: paths=${JSON.stringify(paths, null, 2)}`)

    const diffs = await getDiffs(base, head, paths)

    core.startGroup('run: diffs')
    core.debug(`run: diffs=${JSON.stringify(diffs, null, 2)}`)
    core.endGroup()

    const lineNumbers = diffs.map(diff => getLineNumbers(diff))

    core.startGroup('run: lineNumbers')
    core.debug(`run: lineNumbers=${JSON.stringify(lineNumbers, null, 2)}`)
    core.endGroup()

    const output = []
    for (let i = 0; i < paths.length; i++) {
      output.push({
        path: paths[i],
        added: lineNumbers[i].added,
        removed: lineNumbers[i].removed
      })
    }

    core.startGroup('run: output')
    core.debug(`run: output=${JSON.stringify(output, null, 2)}`)
    core.endGroup()

    core.setOutput('lineNumbers', output)
  } catch (error) {
    core.error(error)

    core.setFailed(error.message)
  }
  core.debug('run: Ended')
}

/**
 * Gets the diffs (one for each file) between `base` and `head`
 *
 * @param {string} base The git ref to compare from
 * @param {string} head The git ref to compare to
 * @param {string[]} paths The paths of the files to compare
 * @returns {string[]} Diff patches
 */
async function getDiffs(base, head, paths) {
  core.startGroup('getDiffs')

  const diffs = []
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]

    const { stdout } = await execAsync('git', [
      'diff',
      '-U0',
      `--minimal`,
      `--diff-filter=ad`,
      `--inter-hunk-context=0`,
      `-w`,
      `${base}`,
      '--',
      path
    ])

    core.debug(`getDiffs: stdout=${stdout}`)

    diffs.push(stdout)
  }

  core.endGroup()

  return diffs
}

/**
 * Gets the path of added or modified (ignores whitespace) files between `base`
 * and `head`.
 *
 * - Only return paths that match a regular expression in `include`. By default
 * includes all.
 * - Do not return paths that match a regular expression in `ignore`. By
 * default ignores none.
 *
 * @param {string} base The git ref to compare from
 * @param {string} head The git ref to compare to
 * @param {string[]} include A list of regular expressions
 * @param {string[]} ignore A list of regular expressions
 * @returns {string[]} The paths
 */
async function getPaths(base, head, include = [''], ignore = []) {
  const includeRegexps = include.map(re => new RegExp(re))

  core.debug(
    `getPaths: includeRegexps=${JSON.stringify(
      includeRegexps.map(re => re.toString())
    )}`
  )

  const ignoreRegexps = ignore.map(re => new RegExp(re))

  core.debug(
    `getPaths: ignoreRegexps=${JSON.stringify(
      ignoreRegexps.map(re => re.toString())
    )}`
  )

  const { stdout } = await execAsync('git', [
    'diff',
    '--name-only',
    `--diff-filter=ad`,
    `-w`,
    `${base}`,
    `--`
  ])

  core.debug(`getPaths: stdout=${stdout}`)

  return stdout
    .split('\n')
    .filter(
      path =>
        path &&
        includeRegexps.some(re => re.test(path)) &&
        !ignoreRegexps.some(re => re.test(path))
    )
}

// Matches a patch chunk line and captures the chunk's numbers.
// E.g.: Matches "@@ -27,7 +198,6 @@ ..." and captures 27, 7, 198 and 6
// E.g.: Matches "@@ -27 +198,0 @@ ..." and captures 27, undefined, 198 and 0
// Capture groups:             |-1-|    |-2-|     |-3-|    |-4-|
const patchLinesRegexp = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Gets the line numbers (removed and added) from the patch
 *
 * @param {string} patch The diff's patch
 * @returns {object} { added: number[], removed: number[] }
 */
function getLineNumbers(patch) {
  const removed = []
  const added = []

  const patchLines = patch ? patch.split('\n') : []
  for (let i = 0; i < patchLines.length; i++) {
    const match = patchLines[i].match(patchLinesRegexp)
    if (match) {
      const remStart = Number.parseInt(match[1])
      const remNumber = match[2] ? Number.parseInt(match[2]) : 1
      const addStart = Number.parseInt(match[3])
      const addNumber = match[4] ? Number.parseInt(match[4]) : 1

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

/**
 * Gets the base and head refs from the github context.
 *
 * The base ref will be:
 * - The base branch of the pull request, or
 * - The commit before the push
 *
 * @returns {object} { base, head, owner, repo }
 */
function getRefs() {
  const { payload, eventName } = github.context

  core.startGroup('getRefs: payload')
  core.debug(`getRefs: payload=${JSON.stringify(payload, null, 2)}`)
  core.endGroup()
  core.debug(`getRefs: eventName=${JSON.stringify(eventName)}`)

  const {
    repository: {
      name: repo,
      owner: { login: owner }
    },
    before,
    after: head
  } = payload

  core.debug(`getRefs: repo=${JSON.stringify(repo)}`)
  core.debug(`getRefs: owner=${JSON.stringify(owner)}`)
  core.debug(`getRefs: before=${JSON.stringify(before)}`)
  core.debug(`getRefs: head=${JSON.stringify(head)}`)

  let base
  if (eventName === 'pull_request') {
    base = payload.pull_request.base.sha
  } else if (eventName === 'push') {
    base = before
  } else {
    throw new Error('The triggering event must be "push" or "pull_request"')
  }

  core.debug(`getRefs: base=${JSON.stringify(base)}`)

  return { base, head, owner, repo }
}

/**
 * Executes a shell command and resolves to the output
 * once the command finishes.
 *
 * By default, rejects if there is data on stderr or if the exit code is not zero.
 * See more options at
 * <https://github.com/actions/toolkit/blob/main/packages/exec/src/interfaces.ts>
 *
 * @param {string} command
 * @param {string[]} args
 * @param {object} options
 * @returns {object} { stdout: string, stderr: string, code: number }
 */
async function execAsync(command, args = [], options = {}) {
  const errArray = []
  const outArray = []
  let code = -1

  core.debug(`execAsync: command=${command}`)
  core.debug(`execAsync: args=${JSON.stringify(args, null, 2)}`)
  core.debug(`execAsync: (input) options=${JSON.stringify(options, null, 2)}`)

  options = {
    failOnStdErr: true,
    silent: true,
    ...options,
    listeners: {
      ...(options.listeners ? options.listeners : {}),
      // Use stdout instead of stdline https://github.com/actions/toolkit/issues/749
      stdout: data => outArray.push(data),
      stderr: data => errArray.push(data)
    }
  }

  try {
    code = await exec.exec(command, args, options)
  } catch (e) {
    e.stderr = errArray.join('')
    e.stdout = outArray.join('')
    core.error(`execAsync: stdout=${e.stdout}`)
    core.error(`execAsync: stderr=${e.stderr}`)
    throw e
  }

  return { stdout: outArray.join(''), stderr: errArray.join(''), code }
}
