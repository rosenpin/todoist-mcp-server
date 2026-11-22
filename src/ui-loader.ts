// Templates are pre-built from public/ by scripts/build-templates.js
import { templates } from './ui-templates-generated.js';

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const favicon = templates.favicon;

export function renderOAuthSetupPage(): string {
  return templates.oauthSetup;
}

export function renderSuccessPage(baseUrl: string, userId: string): string {
  const mcpUrl = `${baseUrl}/?user_id=${encodeURIComponent(userId)}`;
  return templates.success
    .replaceAll('{{MCP_URL}}', escapeHtml(mcpUrl))
    .replaceAll('{{USER_ID}}', escapeHtml(userId));
}

export function renderErrorPage(title: string, message: string): string {
  return templates.error
    .replaceAll('{{TITLE}}', escapeHtml(title))
    .replaceAll('{{MESSAGE}}', escapeHtml(message));
}
