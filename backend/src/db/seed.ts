import bcryptjs from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from './index'
import { users } from './schema'

export async function seed() {
  const existing = await db.select().from(users).where(eq(users.username, 'admin'))

  if (existing.length === 0) {
    const passwordHash = await bcryptjs.hash('changeme', 10)
    await db.insert(users).values({ username: 'admin', passwordHash, isAdmin: true })
    console.log('Seeded default admin user (admin / changeme)')
  }
}

// Allow running as a standalone script
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err)
      process.exit(1)
    })
}
