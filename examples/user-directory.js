// Standalone review example; not imported by the Pulse server.
// Records have the shape { id: string, name: string, email: string, active: boolean }.

function findUserById(users, id) {
  const matches = users.filter(user => user.id === id)
  return matches[0]
}

function activeUserEmails(users) {
  const active = users.filter(user => user.active === true)
  const emails = active.map(user => user.email.trim().toLowerCase())
  const unique = []
  for (const email of emails) {
    if (unique.indexOf(email) === -1) unique.push(email)
  }
  return unique
}

module.exports = { findUserById, activeUserEmails }
