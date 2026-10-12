const { test } = require('node:test')
const assert = require('node:assert/strict')
const { uniqueChangedFiles } = require('../examples/changed-files')

test('changed files preserve first-seen order without mutating input', () => {
  const paths = Object.freeze(['src/b.js', 'src/a.js', 'src/b.js', 'README.md'])
  assert.deepEqual(uniqueChangedFiles(paths), ['src/b.js', 'src/a.js', 'README.md'])
})

test('changed files handle an empty list and repeated paths', () => {
  assert.deepEqual(uniqueChangedFiles([]), [])
  assert.deepEqual(uniqueChangedFiles(['a.js', 'a.js', 'a.js']), ['a.js'])
})
