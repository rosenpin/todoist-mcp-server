#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TodoistMcpNetworkStack } from '../lib/network-stack';
import { TodoistMcpEcrStack } from '../lib/ecr-stack';
import { TodoistMcpEfsStack } from '../lib/efs-stack';
import { TodoistMcpAlbStack } from '../lib/alb-stack';
import { TodoistMcpEcsStack } from '../lib/ecs-stack';

const app = new cdk.App();

// Environment configuration
const environment = process.env.ENVIRONMENT || 'prod';
const domainName = process.env.DOMAIN_NAME; // Optional domain for SSL
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION || 'us-east-1'
};

console.log(`Deploying Todoist MCP Server infrastructure for ${environment} environment`);

// Create the VPC stack
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

// Create the ALB stack
const albStack = new TodoistMcpAlbStack(app, 'TodoistMcpAlbStack', {
  env,
  vpc: networkStack.vpc,
  domainName: domainName,
  description: `Todoist MCP Server application load balancer (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Create the ECS stack
const ecsStack = new TodoistMcpEcsStack(app, 'TodoistMcpEcsStack', {
  env,
  vpc: networkStack.vpc,
  targetGroup: albStack.targetGroup,
  appRepository: ecrStack.appRepository,
  fileSystem: efsStack.fileSystem,
  accessPoint: efsStack.accessPoint,
  description: `Todoist MCP Server ECS Fargate service (${environment})`,
  tags: {
    Environment: environment,
    Project: 'TodoistMcpServer'
  }
});

// Add explicit dependencies
efsStack.addDependency(networkStack);
albStack.addDependency(networkStack);
ecsStack.addDependency(networkStack);
ecsStack.addDependency(albStack);
ecsStack.addDependency(ecrStack);
ecsStack.addDependency(efsStack);