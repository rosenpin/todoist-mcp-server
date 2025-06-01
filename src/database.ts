export async function ensureKVStore(db: any): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS kvstore (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run();
}

export async function ensureOAuthStates(db: any): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    )
  `).run();
}

export async function getToken(db: any, userId: string): Promise<string | null> {
  await ensureKVStore(db);
  const result = await db.prepare(
    "SELECT value FROM kvstore WHERE key = ?"
  ).bind(`todoist_token_${userId}`).first();
  return result?.value || null;
}

export async function setToken(db: any, userId: string, token: string): Promise<void> {
  await ensureKVStore(db);
  await db.prepare(
    "INSERT OR REPLACE INTO kvstore (key, value) VALUES (?, ?)"
  ).bind(`todoist_token_${userId}`, token).run();
}

export async function storeOAuthState(db: any, state: string): Promise<void> {
  await ensureOAuthStates(db);
  await db.prepare(
    "INSERT INTO oauth_states (state, created_at) VALUES (?, ?)"
  ).bind(state, Date.now()).run();
}

export async function validateAndCleanupState(db: any, state: string): Promise<boolean> {
  await ensureOAuthStates(db);
  
  const stateRecord = await db.prepare(
    "SELECT created_at FROM oauth_states WHERE state = ?"
  ).bind(state).first();
  
  if (!stateRecord) {
    return false;
  }
  
  // Clean up used state
  await db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  
  // Check if state is not too old (5 minutes max)
  return Date.now() - stateRecord.created_at <= 5 * 60 * 1000;
}