import { get, run } from '../server/db.js'

const username = String(process.argv[2] || '').trim()
if (!username) {
  console.error('Usage: node scripts/make-admin.js <username>')
  process.exit(1)
}

const user = get('SELECT id, username, admin FROM users WHERE username=? COLLATE NOCASE', [username])
if (!user) {
  console.error(`User not found: ${username}`)
  console.error('Register the account first, then run this command again.')
  process.exit(1)
}

if (user.admin) {
  console.log(`Already admin: ${user.username}`)
  process.exit(0)
}

run('UPDATE users SET admin=1 WHERE id=?', [user.id])
console.log(`Admin enabled for ${user.username}`)
