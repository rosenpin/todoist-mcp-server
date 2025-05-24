# Cost-Optimized AWS Infrastructure

This infrastructure has been optimized to reduce monthly costs from ~$70 to ~$5-10.

## Key Cost Optimizations

### 1. **No NAT Gateway** (Saves ~$45/month)
- Removed NAT Gateway by using only public subnets
- ECS tasks use public IP assignment for internet access
- No need for private subnets since tasks can communicate directly

### 2. **API Gateway WebSocket instead of ALB** (Saves ~$20/month)
- Replaced Application Load Balancer with API Gateway WebSocket
- API Gateway charges only for actual usage (connections and messages)
- WebSocket provides better real-time communication for MCP protocol

### 3. **Minimal Fargate Configuration**
- 0.25 vCPU and 0.5 GB memory (lowest tier)
- Auto-scaling from 1-3 instances based on CPU usage
- Public IP assignment (no NAT Gateway costs)

### 4. **EFS for Persistence**
- Pay only for storage used
- Lifecycle policy moves infrequent data to IA storage after 30 days
- Typically <$1/month for small datasets

## Architecture Overview

```
Internet → API Gateway WebSocket → Lambda → ECS Fargate (Public IP) → EFS
```

## Monthly Cost Breakdown (Estimated)

- **ECS Fargate**: ~$3-5/month (1 task, 0.25 vCPU, 0.5GB)
- **API Gateway**: ~$1/month (light usage)
- **EFS Storage**: <$1/month (small data)
- **Lambda**: <$1/month (minimal invocations)
- **Total**: ~$5-10/month

## Security Considerations

- ECS tasks in public subnets with security groups restricting access
- EFS encrypted at rest
- API Gateway provides DDoS protection
- Lambda functions handle WebSocket connection management

## Deployment

1. Deploy the infrastructure:
   ```bash
   cd aws-infra
   npm install
   npx cdk deploy --all
   ```

2. Build and push Docker image to ECR
3. ECS service will automatically pull and run the latest image

## Monitoring

- CloudWatch Logs for all components
- ECS task metrics and auto-scaling
- API Gateway request metrics
- Cost Explorer to track actual costs