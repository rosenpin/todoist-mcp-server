import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

export interface TodoistMcpEcsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  appRepository: ecr.IRepository;
  fileSystem: efs.FileSystem;
  accessPoint: efs.AccessPoint;
}

export class TodoistMcpEcsStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly serviceDiscoveryService: servicediscovery.IService;

  constructor(scope: Construct, id: string, props: TodoistMcpEcsStackProps) {
    super(scope, id, props);

    // Create ECS cluster
    this.cluster = new ecs.Cluster(this, 'TodoistMcpCluster', {
      vpc: props.vpc,
      clusterName: 'todoist-mcp-cluster',
    });

    // Create Cloud Map namespace for service discovery
    const namespace = new servicediscovery.PrivateDnsNamespace(this, 'TodoistMcpNamespace', {
      name: 'todoist-mcp.local',
      vpc: props.vpc,
    });

    // Create task execution role
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Create task role for application permissions
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Create CloudWatch log group
    const logGroup = new logs.LogGroup(this, 'TodoistMcpLogGroup', {
      logGroupName: '/ecs/todoist-mcp-server',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TodoistMcpTaskDefinition', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
      volumes: [
        {
          name: 'efs-storage',
          efsVolumeConfiguration: {
            fileSystemId: props.fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              accessPointId: props.accessPoint.accessPointId,
              iam: 'ENABLED',
            },
          },
        },
      ],
    });

    // Grant EFS permissions to task role
    props.fileSystem.grantRootAccess(taskRole);

    // Add container to task definition
    const container = taskDefinition.addContainer('TodoistMcpContainer', {
      image: ecs.ContainerImage.fromEcrRepository(props.appRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'todoist-mcp',
        logGroup: logGroup,
      }),
      environment: {
        PORT: '8765',
        DATA_PATH: '/app/data',
      },
    });

    // Add mount points to the container
    container.addMountPoints({
      sourceVolume: 'efs-storage',
      containerPath: '/app/data',
      readOnly: false,
    });

    // Add port mapping
    container.addPortMappings({
      containerPort: 8765,
      protocol: ecs.Protocol.TCP,
    });

    // Create security group for the ECS service
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Todoist MCP ECS service',
      allowAllOutbound: true,
    });

    // Allow inbound traffic on port 8765 from within VPC (for API Gateway VPC Link)
    ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(8765),
      'Allow traffic from VPC (API Gateway)'
    );
    
    // Also allow from anywhere for direct access (optional, can be removed for security)
    ecsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8765),
      'Allow WebSocket connections'
    );

    // Allow EFS access
    ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(2049),
      'Allow EFS access'
    );

    // Create Fargate service with public IP assignment
    this.service = new ecs.FargateService(this, 'TodoistMcpService', {
      cluster: this.cluster,
      taskDefinition: taskDefinition,
      serviceName: 'todoist-mcp-service',
      desiredCount: 1,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      assignPublicIp: true, // Assign public IP for internet access without NAT
      enableExecuteCommand: true, // Enable ECS Exec for debugging
      cloudMapOptions: {
        name: 'todoist-mcp',
        cloudMapNamespace: namespace,
        dnsRecordType: servicediscovery.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(10),
      },
    });

    // Get the service discovery service reference
    this.serviceDiscoveryService = this.service.cloudMapService!;

    // Auto-scaling configuration
    const scaling = this.service.autoScaleTaskCount({
      maxCapacity: 3,
      minCapacity: 1,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(300),
    });

    // Output service information
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'The name of the ECS cluster',
      exportName: 'TodoistMcpClusterName',
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'The name of the ECS service',
      exportName: 'TodoistMcpServiceName',
    });

    new cdk.CfnOutput(this, 'ServiceDiscoveryName', {
      value: `todoist-mcp.todoist-mcp.local`,
      description: 'The service discovery name for internal access',
      exportName: 'TodoistMcpServiceDiscoveryName',
    });
  }
}