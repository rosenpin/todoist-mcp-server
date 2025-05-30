export const getAuthPageHtml = (baseUrl: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todoist MCP Server - Create Integration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 40px;
        }
        h1 {
            color: #E44332;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
        }
        input[type="password"] {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
            box-sizing: border-box;
        }
        button {
            background-color: #E44332;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
            width: 100%;
        }
        button:hover {
            background-color: #d13b2a;
        }
        .error {
            color: #d32f2f;
            margin-top: 10px;
            padding: 10px;
            background-color: #ffebee;
            border-radius: 4px;
            display: none;
        }
        .success {
            color: #2e7d32;
            margin-top: 10px;
            padding: 10px;
            background-color: #e8f5e9;
            border-radius: 4px;
            display: none;
        }
        .info {
            background-color: #e3f2fd;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .info a {
            color: #1976d2;
            text-decoration: none;
        }
        .info a:hover {
            text-decoration: underline;
        }
        .integration-url {
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            word-break: break-all;
            font-family: monospace;
            font-size: 14px;
            margin-top: 10px;
        }
        .copy-button {
            background-color: #666;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            margin-top: 10px;
        }
        .copy-button:hover {
            background-color: #555;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Todoist MCP Server</h1>
        <p class="subtitle">Create an integration to use Todoist with Claude</p>
        
        <div class="info">
            To get your Todoist API token:
            <ol>
                <li>Go to <a href="https://app.todoist.com/app/settings/integrations/developer" target="_blank">Todoist Settings → Integrations → Developer</a></li>
                <li>Copy your personal API token</li>
                <li>Paste it below</li>
            </ol>
        </div>
        
        <form id="integrationForm">
            <label for="todoistToken">Todoist API Token</label>
            <input type="password" id="todoistToken" name="todoistToken" placeholder="Enter your Todoist API token" required>
            
            <button type="submit">Create Integration</button>
        </form>
        
        <div id="error" class="error"></div>
        <div id="success" class="success">
            <strong>Integration created successfully!</strong>
            <p>Use this URL in Claude's integration settings:</p>
            <div id="integrationUrl" class="integration-url"></div>
            <button type="button" class="copy-button" onclick="copyUrl()">Copy URL</button>
        </div>
    </div>
    
    <script>
        const form = document.getElementById('integrationForm');
        const errorDiv = document.getElementById('error');
        const successDiv = document.getElementById('success');
        const integrationUrlDiv = document.getElementById('integrationUrl');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const todoistToken = document.getElementById('todoistToken').value;
            
            errorDiv.style.display = 'none';
            successDiv.style.display = 'none';
            
            try {
                const response = await fetch('/auth/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ todoist_token: todoistToken })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    integrationUrlDiv.textContent = data.integration_url;
                    successDiv.style.display = 'block';
                    form.reset();
                } else {
                    errorDiv.textContent = data.error || 'Failed to create integration';
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'Network error: ' + error.message;
                errorDiv.style.display = 'block';
            }
        });
        
        function copyUrl() {
            const url = document.getElementById('integrationUrl').textContent;
            navigator.clipboard.writeText(url).then(() => {
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            });
        }
    </script>
</body>
</html>
`;