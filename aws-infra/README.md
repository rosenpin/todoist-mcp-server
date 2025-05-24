# Todoist MCP Server - AWS Infrastructure

This directory contains AWS CDK infrastructure code for deploying the Todoist MCP Server on AWS using ECS Fargate.

## Architecture

- **ECS Fargate**: Serverless container hosting
- **Application Load Balancer**: HTTPS termination and load balancing
- **EFS**: Persistent storage for TinyDB database
- **ECR**: Container registry for Docker images
- **VPC**: Isolated network environment
- **CloudWatch**: Logging and monitoring

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Node.js** and npm installed
3. **Docker** installed
4. **CDK Bootstrap** completed in target region

## Environment Variables

- `AWS_REGION`: Target AWS region (default: us-east-1)
- `ENVIRONMENT`: Environment name (default: prod)
- `DOMAIN_NAME`: Optional custom domain for SSL

## Deployment

### Initial Deployment

```bash
# From project root
./deploy-to-aws.sh --initial
```

This will:
1. Deploy all AWS infrastructure stacks
2. Build and push the Docker image to ECR
3. Deploy the ECS service
4. Output the load balancer URL

### Application Updates

```bash
# For subsequent updates
./deploy-to-aws.sh --update
```

This will:
1. Build and push a new Docker image
2. Force ECS service deployment with new image
3. Wait for deployment to complete

### Custom Domain

```bash
# Deploy with custom domain (requires DNS setup)
./deploy-to-aws.sh --initial --domain your-domain.com
```

**Note**: Since you're using Cloudflare for DNS, you'll need to:
1. Create a CNAME record pointing your domain to the ALB DNS name
2. The SSL certificate will be validated via DNS (ACM will create validation records)

## Stacks

### TodoistMcpNetworkStack
- Creates VPC with public/private subnets
- NAT Gateway for outbound internet access
- Security groups

### TodoistMcpEcrStack
- ECR repository for container images
- Lifecycle policies for image cleanup
- Image scanning enabled

### TodoistMcpEfsStack
- EFS file system for TinyDB persistence
- Access point with proper permissions
- Encryption enabled

### TodoistMcpAlbStack
- Application Load Balancer
- Target group with health checks
- SSL certificate (if domain provided)
- HTTP to HTTPS redirect

### TodoistMcpEcsStack
- ECS Fargate cluster and service
- Task definition with EFS mounting
- Auto-scaling configuration
- CloudWatch logging

## Monitoring

- **Health Check**: `http://your-domain.com/health`
- **CloudWatch Logs**: `/ecs/todoist-mcp-server`
- **ECS Console**: Monitor service status and tasks

## Costs

Estimated monthly costs:
- **ECS Fargate**: ~$15-25 (1 task, 0.25 vCPU, 0.5GB RAM)
- **ALB**: ~$16-20
- **EFS**: ~$1-5 (based on data stored)
- **NAT Gateway**: ~$32
- **Data Transfer**: ~$1-10

**Total**: ~$65-90/month

## Cleanup

```bash
cd aws-infra
npx cdk destroy --all
```

**Warning**: This will delete all infrastructure including the EFS file system and database.

## Troubleshooting

### Service Won't Start
```bash
# Check ECS service events
aws ecs describe-services --cluster todoist-mcp-cluster --services todoist-mcp-service

# Check CloudWatch logs
aws logs tail /ecs/todoist-mcp-server --follow
```

### DNS Issues
- Ensure CNAME record points to ALB DNS name
- Check certificate validation in ACM console
- Verify Cloudflare proxy settings

### EFS Mount Issues
- Check security group rules for port 2049
- Verify EFS access point permissions
- Check task role has EFS permissions

## Security

- EFS encryption enabled
- VPC with private subnets
- Security groups restrict access
- Container runs as non-root user
- SSL/TLS for all external communication