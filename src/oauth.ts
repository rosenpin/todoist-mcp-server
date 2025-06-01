import { storeOAuthState, validateAndCleanupState, setToken, getUserIdByTodoistId, setUserIdForTodoistId } from './database.js';
import { renderErrorPage } from './ui.js';

export async function handleOAuthInit(url: URL, env: any): Promise<Response> {
  const state = crypto.randomUUID();
  const clientId = env.CLIENT_ID;
  
  if (!clientId) {
    return new Response("OAuth not configured - CLIENT_ID missing", { status: 500 });
  }

  // Store state for validation
  const db = env.DB;
  if (db) {
    await storeOAuthState(db, state);
  }

  const authUrl = new URL("https://todoist.com/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", "data:read_write");
  authUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      "Location": authUrl.toString(),
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function handleOAuthCallback(url: URL, env: any): Promise<Response> {
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    
    if (!code || !state) {
      throw new Error("Missing authorization code or state");
    }

    // Validate state
    const db = env.DB;
    if (db) {
      const isValidState = await validateAndCleanupState(db, state);
      if (!isValidState) {
        throw new Error("Invalid or expired state parameter");
      }
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://todoist.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error("No access token received");
    }

    // Fetch user profile to get Todoist user ID using API v1
    const userResponse = await fetch('https://api.todoist.com/api/v1/user', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error(`Todoist user API failed: ${userResponse.status} - ${errorText}`);
      throw new Error(`Failed to fetch user profile from Todoist: ${userResponse.status} ${errorText}`);
    }

    const userData = await userResponse.json() as { id: string, full_name: string };
    const todoistUserId = userData.id;

    let userId: string;
    
    if (db) {
      // Check if user already exists
      const existingUserId = await getUserIdByTodoistId(db, todoistUserId);
      
      if (existingUserId) {
        // User exists, update their token and use existing userId
        userId = existingUserId;
        await setToken(db, userId, accessToken);
        console.log(`Updated OAuth token for returning user ${userId} (Todoist ID: ${todoistUserId}) in D1`);
      } else {
        // New user, create new userId and store mappings
        userId = crypto.randomUUID();
        await setToken(db, userId, accessToken);
        await setUserIdForTodoistId(db, todoistUserId, userId);
        console.log(`Stored OAuth token for new user ${userId} (Todoist ID: ${todoistUserId}) in D1`);
      }
    } else {
      // Fallback if no database
      userId = crypto.randomUUID();
    }

    // Redirect to success page
    return new Response(null, {
      status: 302,
      headers: {
        "Location": `/?user_id=${userId}`,
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "OAuth failed";
    return new Response(renderErrorPage("OAuth Error", errorMessage), {
      status: 400,
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export function handleOAuthDiscovery(url: URL): Response {
  return new Response(JSON.stringify({
    issuer: url.origin,
    authorization_endpoint: `${url.origin}/auth`,
    token_endpoint: `${url.origin}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
  }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}