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

export async function ensureSubscriptions(db: any): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      subscription_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

export async function getUserIdByTodoistId(db: any, todoistUserId: string): Promise<string | null> {
  await ensureKVStore(db);
  const result = await db.prepare(
    "SELECT value FROM kvstore WHERE key = ?"
  ).bind(`todoist_user_${todoistUserId}`).first();
  return result?.value || null;
}

export async function setUserIdForTodoistId(db: any, todoistUserId: string, userId: string): Promise<void> {
  await ensureKVStore(db);
  await db.prepare(
    "INSERT OR REPLACE INTO kvstore (key, value) VALUES (?, ?)"
  ).bind(`todoist_user_${todoistUserId}`, userId).run();
}

export async function deleteUser(db: any, userId: string): Promise<void> {
  await ensureKVStore(db);
  
  // First get the token to find the Todoist user ID
  const token = await getToken(db, userId);
  if (token) {
    // Fetch Todoist user ID to clean up the mapping
    try {
      const userResponse = await fetch('https://api.todoist.com/api/v1/user', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (userResponse.ok) {
        const userData = await userResponse.json() as { id: string };
        // Delete the Todoist user ID mapping
        await db.prepare("DELETE FROM kvstore WHERE key = ?").bind(`todoist_user_${userData.id}`).run();
      }
    } catch (error) {
      console.error("Error fetching user data for cleanup:", error);
    }
  }
  
  // Delete the token
  await db.prepare("DELETE FROM kvstore WHERE key = ?").bind(`todoist_token_${userId}`).run();
}