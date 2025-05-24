#!/bin/bash

set -e

echo "🚀 Starting fresh deployment of Todoist MCP Server to AWS..."

# Step 1: Deploy base infrastructure (Network and ECR)
echo "📦 Step 1: Deploying base infrastructure..."
npx cdk deploy TodoistMcpNetworkStack TodoistMcpECRStack --require-approval never

# Step 2: Build and push Docker image
echo "🐳 Step 2: Building and pushing Docker image..."
cd ..

# Get ECR repository URI
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/todoist-mcp-server"

# Login to ECR
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ECR_URI}

# Build and push image
docker build -t todoist-mcp-server .
docker tag todoist-mcp-server:latest ${ECR_URI}:latest
docker push ${ECR_URI}:latest

# Step 3: Deploy remaining infrastructure
echo "☁️  Step 3: Deploying remaining infrastructure..."
cd aws-infra
npx cdk deploy TodoistMcpEFSStack TodoistMcpECSStack TodoistMcpApiGatewayStack --require-approval never

echo "✅ Deployment complete!"
echo ""
echo "🌐 API Gateway WebSocket URL:"
aws cloudformation describe-stacks --stack-name TodoistMcpApiGatewayStack --query "Stacks[0].Outputs[?OutputKey=='WebSocketUrl'].OutputValue" --output text