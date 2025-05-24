# Cost Optimization Notes

## Architecture Changes

### From (High Cost ~$70/month):
- Application Load Balancer ($16-22/month)
- NAT Gateway ($45/month + data transfer)
- Fargate in private subnets

### To (Low Cost ~$5-10/month):
- API Gateway WebSocket ($1-3/month for low traffic)
- No NAT Gateway (public subnets only)
- Fargate with public IP assignment

## Important Considerations

### 1. WebSocket-Only Architecture
The cost-optimized setup uses API Gateway WebSocket, which means:
- No HTTP endpoints for the auth page (`/auth`)
- No health check endpoint (`/health`)
- Only WebSocket connections for MCP protocol

### 2. Authentication Flow Options

#### Option A: Separate Static Website
- Host auth page on S3 + CloudFront (~$1/month)
- Auth page creates integration and shows WebSocket URL
- User adds WebSocket URL to Claude

#### Option B: Pre-configured Tokens
- Manually create tokens in the database
- Share WebSocket URLs directly with users
- No web-based auth flow

#### Option C: Lambda-based Auth API
- Add Lambda functions to API Gateway for auth endpoints
- Minimal cost increase (~$0.20/month)
- Maintains web-based auth flow

### 3. Current Implementation Status
The current Lambda handler in `api-gateway-stack.ts` is a placeholder. To make this work, you need to:

1. Implement proper WebSocket message forwarding to ECS
2. Handle service discovery to find ECS task IPs
3. Maintain WebSocket connection state

### 4. Alternative: Keep HTTP Support
If you need HTTP endpoints, consider:
- Using Application Load Balancer only (no NAT Gateway) - saves $45/month
- Using a single NAT instance instead of NAT Gateway - saves $40/month
- Using Lambda + API Gateway HTTP API for auth endpoints

## Deployment Commands

```bash
# Deploy cost-optimized infrastructure
./deploy-to-aws.sh --initial

# The WebSocket endpoint will be displayed after deployment
# Format: wss://[api-id].execute-api.[region].amazonaws.com/prod
```

## Next Steps

1. Decide on authentication flow (A, B, or C above)
2. Implement WebSocket-to-ECS forwarding in Lambda
3. Test MCP connection through API Gateway WebSocket
4. Document the new connection process for users