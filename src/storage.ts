interface StorageContext {
  sql?: any;
  requestUrl: string;
}

export async function getUserToken(context: StorageContext, userId: string): Promise<string | null> {
  try {
    // First try agents SQL storage
    if (context.sql) {
      try {
        const result = context.sql<{ value: string }>`
          SELECT value FROM kvstore WHERE key = ${`todoist_token_${userId}`}
        `;

        if (result.length > 0) {
          console.log("Found stored token in agents SQL for user:", userId);
          return result[0].value;
        }
      } catch (sqlError) {
        console.log("Agents SQL not available, trying D1 lookup");
      }
    }

    // Fallback to D1 via internal API
    try {
      const baseUrl = new URL(context.requestUrl);
      const response = await fetch(`${baseUrl.origin}/internal/get-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        const data = await response.json() as { token?: string };
        if (data.token) {
          console.log("Found stored token in D1 for user:", userId);
          return data.token;
        }
      }
    } catch (fetchError) {
      console.error("Error fetching token from D1:", fetchError);
    }

    console.log("No token found for user:", userId);
    return null;
  } catch (error) {
    console.error("Error getting user token:", error);
    return null;
  }
}

export async function setUserToken(context: StorageContext, userId: string, token: string): Promise<void> {
  try {
    // Try to store in agents SQL storage first
    if (context.sql) {
      try {
        context.sql`
          INSERT OR REPLACE INTO kvstore (key, value) VALUES (${`todoist_token_${userId}`}, ${token})
        `;
        console.log("Stored Todoist token in agents SQL for user:", userId);
      } catch (sqlError) {
        console.log("Agents SQL storage failed, will try D1");
      }
    }

    // Also store in D1 via internal API for persistence
    try {
      const baseUrl = new URL(context.requestUrl);
      const response = await fetch(`${baseUrl.origin}/internal/set-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, token })
      });

      if (response.ok) {
        console.log("Stored Todoist token in D1 for user:", userId);
      } else {
        console.error("Failed to store token in D1");
      }
    } catch (fetchError) {
      console.error("Error storing token in D1:", fetchError);
    }

  } catch (error) {
    console.error("Error storing user token:", error);
    throw error;
  }
}

export async function initializeStorage(sql: any): Promise<void> {
  try {
    if (sql) {
      // Create kvstore table if it doesn't exist using agents library SQL
      sql`
        CREATE TABLE IF NOT EXISTS kvstore (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `;
      console.log("Agents SQL storage initialized successfully");
    } else {
      console.log("Agents SQL storage not available");
    }
  } catch (error) {
    console.error("Error initializing storage:", error);
  }
}