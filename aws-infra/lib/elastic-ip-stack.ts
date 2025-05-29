import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export interface TodoistMcpElasticIpStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecsService: ecs.FargateService;
}

export class TodoistMcpElasticIpStack extends cdk.Stack {
  public readonly elasticIp: ec2.CfnEIP;
  public readonly staticIpAddress: string;

  constructor(scope: Construct, id: string, props: TodoistMcpElasticIpStackProps) {
    super(scope, id, props);

    // Create Elastic IP
    this.elasticIp = new ec2.CfnEIP(this, 'TodoistMcpElasticIP', {
      domain: 'vpc',
      tags: [
        {
          key: 'Name',
          value: 'todoist-mcp-elastic-ip',
        },
      ],
    });

    this.staticIpAddress = this.elasticIp.ref;

    // Create Lambda function to associate EIP with ECS tasks
    const eipAssociationRole = new iam.Role(this, 'EipAssociationRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add permissions for EIP association and ECS operations
    eipAssociationRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ec2:AssociateAddress',
        'ec2:DisassociateAddress',
        'ec2:DescribeAddresses',
        'ec2:DescribeNetworkInterfaces',
        'ecs:DescribeTasks',
        'ecs:ListTasks',
      ],
      resources: ['*'],
    }));

    const eipAssociationFunction = new lambda.Function(this, 'EipAssociationFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      role: eipAssociationRole,
      timeout: cdk.Duration.seconds(60),
      environment: {
        ELASTIC_IP_ALLOCATION_ID: this.elasticIp.attrAllocationId,
        ECS_CLUSTER_NAME: props.ecsService.cluster.clusterName,
        ECS_SERVICE_NAME: props.ecsService.serviceName,
      },
      code: lambda.Code.fromInline(`
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    ec2 = boto3.client('ec2')
    ecs = boto3.client('ecs')
    
    allocation_id = event.get('allocation_id') or context.function_name.split('-')[-1]
    cluster_name = event.get('cluster_name', 'todoist-mcp-cluster')
    service_name = event.get('service_name', 'todoist-mcp-service')
    
    try:
        # Get running tasks for the service
        tasks_response = ecs.list_tasks(
            cluster=cluster_name,
            serviceName=service_name,
            desiredStatus='RUNNING'
        )
        
        if not tasks_response['taskArns']:
            logger.info("No running tasks found")
            return {'statusCode': 200, 'body': 'No tasks to process'}
        
        # Get task details
        task_details = ecs.describe_tasks(
            cluster=cluster_name,
            tasks=tasks_response['taskArns']
        )
        
        for task in task_details['tasks']:
            # Find the network interface ID
            for attachment in task.get('attachments', []):
                if attachment['type'] == 'ElasticNetworkInterface':
                    for detail in attachment['details']:
                        if detail['name'] == 'networkInterfaceId':
                            eni_id = detail['value']
                            
                            # Associate Elastic IP with this ENI
                            try:
                                response = ec2.associate_address(
                                    AllocationId=allocation_id,
                                    NetworkInterfaceId=eni_id
                                )
                                logger.info(f"Associated EIP {allocation_id} with ENI {eni_id}")
                                return {
                                    'statusCode': 200,
                                    'body': json.dumps({
                                        'message': 'EIP associated successfully',
                                        'associationId': response.get('AssociationId'),
                                        'eniId': eni_id
                                    })
                                }
                            except Exception as e:
                                logger.error(f"Failed to associate EIP: {str(e)}")
                                # If association fails, it might already be associated
                                if 'already associated' in str(e).lower():
                                    return {'statusCode': 200, 'body': 'EIP already associated'}
                                raise
        
        return {'statusCode': 404, 'body': 'No network interface found'}
        
    except Exception as e:
        logger.error(f"Error in EIP association: {str(e)}")
        return {'statusCode': 500, 'body': f'Error: {str(e)}'}
      `),
    });

    // Create EventBridge rule to trigger Lambda when ECS service changes
    const ecsStateChangeRule = new events.Rule(this, 'EcsStateChangeRule', {
      eventPattern: {
        source: ['aws.ecs'],
        detailType: ['ECS Task State Change'],
        detail: {
          clusterArn: [props.ecsService.cluster.clusterArn],
          lastStatus: ['RUNNING'],
        },
      },
    });

    ecsStateChangeRule.addTarget(new targets.LambdaFunction(eipAssociationFunction, {
      event: events.RuleTargetInput.fromObject({
        allocation_id: this.elasticIp.attrAllocationId,
        cluster_name: props.ecsService.cluster.clusterName,
        service_name: props.ecsService.serviceName,
      }),
    }));

    // Output the static IP
    new cdk.CfnOutput(this, 'StaticIpAddress', {
      value: this.staticIpAddress,
      description: 'Static IP address for the Todoist MCP server',
      exportName: 'TodoistMcpStaticIp',
    });

    new cdk.CfnOutput(this, 'ElasticIpAllocationId', {
      value: this.elasticIp.attrAllocationId,
      description: 'Elastic IP allocation ID',
      exportName: 'TodoistMcpElasticIpAllocationId',
    });

    new cdk.CfnOutput(this, 'ServerUrl', {
      value: `http://${this.staticIpAddress}:8765`,
      description: 'Static URL for the Todoist MCP server',
      exportName: 'TodoistMcpServerUrl',
    });
  }
}