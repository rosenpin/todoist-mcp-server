#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TodoistMcpNetworkStack } from '../lib/network-stack';
import { TodoistMcpEcrStack } from '../lib/ecr-stack';
import { TodoistMcpEfsStack } from '../lib/efs-stack';
import { TodoistMcpApiGatewayStack } from '../lib/api-gateway-stack';
import { TodoistMcpEcsStack } from '../lib/ecs-stack';
import { TodoistMcpHttpApiStack } from '../lib/http-api-stack';
import { TodoistMcpElasticIpStack } from '../lib/elastic-ip-stack';

const app = new cdk.App();

// Environment configuration
const environment = process.env.ENVIRONMENT || 'prod';
const domainName = process.env.DOMAIN_NAME; // Optional domain for SSL
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION || 'us-west-1'
};

console.log(`Deploying Todoist MCP Server infrastructure for ${environment} environment`);

// Create the VPC stack (now with only public subnets, no NAT Gateway)
const networkStack = new TodoistMcpNetworkStack(app, 'TodoistMcpNetworkStack', {
  env,
  description: `Todoist MCP Server networking infrastructure (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Create the ECR stack
const ecrStack = new TodoistMcpEcrStack(app, 'TodoistMcpEcrStack', {
  env,
  description: `Todoist MCP Server container repository (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Create the EFS stack for data persistence
const efsStack = new TodoistMcpEfsStack(app, 'TodoistMcpEfsStack', {
  env,
  vpc: networkStack.vpc,
  description: `Todoist MCP Server EFS storage (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Create the API Gateway WebSocket stack (replaces ALB)
const apiGatewayStack = new TodoistMcpApiGatewayStack(app, 'TodoistMcpApiGatewayStack', {
  env,
  vpc: networkStack.vpc,
  domainName: domainName,
  description: `Todoist MCP Server API Gateway WebSocket (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Create the ECS stack (now with public IP assignment)
const ecsStack = new TodoistMcpEcsStack(app, 'TodoistMcpEcsStack', {
  env,
  vpc: networkStack.vpc,
  appRepository: ecrStack.appRepository,
  fileSystem: efsStack.fileSystem,
  accessPoint: efsStack.accessPoint,
  description: `Todoist MCP Server ECS Fargate service (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Create the Elastic IP stack for static IP
const elasticIpStack = new TodoistMcpElasticIpStack(app, 'TodoistMcpElasticIpStack', {
  env,
  vpc: networkStack.vpc,
  ecsService: ecsStack.service,
  description: `Todoist MCP Server Elastic IP for static address (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Create the HTTP API stack for SSE support
const httpApiStack = new TodoistMcpHttpApiStack(app, 'TodoistMcpHttpApiStack', {
  env,
  vpc: networkStack.vpc,
  ecsService: ecsStack.service,
  serviceDiscoveryService: ecsStack.serviceDiscoveryService,
  description: `Todoist MCP Server HTTP API with SSE support (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Add explicit dependencies
efsStack.addDependency(networkStack);
apiGatewayStack.addDependency(networkStack);
ecsStack.addDependency(networkStack);
ecsStack.addDependency(ecrStack);
ecsStack.addDependency(efsStack);
elasticIpStack.addDependency(ecsStack);
httpApiStack.addDependency(ecsStack);

// Output cost-saving summary
console.log('\n=== Cost-Optimized Architecture ===');
console.log('✓ No NAT Gateway (saves ~$45/month)');
console.log('✓ API Gateway WebSocket instead of ALB (saves ~$20/month)');
console.log('✓ Public IP assignment for Fargate tasks');
console.log('✓ EFS for persistent storage');
console.log('✓ Elastic IP for static address (+$3.60/month)');
console.log('✓ Estimated monthly cost: ~$9-14');
console.log('===================================\n');