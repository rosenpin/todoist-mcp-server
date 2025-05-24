import * as cdk from 'aws-cdk-lib';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface TodoistMcpEfsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class TodoistMcpEfsStack extends cdk.Stack {
  public readonly fileSystem: efs.FileSystem;
  public readonly accessPoint: efs.AccessPoint;

  constructor(scope: Construct, id: string, props: TodoistMcpEfsStackProps) {
    super(scope, id, props);

    // Create EFS file system for TinyDB persistence
    this.fileSystem = new efs.FileSystem(this, 'TodoistMcpEfs', {
      vpc: props.vpc,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      encrypted: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS, // Move to IA after 30 days
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain data on stack deletion
    });

    // Create access point for the application
    this.accessPoint = new efs.AccessPoint(this, 'TodoistMcpAccessPoint', {
      fileSystem: this.fileSystem,
      path: '/app/data',
      createAcl: {
        ownerUid: '1000',
        ownerGid: '1000',
        permissions: '755',
      },
      posixUser: {
        uid: '1000',
        gid: '1000',
      },
    });

    // Output EFS information
    new cdk.CfnOutput(this, 'FileSystemId', {
      value: this.fileSystem.fileSystemId,
      description: 'The ID of the EFS file system',
      exportName: 'TodoistMcpFileSystemId',
    });

    new cdk.CfnOutput(this, 'AccessPointId', {
      value: this.accessPoint.accessPointId,
      description: 'The ID of the EFS access point',
      exportName: 'TodoistMcpAccessPointId',
    });
  }
}