import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export class TodoistMcpEcrStack extends cdk.Stack {
  public readonly appRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an ECR repository for the Todoist MCP server container
    this.appRepository = new ecr.Repository(this, 'TodoistMcpRepository', {
      repositoryName: 'todoist-mcp-server',
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain the repository on stack deletion
      imageScanOnPush: true, // Enable image scanning for security vulnerabilities
      lifecycleRules: [
        {
          // Keep only the latest 10 images to avoid excessive storage costs
          maxImageCount: 10,
          description: 'Keep only the latest 10 images'
        }
      ]
    });

    // Output the repository URI
    new cdk.CfnOutput(this, 'AppRepositoryUri', {
      value: this.appRepository.repositoryUri,
      description: 'The URI of the ECR repository for the Todoist MCP server',
      exportName: 'TodoistMcpRepositoryUri'
    });
  }
}