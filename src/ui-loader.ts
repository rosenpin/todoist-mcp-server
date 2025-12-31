// UI loader that serves HTML templates with dynamic content injection
// Templates are pre-built by scripts/build-templates.js

import { templates } from './ui-templates-generated.js';

export function renderOAuthSetupPage(): string {
  // OAuth setup page is static, no dynamic content needed
  return templates.oauthSetup;
}

export function renderSuccessPage(baseUrl: string, userId: string): string {
  const integrationUrl = `${baseUrl}/?user_id=${userId}`;
  
  let html = templates.success;
  
  // Generate success status HTML
  const statusHtml = [
    '<div class="bg-green-50 border-2 border-green-200 rounded-xl p-4">',
    '  <div class="flex items-center gap-2 text-green-700 font-semibold mb-2">',
    '    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">',
    '      <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.41,10.09L6,11.5L11,16.5Z"/>',
    '    </svg>',
    '    ✅ Setup Complete',
    '  </div>',
    '  <p class="text-green-600 text-sm">Your Todoist MCP server is ready and all tools are available!</p>',
    '</div>'
  ].join('\n');

  const urlInputHtml = [
    '<div class="relative mb-4">',
    '  <input type="text"',
    `         class="w-full p-4 pr-16 font-mono text-sm bg-gray-50 border-2 border-gray-200 rounded-lg text-gray-700 break-all"`,
    `         value="${integrationUrl}"`,
    '         readonly',
    '         id="integrationUrl">',
    `  <button class="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-xs font-semibold transition-colors"`,
    `          onclick="copyToClipboard()"`,
    '          id="copyBtn">',
    `    Copy`,
    '  </button>',
    '</div>'
  ].join('\n');

  // Replace placeholders
  html = html.replace('<!-- {{SUBSCRIPTION_STATUS}} placeholder will be replaced by server -->', statusHtml);
  html = html.replace('<!-- {{URL_SECTION}} placeholder will be replaced by server -->', urlInputHtml);
  
  // Inject data for JavaScript
  const dataScript = [
    '<script>',
    '  // Pass data to JavaScript',
    '  window.todoistMcpData = {',
    `    userId: '${userId}',`,
    `    baseUrl: '${baseUrl}'`,
    '  };',
    '</script>'
  ].join('\n');
  
  // Insert data script before the main script
  html = html.replace('<script>\\n    // Success page functionality', dataScript + '\\n  <script>\\n    // Success page functionality');
  
  return html;
}

export function renderErrorPage(title: string, message: string): string {
  let html = templates.error;
  
  // Escape HTML to prevent XSS
  const escapeHtml = (text: string): string => {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  };
  
  // Replace placeholders
  html = html.replace(/{{TITLE}}/g, escapeHtml(title));
  html = html.replace('{{MESSAGE}}', escapeHtml(message));
  
  return html;
}