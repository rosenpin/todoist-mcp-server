// UI loader that serves HTML templates with dynamic content injection
// Templates are pre-built by scripts/build-templates.js

import { templates } from './ui-templates-generated.js';

export function renderOAuthSetupPage(): string {
  // OAuth setup page is static, no dynamic content needed
  return templates.oauthSetup;
}

export function renderSuccessPage(baseUrl: string, userId: string, subscriptionStatus?: any): string {
  const integrationUrl = `${baseUrl}/?user_id=${userId}`;
  const isSubscriptionActive = subscriptionStatus?.isActive || false;
  
  let html = templates.success;
  
  // Generate subscription status HTML
  let subscriptionStatusHtml = '';
  if (isSubscriptionActive) {
    subscriptionStatusHtml = [
      '<div class="bg-green-50 border-2 border-green-200 rounded-xl p-4">',
      '  <div class="flex items-center gap-2 text-green-700 font-semibold mb-2">',
      '    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">',
      '      <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.41,10.09L6,11.5L11,16.5Z"/>',
      '    </svg>',
      '    ✅ Subscription Active',
      '  </div>',
      '  <p class="text-green-600 text-sm">Your subscription is active and all Todoist tools are available!</p>',
      '</div>'
    ].join('\n');
  } else {
    subscriptionStatusHtml = [
      '<div class="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">',
      '  <div class="flex items-center gap-2 text-orange-700 font-semibold mb-2">',
      '    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">',
      '      <path d="M12,2L13.09,8.26L22,9L13.09,9.74L12,16L10.91,9.74L2,9L10.91,8.26L12,2Z"/>',
      '    </svg>',
      '    🎁 Free Trial Available',
      '  </div>',
      '  <p class="text-orange-600 text-sm mb-3">',
      '    Start your <strong>3-day free trial</strong> to access all Todoist tools! Only <strong>$2.99/month</strong> after trial.',
      '  </p>',
      '  <button onclick="createSubscription()"',
      '          class="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg transition-all duration-200"',
      '          id="subscribeBtn">',
      '    Start Free Trial',
      '  </button>',
      '</div>'
    ].join('\n');
  }

  // Generate URL section HTML
  let urlSectionHtml = '';
  if (!isSubscriptionActive) {
    urlSectionHtml = [
      '<div class="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 mb-4">',
      '  <div class="flex items-center gap-2 text-gray-600 font-semibold mb-2">',
      '    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">',
      '      <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,7C13.1,7 14,7.9 14,9C14,10.1 13.1,11 12,11C10.9,11 10,10.1 10,9C10,7.9 10.9,7 12,7M12,17C9.97,17 8.17,15.85 7.29,14.14C7.82,13.5 9.94,13 12,13C14.06,13 16.18,13.5 16.71,14.14C15.83,15.85 14.03,17 12,17Z"/>',
      '    </svg>',
      '    Subscription Required',
      '  </div>',
      '  <p class="text-gray-600 text-sm">',
      '    Your integration URL is ready, but you\'ll need an active subscription to use the Todoist tools.',
      '    Start your free trial above to unlock all features!',
      '  </p>',
      '</div>'
    ].join('\n');
  }

  const urlInputHtml = [
    urlSectionHtml,
    '<div class="relative mb-4">',
    '  <input type="text"',
    `         class="w-full p-4 pr-16 font-mono text-sm bg-gray-50 border-2 border-gray-200 rounded-lg text-gray-700 break-all ${!isSubscriptionActive ? 'filter blur-sm' : ''}"`,
    `         value="${integrationUrl}"`,
    '         readonly',
    '         id="integrationUrl">',
    `  <button class="absolute right-2 top-1/2 -translate-y-1/2 ${isSubscriptionActive ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400 cursor-not-allowed'} text-white px-3 py-2 rounded text-xs font-semibold transition-colors"`,
    `          onclick="${isSubscriptionActive ? 'copyToClipboard()' : 'alert(\"Please activate your subscription first\")'}"`,
    '          id="copyBtn"',
    `          ${!isSubscriptionActive ? 'disabled' : ''}>`,
    `    ${isSubscriptionActive ? 'Copy' : 'Locked'}`,
    '  </button>',
    '</div>',
    !isSubscriptionActive ? [
      '<div class="text-center">',
      '  <p class="text-gray-500 text-sm italic">URL will be revealed after subscription activation</p>',
      '</div>'
    ].join('\n') : ''
  ].join('\n');

  // Replace placeholders
  html = html.replace('<!-- {{SUBSCRIPTION_STATUS}} placeholder will be replaced by server -->', subscriptionStatusHtml);
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