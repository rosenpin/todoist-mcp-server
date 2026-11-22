// Templates are pre-built from public/ by scripts/build-templates.js
import { templates } from './ui-templates-generated.js';

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const favicon = templates.favicon;

export function renderOAuthSetupPage(origin: string): string {
  return templates.oauthSetup.replaceAll('{{ORIGIN}}', escapeHtml(origin));
}

export function renderSuccessPage(baseUrl: string, userId: string): string {
  const mcpUrl = `${baseUrl}/?user_id=${encodeURIComponent(userId)}`;
  return templates.success
    .replaceAll('{{MCP_URL}}', escapeHtml(mcpUrl))
    .replaceAll('{{ORIGIN}}', escapeHtml(baseUrl))
    .replaceAll('{{USER_ID}}', escapeHtml(userId));
}

export function renderErrorPage(title: string, message: string): string {
  return templates.error
    .replaceAll('{{TITLE}}', escapeHtml(title))
    .replaceAll('{{MESSAGE}}', escapeHtml(message));
}

export function renderConsentPage(d: {
  clientName?: string; clientDomain?: string; redirectHost: string; redirectIsLoopback?: boolean; handle: string;
}): string {
  const loopbackNote = d.redirectIsLoopback
    ? '<p class="note">This sends access to an app on your computer. Continue only if you just started signing in from it.</p>'
    : '';
  return templates.consent
    .replaceAll('{{CLIENT_NAME}}', escapeHtml(d.clientName || 'an app'))
    .replaceAll('{{PUBLISHER}}', d.clientDomain ? escapeHtml(d.clientDomain) : 'Unverified (the app registered itself)')
    .replaceAll('{{REDIRECT_HOST}}', escapeHtml(d.redirectHost))
    .replaceAll('{{HANDLE}}', escapeHtml(d.handle))
    .replace('{{LOOPBACK_NOTE}}', loopbackNote);
}
