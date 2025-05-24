import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface TodoistMcpApiGatewayStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  domainName?: string;
}

export class TodoistMcpApiGatewayStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly apiEndpoint: string;

  constructor(scope: Construct, id: string, props: TodoistMcpApiGatewayStackProps) {
    super(scope, id, props);

    // Create Lambda function that will forward WebSocket messages to ECS
    // In production, this would be replaced with a more sophisticated integration
    const wsHandlerRole = new iam.Role(this, 'WebSocketHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    // Add permissions for API Gateway management
    wsHandlerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'execute-api:ManageConnections',
        'execute-api:Invoke',
      ],
      resources: ['*'],
    }));

    // Add permissions for ECS service discovery
    wsHandlerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'servicediscovery:DiscoverInstances',
        'ec2:DescribeNetworkInterfaces',
      ],
      resources: ['*'],
    }));

    // Create Lambda function for WebSocket handling
    const wsHandler = new lambda.Function(this, 'WebSocketHandler', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      role: wsHandlerRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      allowPublicSubnet: true,
      timeout: cdk.Duration.seconds(30),
      environment: {
        SERVICE_DISCOVERY_NAMESPACE: 'todoist-mcp.local',
        SERVICE_DISCOVERY_SERVICE: 'todoist-mcp',
        TARGET_PORT: '8765',
      },
      code: lambda.Code.fromInline(`
import json
import os
import socket
import boto3

# This is a simplified handler. In production, you would:
# 1. Use service discovery to find ECS tasks
# 2. Establish WebSocket connection to ECS service
# 3. Forward messages bidirectionally

def handler(event, context):
    route_key = event.get('requestContext', {}).get('routeKey')
    connection_id = event.get('requestContext', {}).get('connectionId')
    
    print(f"Route: {route_key}, Connection: {connection_id}")
    print(f"Event: {json.dumps(event)}")
    
    # For now, return success
    # In production, this would forward to ECS tasks
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Success'})
    }
      `),
    });

    // Create WebSocket API
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'TodoistMcpWebSocketApi', {
      apiName: 'todoist-mcp-websocket-api',
      description: 'WebSocket API for Todoist MCP Server',
      connectRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          wsHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          wsHandler
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          wsHandler
        ),
      },
    });

    // Grant Lambda permission to be invoked by API Gateway
    wsHandler.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // Create CloudWatch log group for API Gateway
    new logs.LogGroup(this, 'ApiGatewayLogGroup', {
      logGroupName: `/aws/apigateway/${this.webSocketApi.apiId}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create stage with logging
    const stage = new apigatewayv2.WebSocketStage(this, 'TodoistMcpStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
      throttle: {
        rateLimit: 10,
        burstLimit: 20,
      },
    });

    this.apiEndpoint = stage.url;

    // Output API endpoint
    new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
      value: this.apiEndpoint,
      description: 'WebSocket API endpoint URL',
      exportName: 'TodoistMcpWebSocketEndpoint',
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID',
      exportName: 'TodoistMcpWebSocketApiId',
    });

    // Output handler function name for debugging
    new cdk.CfnOutput(this, 'WebSocketHandlerFunction', {
      value: wsHandler.functionName,
      description: 'WebSocket handler Lambda function name',
      exportName: 'TodoistMcpWebSocketHandler',
    });
  }
}