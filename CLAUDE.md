# Claude memory

# todoist-mcp-server
- This is a TypeScript/Node.js project using the `agents` npm package
- The main server file is `/workspaces/todoist-mcp-server/src/index.ts`
- The server extends McpAgent from the agents package for SSE support
- Integration routing is done via query parameters (?integration_id=xxx)
- Uses Cloudflare Workers for deployment
- D1 database for persistent storage (tokens, subscriptions)

# subscription-system
- Subscription system implemented with Stripe integration
- Feature flag: SUBSCRIPTION_ENABLED (default: "false" - disabled)
- When enabled, checks user subscriptions before allowing MCP tool access
- 3-day free trial for new users
- $2.99/month recurring subscription
- Product ID: prod_SPqu4PDKiqvAlk
- Endpoints: /create-subscription, /subscription-status, /webhook/stripe
- Environment secrets needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- Database table: subscriptions (user_id, subscription_data, updated_at)
- Toggle with: wrangler secret put SUBSCRIPTION_ENABLED --env production
