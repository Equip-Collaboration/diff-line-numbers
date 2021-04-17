# Diff line numbers javascript action

This action outputs the line number of the deleted/added lines of modified or added files.

The line numbers are obtained by parsing the patch chunks of each file given by `git diff`

NOTE: Requires having used `actions/checkout@v2` in a previous step.

## Inputs

### `include`

**Optional** JSON array. Only process paths that match a regular expression in `include`. By default includes all.

### `ignore`

**Optional** JSON array. Do not process paths that match a regular expression in `ignore`. By default ignores none.

## Outputs

### `lineNumbers`

An array with the files' path, added lines and removed lines. It looks like:
```javascript
[
  {
    path: string,
    added: number[],
    removed: number[]
  },
  ...
]
```
- `path` is the file's path, e.g. `package.json` and `src/index.js`.
- `added` is an array of numbers. Each number is the line number of an added line.
- `removed` is an array of numbers. Each number is the line number of a removed line.

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
          include: '["\\.js$", "\\.jsx$"]'
          ignore: '["^dist/", "^bin/", "^www/"]'
      - name: Print line numbers of changed lines
        run: echo Line numbers = ${{ toJSON(steps.diff.outputs.lineNumbers) }}
```
