export function renderOAuthSetupPage(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Connect Todoist to Claude - MCP Server Setup</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #CD7F32 0%, #e44332 100%);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px;
          color: #333;
        }
        
        .header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
          text-align: center;
        }
        
        .logo {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          flex-shrink: 0;
        }
        
        .logo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .plus-icon {
          color: white;
          font-size: 20px;
          font-weight: 300;
          margin: 0 8px;
        }
        
        .header-title {
          color: white;
          font-size: 32px;
          font-weight: 600;
          text-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .main-card {
          background: white;
          border-radius: 16px;
          padding: 48px;
          max-width: 600px;
          width: 100%;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          text-align: center;
        }
        
        .main-title {
          font-size: 28px;
          font-weight: 600;
          color: #1a202c;
          margin-bottom: 16px;
        }
        
        .subtitle {
          font-size: 16px;
          color: #4a5568;
          margin-bottom: 40px;
          line-height: 1.6;
        }
        
        .connect-btn {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(135deg, #e44332 0%, #c53030 100%);
          color: white;
          padding: 16px 32px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 600;
          font-size: 16px;
          transition: all 0.2s ease;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(228, 67, 50, 0.24);
          margin-bottom: 40px;
        }
        
        .connect-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(228, 67, 50, 0.32);
        }
        
        .connect-btn svg {
          width: 20px;
          height: 20px;
        }
        
        .steps {
          text-align: left;
          margin-bottom: 32px;
        }
        
        .steps-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a202c;
          margin-bottom: 24px;
          text-align: center;
        }
        
        .steps ol {
          list-style: none;
          counter-reset: step-counter;
        }
        
        .steps li {
          counter-increment: step-counter;
          margin-bottom: 16px;
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }
        
        .steps li::before {
          content: counter(step-counter);
          background: linear-gradient(135deg, #CD7F32 0%, #e44332 100%);
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 12px;
          flex-shrink: 0;
          margin-top: 2px;
        }
        
        .step-text {
          color: #2d3748;
          line-height: 1.5;
          font-size: 14px;
        }
        
        .privacy-note {
          background: #f7fafc;
          border-radius: 8px;
          padding: 16px;
          color: #4a5568;
          font-size: 14px;
          line-height: 1.5;
          border-left: 4px solid #48bb78;
          text-align: left;
        }
        
        @media (max-width: 640px) {
          body {
            padding: 16px;
          }
          
          .header {
            flex-direction: column;
            gap: 16px;
            margin-bottom: 24px;
          }
          
          .header-title {
            font-size: 24px;
          }
          
          .main-card {
            padding: 32px 24px;
          }
          
          .main-title {
            font-size: 24px;
          }
          
          .subtitle {
            font-size: 15px;
            margin-bottom: 32px;
          }
          
          .connect-btn {
            width: 100%;
            justify-content: center;
            font-size: 15px;
            padding: 14px 24px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAACAKADAAQAAAABAAACAAAAAAAL+LWFAABAAElEQVR4Ae29XaxdV3nvPffGTuLkeONj51OmJkkbcwIC572gUbBK9Ko9EVEwXJxCJIhwhYTUkx5BdERQb1BT5Qad5JWgUlOkSKhBgAS0F9QgOJToVaiSvISbhIpGcVriuPiQkNiY7SZOsh3vd/2X99iee+451/wc378h2Wuu+TE+fs9cezzjGc94RlGQIAABCEAAAhDIjsBCdi2OqMFPffbANVuLC353WuWFxevKVV9YXb2x/L1YXLhpw3e+QAACELBF4Ozq4+WsVxcWflL+XqyefVbfV4o3/m3f/Yee23CNL8EQQAHwLIr1Tn7Swa936uc6872eq0bxEIAABMYicLhYUxqmysJEQUA5GAtt/3xQAPqz6/zkv3z2v/1RYTp6OvnO/HgAAhBIksBUOTCKwTvv//sfJdnKABuFAmBRKNPR/cJFH5iO7BcXDlosiqwhAAEIpEPg7OpDUghWVl/7AVMI9sSKAjAiWzr8EWGSFQQgAAFDAIXAkBj1EwVgIE6Z9ReKhTsmTniM8Aey5HEIQAACrQhIIShWv8Z0QiatTehANSiqb+gkb/+LO3bv1z6P8didT3PRh0xOAdAZnOw6++Z9fvXzE/PXLFy9euP0c1Z9YXn5vHmfZ9LK1jYaAAEIWCaweuaf56jX8YRBN0wYi1J8Bxj1d9S2wag/6n+sXT6HKfxQ7sPhOgQ6EdjZ2dsv/6yP3bM43L42dNvn/QTNMAGYvlr+QQJQAFAj7T62OuPK/wAAAABJRU5ErkJggg==\" alt=\"Claude\" />
        </div>
        <div class="plus-icon">+</div>
        <div class="logo">
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAeAAAAHgCAYAAAB91L6VAAAACXBIWXMAAAsTAAALEwEAmpwYAAAUbklEQVR4nO3dW7CkR3nf8TYgcZUQkkAWuoDQDQmQBDNPz9njFaPpnrNajMBJxVskpCzjG4lxbJdTSeFUyhG4bBC+IogTk9hxTFJ2osSmbBkbIoO5SOgCGIQQ6IKEBJJA7Gr3nOmec3Q/qZ6zWktCK53LO+87/P+P1VPlUp/nXnm093U/qZ6zWktCK53LO+875+IzxCBEDwgA2SADm1+4LI2FjxhAAei0Bj4kgAyQATKglYGyFnAZa1N71Y2Fp2qNnyfWuwXSUP6W5T442bXrmesDI+lhW7p9OJjmL5+8W5Z2dE/NUD8C3I5JfLSNk1vXh98H+8oaSfvLz5WuLJABJkANr+JW1vVJjIJhkQ+z3+J4l7VNZf8EtvdtJYcvNXXQ6x4yzgXMBMwAyAS8oQzIPH0OvKdcHvTenGOXFQHfYhJmwKhDBta7XCLk4F8aBX+u7WTv6J5Q3m1LUZa1LySKHjABb/yOHn8g18cO8jHNGa/B1l+GIvMvO4udf8bSQP5fFOSbFP2nJ2HKHSADZGCJHOUrTr6u5j2kq3uQGKIAGAqEakLJOwD10Nx72xU2o8E53gMt9bKWl3fVfClFeSDKSvnHhJ23L3JfI7xLvFW8Y7xrvHv8g3DLEQQgAAFNAvKO6l+lhfDdlGXELz0NhUP7Dl5qf58S+7vHMxrFq2YKZBjJ1zdKKVfvHdYO5YjE94mABwHr6EEgDa3zVgZm8mJIKrx7qtddGJfHmEQ72DZq0qCXO7wUPRgzA+xW1QYvMEoTD5YUyFGSSPfW3WOz65/nIq8xJzDPzfZYqXQG7u7p+rOSQzgWHjABq1QLjbwlHoJtJ0aBST5HAKlKPZo4rEhPYgBnXdRmEkA2yACz7JqZrRm8a7x7/IOgg0DjLyB1Qf3pVpM/bxLJxLBZPpNtDzjAfY5MV/6+Rt6b0r7a8yqiJ5Y4yHOoePzRiTsOetqQE9Qz8qJiZs+9L2QZq26o8RsKM2LZuudB/6Q5g2kNMOE2K8HV2eK6r5GJlxBNhqINzAJqPwjc7qj/2kKpPfW9bZjyE0rE7LJMoiLzTpO36rryBGm7JIQ4F4ltKGOgCb7pWa7GfKdP5FZ8lBGPdgxZtEuAhGkYE0aKuaJLX5rCqU1vKXFKjmQZUQbUgFbcf3H/e0qJ5F+hx/WOzBZ1AAAAAElFTkSuQmCC\" alt=\"Todoist\" />
        </div>
      </div>
      
      <h1 class="header-title">Connect Todoist to Claude</h1>
      
      <div class="main-card">
        <h2 class="main-title">Secure OAuth Integration</h2>
        <p class="subtitle">Connect your Todoist account to create a personalized MCP server URL for Claude.</p>
        
        <a href="/auth" class="connect-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17,7H22V17H17V19A1,1 0 0,0 18,20H20V22H17.5C16.95,22 16,21.55 16,21C16,21.55 15.05,22 14.5,22H12V20H14A1,1 0 0,0 15,19V5A1,1 0 0,0 14,4H12V2H14.5C15.05,2 16,2.45 16,3C16,2.45 16.95,2 17.5,2H20V4H18A1,1 0 0,0 17,5V7M2,7H13V9H4V15H13V17H2V7M20,9H17V15H20V9M7.5,13A1.5,1.5 0 0,1 6,11.5A1.5,1.5 0 0,1 7.5,10A1.5,1.5 0 0,1 9,11.5A1.5,1.5 0 0,1 7.5,13Z"/>
          </svg>
          Connect with Todoist
        </a>
        
        <div class="steps">
          <div class="steps-title">What happens next</div>
          <ol>
            <li><span class="step-text">You'll be securely redirected to Todoist to authorize access</span></li>
            <li><span class="step-text">We'll generate your personal MCP integration URL</span></li>
            <li><span class="step-text">Add the URL to Claude to start using Todoist tools</span></li>
          </ol>
        </div>
        
        <div class="privacy-note">
          <strong>Privacy & Security:</strong> We use OAuth 2.0 for secure authentication. Only read/write permissions for your tasks and projects are requested. Your credentials are never stored on our servers.
        </div>
      </div>
    </body>
    </html>
  `;
}

export function renderSuccessPage(baseUrl: string, userId: string): string {
  const integrationUrl = `${baseUrl}/?user_id=${userId}`;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Success! Your Todoist-Claude Integration is Ready</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          color: #333;
        }
        
        .success-icon {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        
        .success-icon svg {
          width: 40px;
          height: 40px;
          fill: #10b981;
        }
        
        .header-title {
          color: white;
          font-size: 32px;
          font-weight: 700;
          text-align: center;
          margin-bottom: 40px;
          text-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        
        .main-card {
          background: white;
          border-radius: 16px;
          padding: 40px;
          max-width: 700px;
          width: 100%;
          box-shadow: 0 10px 50px rgba(0,0,0,0.15);
        }
        
        .url-section {
          margin-bottom: 32px;
        }
        
        .url-label {
          font-size: 18px;
          font-weight: 700;
          color: #2d3748;
          margin-bottom: 12px;
        }
        
        .url-container {
          position: relative;
          margin-bottom: 16px;
        }
        
        .url-input {
          width: 100%;
          padding: 16px 60px 16px 16px;
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', Consolas, 'Courier New', monospace;
          font-size: 14px;
          background: #f8fafc;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          color: #4a5568;
          word-break: break-all;
        }
        
        .copy-btn {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: #4299e1;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s ease;
        }
        
        .copy-btn:hover {
          background: #3182ce;
        }
        
        .copy-btn.copied {
          background: #48bb78;
        }
        
        .security-warning {
          background: linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%);
          border: 2px solid #f6ad55;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 32px;
        }
        
        .security-warning-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          color: #c05621;
          margin-bottom: 12px;
          font-size: 16px;
        }
        
        .security-warning-text {
          color: #9c4221;
          font-size: 14px;
          line-height: 1.6;
        }
        
        .instructions {
          margin-bottom: 32px;
        }
        
        .instructions-title {
          font-size: 22px;
          font-weight: 700;
          color: #2d3748;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .instructions ol {
          list-style: none;
          counter-reset: step-counter;
        }
        
        .instructions li {
          counter-increment: step-counter;
          margin-bottom: 16px;
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }
        
        .instructions li::before {
          content: counter(step-counter);
          background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
          flex-shrink: 0;
        }
        
        .step-text {
          color: #4a5568;
          line-height: 1.6;
          padding-top: 4px;
        }
        
        .tools-section {
          background: #f8fafc;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 32px;
        }
        
        .tools-title {
          font-size: 20px;
          font-weight: 700;
          color: #2d3748;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .tools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }
        
        .tool-category {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        
        .tool-category-title {
          font-weight: 600;
          color: #2d3748;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .tool-list {
          font-size: 12px;
          color: #718096;
          line-height: 1.4;
        }
        
        .footer-actions {
          display: flex;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        
        .btn {
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        
        .btn-secondary {
          background: #f7fafc;
          color: #4a5568;
          border: 1px solid #e2e8f0;
        }
        
        .btn-secondary:hover {
          background: #edf2f7;
        }
        
        @media (max-width: 768px) {
          .header-title {
            font-size: 24px;
          }
          
          .main-card {
            padding: 24px;
            margin: 0 16px;
          }
          
          .url-input {
            font-size: 12px;
            padding-right: 50px;
          }
          
          .copy-btn {
            padding: 6px 8px;
            font-size: 11px;
          }
          
          .tools-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <div class="success-icon">
        <svg viewBox="0 0 24 24">
          <path d="M20.5 6.5L9 18L3.5 12.5L5 11L9 15L19 5L20.5 6.5Z"/>
        </svg>
      </div>
      
      <h1 class="header-title">🎉 Your Integration is Ready!</h1>
      
      <div class="main-card">
        <div class="url-section">
          <div class="url-label">Your Personal MCP Integration URL</div>
          <div class="url-container">
            <input type="text" class="url-input" value="${integrationUrl}" readonly id="integrationUrl">
            <button class="copy-btn" onclick="copyToClipboard()" id="copyBtn">Copy</button>
          </div>
        </div>
        
        <div class="security-warning">
          <div class="security-warning-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1M10 17L6 13L7.41 11.59L10 14.17L16.59 7.58L18 9L10 17Z"/>
            </svg>
            🔒 Keep This URL Private & Secure
          </div>
          <div class="security-warning-text">
            <strong>This URL provides direct access to your Todoist account.</strong> Never share it publicly, in screenshots, or with unauthorized people. Treat it like a password - anyone with this URL can read and modify your Todoist data.
          </div>
        </div>
        
        <div class="instructions">
          <div class="instructions-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            Setup Instructions
          </div>
          <ol>
            <li><span class="step-text"><strong>Copy the URL above</strong> using the copy button</span></li>
            <li><span class="step-text"><strong>Open Claude</strong> and go to Settings → Integrations → MCP Servers</span></li>
            <li><span class="step-text"><strong>Add a new MCP server</strong> and paste your integration URL</span></li>
            <li><span class="step-text"><strong>Start using Todoist tools</strong> in your Claude conversations!</span></li>
          </ol>
        </div>
        
        <div class="tools-section">
          <div class="tools-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.7 19L13.6 9.9C14.5 7.6 14 4.9 12.1 3C10.1 1 7.1 0.6 4.7 1.7L9 6L6 9L1.6 4.7C0.4 7.1 0.9 10.1 2.9 12.1C4.8 14 7.5 14.5 9.8 13.6L18.9 22.7C19.3 23.1 19.9 23.1 20.3 22.7L22.6 20.4C23.1 20 23.1 19.3 22.7 19Z"/>
            </svg>
            Available Todoist Tools
          </div>
          <div class="tools-grid">
            <div class="tool-category">
              <div class="tool-category-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19Z"/>
                </svg>
                Tasks
              </div>
              <div class="tool-list">get_tasks, create_task, update_task, complete_task, uncomplete_task</div>
            </div>
            <div class="tool-category">
              <div class="tool-category-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
                </svg>
                Projects
              </div>
              <div class="tool-list">list_projects, create_project, update_project, delete_project</div>
            </div>
            <div class="tool-category">
              <div class="tool-category-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,5V19H5V5H19M17,17H7V15H17V17M17,13H7V11H17V13M17,9H7V7H17V9Z"/>
                </svg>
                Sections
              </div>
              <div class="tool-list">get_sections, create_section</div>
            </div>
            <div class="tool-category">
              <div class="tool-category-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.63,5.84C17.27,5.33 16.67,5 16,5L5,5.01C3.9,5.01 3,5.9 3,7V17C3,18.1 3.9,19 5,19H16C16.67,19 17.27,18.67 17.63,18.16L22,12L17.63,5.84Z"/>
                </svg>
                Labels
              </div>
              <div class="tool-list">get_labels, create_label</div>
            </div>
            <div class="tool-category">
              <div class="tool-category-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22H9Z"/>
                </svg>
                Comments
              </div>
              <div class="tool-list">get_comments, create_comment</div>
            </div>
          </div>
        </div>
        
        <div class="footer-actions">
          <a href="/" class="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19,7V4H5V7H19M21,2A2,2 0 0,1 23,4V20A2,2 0 0,1 21,22H3A2,2 0 0,1 1,20V4A2,2 0 0,1 3,2H21M19,9H5V20H19V9Z"/>
            </svg>
            Set Up Another Integration
          </a>
        </div>
      </div>
      
      <script>
        function copyToClipboard() {
          const urlInput = document.getElementById('integrationUrl');
          const copyBtn = document.getElementById('copyBtn');
          
          urlInput.select();
          urlInput.setSelectionRange(0, 99999);
          navigator.clipboard.writeText(urlInput.value).then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
              copyBtn.classList.remove('copied');
            }, 2000);
          });
        }
      </script>
    </body>
    </html>
  `;
}

export function renderErrorPage(title: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Todoist MCP Server</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          color: #333;
        }
        
        .error-icon {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        
        .error-icon svg {
          width: 40px;
          height: 40px;
          fill: #e53e3e;
        }
        
        .header-title {
          color: white;
          font-size: 32px;
          font-weight: 700;
          text-align: center;
          margin-bottom: 40px;
          text-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        
        .main-card {
          background: white;
          border-radius: 16px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 10px 50px rgba(0,0,0,0.15);
          text-align: center;
        }
        
        .error-message {
          font-size: 16px;
          color: #4a5568;
          line-height: 1.6;
          margin-bottom: 32px;
          padding: 20px;
          background: #fef5e7;
          border-radius: 8px;
          border-left: 4px solid #f6ad55;
          text-align: left;
        }
        
        .error-label {
          font-weight: 700;
          color: #c05621;
          margin-bottom: 8px;
        }
        
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
          color: white;
          padding: 14px 28px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(66, 153, 225, 0.3);
        }
        
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(66, 153, 225, 0.4);
        }
        
        @media (max-width: 768px) {
          .header-title {
            font-size: 24px;
          }
          
          .main-card {
            padding: 24px;
            margin: 0 16px;
          }
        }
      </style>
    </head>
    <body>
      <div class="error-icon">
        <svg viewBox="0 0 24 24">
          <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
        </svg>
      </div>
      
      <h1 class="header-title">${title}</h1>
      
      <div class="main-card">
        <div class="error-message">
          <div class="error-label">Error Details:</div>
          ${message}
        </div>
        
        <a href="/" class="btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z"/>
          </svg>
          Try Again
        </a>
      </div>
    </body>
    </html>
  `;
}