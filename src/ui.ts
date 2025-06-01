export function renderOAuthSetupPage(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><title>Todoist MCP Server - Setup</title></head>
    <body>
      <h1>🚀 Todoist MCP Server Setup</h1>
      <p>Connect your Todoist account to get a personalized integration URL for Claude.</p>
      
      <div style="max-width: 500px;">
        <h2>🔐 Secure OAuth Setup:</h2>
        <p>We'll securely connect to your Todoist account using OAuth 2.0 - no need to handle API tokens manually!</p>
        
        <a href="/auth" style="display: inline-block; padding: 15px 30px; background: #e44332; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
          🔗 Connect with Todoist
        </a>
        
        <h3>📝 What happens next:</h3>
        <ol>
          <li>You'll be redirected to Todoist to authorize access</li>
          <li>We'll create your personalized MCP integration URL</li>
          <li>Add the URL to Claude to start using Todoist tools!</li>
        </ol>
      </div>
      
      <p><strong>Privacy:</strong> We only request the minimum permissions needed and your data stays secure.</p>
    </body>
    </html>
  `;
}

export function renderSuccessPage(baseUrl: string, userId: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><title>Todoist MCP Server - Ready!</title></head>
    <body>
      <h1>✅ Your Todoist MCP Server is Ready!</h1>
      <p>Your personal integration URL:</p>
      <input type="text" value="${baseUrl}/?user_id=${userId}" readonly style="width: 100%; padding: 10px; font-family: monospace; background: #f0f0f0;">
      
      <h2>🔧 Setup Instructions:</h2>
      <ol>
        <li><strong>Copy the URL above</strong></li>
        <li>Go to Claude integrations</li>
        <li>Add the copied URL as a new MCP server</li>
        <li>Start using Todoist tools in Claude!</li>
      </ol>

      <h2>📋 Available Tools:</h2>
      <ul>
        <li><strong>Tasks:</strong> get_tasks, create_task, update_task, complete_task, uncomplete_task</li>
        <li><strong>Projects:</strong> list_projects, create_project, update_project, delete_project</li>
        <li><strong>Sections:</strong> get_sections, create_section</li>
        <li><strong>Labels:</strong> get_labels, create_label</li>
        <li><strong>Comments:</strong> get_comments, create_comment</li>
      </ul>

      <p><a href="/">← Set up another token</a></p>
    </body>
    </html>
  `;
}

export function renderErrorPage(title: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><title>${title}</title></head>
    <body>
      <h1>❌ ${title}</h1>
      <p><strong>Error:</strong> ${message}</p>
      <p><a href="/">← Try again</a></p>
    </body>
    </html>
  `;
}