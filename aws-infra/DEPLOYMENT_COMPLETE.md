# Todoist MCP Server - AWS Deployment Complete! 🎉

Your Todoist MCP server is now running on AWS in a cost-optimized configuration.

## Service Details

- **Direct URL**: `http://54.183.132.88:8765`
- **Health Check**: `http://54.183.132.88:8765/health`
- **Auth Page**: `http://54.183.132.88:8765/auth`

## Cost Breakdown (Estimated Monthly)

- ECS Fargate (1 vCPU, 0.5GB RAM): ~$5-7
- EFS Storage: ~$0.30 (minimal usage)
- Data Transfer: ~$1-2
- **Total**: ~$6-10/month

## Cost Optimizations Applied

✅ No NAT Gateway (saved $45/month)  
✅ No ALB (saved $20/month)  
✅ Direct public IP access  
✅ Minimal resource allocation  

## Setting Up Claude Integration

1. Visit the auth page: http://54.183.132.88:8765/auth
2. Create a new integration and authorize with Todoist
3. Copy the integration ID
4. In Claude Desktop, add the MCP server:

```json
{
  "mcpServers": {
    "todoist": {
      "command": "curl",
      "args": [
        "-N",
        "-H", "Accept: text/event-stream",
        "http://54.183.132.88:8765/sse/{YOUR_INTEGRATION_ID}"
      ]
    }
  }
}
```

## Important Notes

- The service has a public IP that may change on restarts
- For production use, consider:
  - Adding an Elastic IP ($3.60/month) for a static address
  - Using a domain name with Route 53
  - Adding HTTPS with an ALB or CloudFront

## Monitoring

Check service status:
```bash
aws ecs describe-services --cluster todoist-mcp-cluster --services todoist-mcp-service --query 'services[0].runningCount'
```

View logs:
```bash
aws logs tail /ecs/todoist-mcp-server --follow
```

## Next Steps

1. Test the integration with Claude
2. Monitor costs in AWS Cost Explorer
3. Consider adding a domain name for easier access