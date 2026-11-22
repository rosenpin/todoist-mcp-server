import { getUserIdByTodoistId, setToken, setUserIdForTodoistId, storeOAuthState, validateAndCleanupState } from './database.js';
import { authorizationErrorRedirect } from '@cloudflare/workers-oauth-provider';
import { renderErrorPage } from './ui-loader.js';

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

// Exchanges a Todoist OAuth code, stores the token in D1, and returns our user_id for that Todoist account.
async function todoistLogin(code: string, env: any): Promise<string> {
  const tokenResponse = await fetch("https://todoist.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, code }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${await tokenResponse.text()}`);
  }
  const { access_token: accessToken } = await tokenResponse.json() as { access_token: string };
  if (!accessToken) {
    throw new Error("No access token received");
  }

  const userResponse = await fetch('https://api.todoist.com/api/v1/user', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!userResponse.ok) {
    throw new Error(`Failed to fetch user profile from Todoist: ${userResponse.status} ${await userResponse.text()}`);
  }
  const { id: todoistUserId } = await userResponse.json() as { id: string };

  const db = env.DB;
  const userId = await getUserIdByTodoistId(db, todoistUserId) ?? crypto.randomUUID();
  await setToken(db, userId, accessToken);
  await setUserIdForTodoistId(db, todoistUserId, userId);
  return userId;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// OAuth 2.1 authorize endpoint for MCP clients (Gemini etc.): consent page, then Todoist sign-in.
export async function handleAuthorize(request: Request, env: any): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === "POST") {
      const form = await request.formData();
      const handle = String(form.get("handle"));
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(request, handle);
      const { state, headers } = await oauth.beginUpstream(approved.request, { headers: approved.headers });
      const todoistUrl = new URL("https://todoist.com/oauth/authorize");
      todoistUrl.searchParams.set("client_id", env.CLIENT_ID);
      todoistUrl.searchParams.set("scope", "data:read_write");
      todoistUrl.searchParams.set("state", state);
      headers.set("Location", todoistUrl.toString());
      return new Response(null, { status: 302, headers });
    }

    const authRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authRequest);
    const consent = await oauth.beginConsent(authRequest);
    const name = escapeHtml(details.clientName || "An app");
    consent.headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(`<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Todoist</title>
<style>body{font:16px system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}button{font:inherit;padding:.5rem 1rem;margin-right:.5rem}</style>
<h1>Allow ${name} to access your Todoist?</h1>
<p>${details.clientDomain ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.` : "This app registered itself; its name is not verified."}
Access will be sent to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? "<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started signing in from it.</p>" : ""}
<p>You'll sign in with Todoist next. The app will be able to read and change your tasks and projects.</p>
<form method="post"><input type="hidden" name="handle" value="${escapeHtml(consent.handle)}">
<button name="decision" value="approve">Allow</button><button name="decision" value="deny">Deny</button></form>`,
      { headers: consent.headers });
  } catch (error: any) {
    if (error?.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error?.name === "AuthorizationError" || error?.name === "CimdFetchError") {
      return new Response(renderErrorPage("Authorization Error", error.description ?? "This app could not be verified."), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }
    throw error;
  }
}

export async function handleOAuthCallback(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  try {
    if (!state) {
      throw new Error("Missing state parameter");
    }

    // Sign-in started from our own setup page
    if (await validateAndCleanupState(env.DB, state)) {
      if (!code) throw new Error("Missing authorization code");
      const userId = await todoistLogin(code, env);
      return new Response(null, { status: 302, headers: { "Location": `/?user_id=${userId}` } });
    }

    // Sign-in started by an MCP client at /authorize
    const oauth = env.OAUTH_PROVIDER;
    const { request: authRequest, headers } = await oauth.finishUpstream(request);
    if (!code) {
      headers.set("Location", authorizationErrorRedirect(authRequest, "access_denied"));
      return new Response(null, { status: 302, headers });
    }
    const userId = await todoistLogin(code, env);
    const { redirectTo } = await oauth.completeAuthorization({
      request: authRequest,
      userId,
      metadata: {},
      scope: authRequest.scope,
      props: { userId },
    });
    headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const errorMessage = (error as any)?.description ?? (error instanceof Error ? error.message : "OAuth failed");
    return new Response(renderErrorPage("OAuth Error", errorMessage), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }
}
