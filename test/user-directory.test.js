const { test } = require('node:test')
const assert = require('node:assert/strict')
const { findUserById, activeUserEmails } = require('../examples/user-directory')

test('directory lookup returns first matching user and undefined for a missing ID', () => {
  const first = { id: 'a', name: 'First' }
  assert.equal(findUserById([first, { id: 'a', name: 'Second' }], 'a'), first)
  assert.equal(findUserById([], 'missing'), undefined)
})

test('active emails are normalized and deduplicated in first-seen order', () => {
  const users = [
    { active: true, email: ' FIRST@example.com ' },
    { active: false, email: 'inactive@example.com' },
    { active: true, email: 'first@example.com' },
    { active: true, email: 'second@example.com' }
  ]
  assert.deepEqual(activeUserEmails(users), ['first@example.com', 'second@example.com'])
  assert.deepEqual(activeUserEmails([]), [])
})
