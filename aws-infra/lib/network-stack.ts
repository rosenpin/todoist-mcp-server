import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class TodoistMcpNetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC with only public subnets (no NAT Gateway for cost savings)
    this.vpc = new ec2.Vpc(this, 'TodoistMcpVPC', {
      vpcName: 'todoist-mcp-vpc',
      maxAzs: 2,
      natGateways: 0, // No NAT Gateway to save costs
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // Output the VPC ID for reference
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'The ID of the VPC',
      exportName: 'TodoistMcpVpcId',
    });
  }
}