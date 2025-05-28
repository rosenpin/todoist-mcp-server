import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export class TodoistMcpEcrStack extends cdk.Stack {
  public readonly appRepository: ecr.IRepository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing repository - it already exists from previous deployment
    this.appRepository = ecr.Repository.fromRepositoryName(
      this,
      'TodoistMcpRepository',
      'todoist-mcp-server'
    );

    // Output the repository URI
    new cdk.CfnOutput(this, 'AppRepositoryUri', {
      value: this.appRepository.repositoryUri,
      description: 'The URI of the ECR repository for the Todoist MCP server',
      exportName: 'TodoistMcpRepositoryUri'
    });
  }
}