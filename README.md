# Diff line numbers javascript action

This action outputs the status and the line number of the changed lines of the changed files.

The line numbers are obtained by parsing the patch chunks of each file given by the [GitHub API](https://docs.github.com/en/rest/reference/repos#compare-two-commits)

Note: Maximum 250 commits per diff (be it from a push or PR)

## Inputs

### `githubToken`

**Required** The GitHub token used to compare commits. Typically, `secrets.GITHUB_TOKEN` should be used.

## Outputs

### `files`

An object with the files' diffs. It looks like:
```javascript
{
  'filePath1': {
    added: number[],
    removed: number[],
    status: string
  },
  ...
}
```
- `filePath1` is the file's path, e.g. `package.json` and `src/index.js`.
- `added` is an array of numbers. Each one is the line number of an added line.
- `removed` is an array of numbers. Each one is the line number of a removed line.
- `status` is the file's status. Can be `modified`, `added`, `deleted` and [some others](https://git-scm.com/docs/git-diff#Documentation/git-diff.txt---diff-filterACDMRTUXB82308203).

## Example usage

```yml
name: example
on: [pull_request]
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - name: Get diff lines
        id: diff
        uses: Equip-Collaboration/diff-line-numbers@v1
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN }}
      - name: Print changed files
        run: echo Files diff = ${{ toJSON(steps.diff.outputs.files) }}
```
