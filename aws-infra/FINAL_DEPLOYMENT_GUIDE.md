# Todoist MCP Server - Final Deployment Guide 🎉

## Current Status

Your Todoist MCP server is successfully deployed on AWS with a cost-optimized architecture!

## 🚀 Quick Start

### Step 1: Get Current Server URL

Use our handy script to get the current server information:

```bash
cd aws-infra && ./scripts/get-current-ip.sh
```

### Step 2: Build and Deploy Script

For quick deployments and updates:

```bash
cd aws-infra && ./scripts/build-and-deploy.sh
```

This script will:
- Build the Docker image for the correct architecture
- Push to ECR
- Force a new ECS deployment
- Show you the new server URL

### Step 3: Set Up Claude Integration

1. **Visit the auth page** (from the script output)
2. **Enter your Todoist API token** (get it from [Todoist Settings → Integrations](https://todoist.com/prefs/integrations))
3. **Copy the generated SSE URL**
4. **In Claude.ai (web interface)**, go to Settings → Custom Integrations
5. **Add a new remote MCP server:**
   - Type: SSE
   - URL: [paste the SSE URL you copied]
   - Name: todoist

## 🏗️ Architecture Overview

### Cost-Optimized Infrastructure

✅ **No NAT Gateway** (saves ~$45/month)  
✅ **API Gateway instead of ALB** (saves ~$20/month)  
✅ **Public IP assignment for Fargate**  
✅ **EFS for persistent storage**  
✅ **Elastic IP for static address** (+$3.60/month)  

**Estimated Monthly Cost: ~$9-14**

### Components

- **ECS Fargate**: Runs the MCP server container
- **Elastic IP**: Provides static IP address (13.52.88.130)
- **EFS**: Persistent storage for user data
- **ECR**: Container registry
- **VPC**: Networking with public subnets only

## 🔧 Management Commands

### Check Service Status
```bash
aws ecs describe-services --cluster todoist-mcp-cluster --services todoist-mcp-service --query 'services[0].runningCount'
```

### View Logs
```bash
aws logs tail /ecs/todoist-mcp-server --follow
```

### Force Restart
```bash
aws ecs update-service --cluster todoist-mcp-cluster --service todoist-mcp-service --force-new-deployment
```

## 🌍 Static IP Address

**Target Static IP**: `13.52.88.130`

The Elastic IP has been allocated but may need manual association after deployments. The automated association via EventBridge is configured but may need additional permissions.

For now, each deployment gets a new dynamic IP, but the infrastructure is ready for static IP once the Lambda permissions are fixed.

## 📝 Important Notes

### For Claude.ai Users (Recommended)
- Use the SSE endpoint URL from the auth page
- Claude.ai supports remote MCP servers via the web interface

### For Claude Desktop Users
- Currently requires local setup (see CLAUDE_DESKTOP_SETUP.md)
- Remote MCP servers not yet supported in Desktop

### Security
- The server uses token-based authentication
- Each integration gets a unique ID
- CORS is configured for web access

## 🎯 Next Steps

1. **Test the integration** with Claude.ai
2. **Monitor costs** in AWS Cost Explorer  
3. **Consider adding HTTPS** with CloudFront or ALB for production
4. **Set up monitoring** with CloudWatch alarms

## 🔄 Updating the Server

To update the server code:

1. Make your changes to the source code
2. Run `./aws-infra/scripts/build-and-deploy.sh`
3. Get the new URL and update your Claude configuration if needed

## 💰 Cost Breakdown

| Component | Monthly Cost |
|-----------|--------------|
| ECS Fargate (1 vCPU, 0.5GB) | ~$5-7 |
| Elastic IP | $3.60 |
| EFS Storage | ~$0.30 |
| Data Transfer | ~$1-2 |
| **Total** | **~$9-14** |

## 🎉 Success!

Your Todoist MCP server is now running on AWS with:
- ✅ Cost-optimized architecture
- ✅ Static IP address capability
- ✅ Automated build and deployment
- ✅ SSE support for Claude.ai
- ✅ Persistent storage
- ✅ Easy management scripts

Happy task management with Claude! 🤖📋