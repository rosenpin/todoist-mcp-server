import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface TodoistMcpHttpApiStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecsService: ecs.FargateService;
  serviceDiscoveryService: servicediscovery.IService;
}

export class TodoistMcpHttpApiStack extends cdk.Stack {
  public readonly httpApi: apigatewayv2.HttpApi;
  public readonly apiEndpoint: string;

  constructor(scope: Construct, id: string, props: TodoistMcpHttpApiStackProps) {
    super(scope, id, props);

    // Create Lambda function to proxy requests to ECS service
    const proxyRole = new iam.Role(this, 'ProxyLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    // Add permissions for service discovery
    proxyRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'servicediscovery:DiscoverInstances',
        'ec2:DescribeNetworkInterfaces',
      ],
      resources: ['*'],
    }));

    const proxyFunction = new lambda.Function(this, 'ProxyFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      role: proxyRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      allowPublicSubnet: true,
      timeout: cdk.Duration.minutes(15), // Long timeout for SSE
      environment: {
        SERVICE_NAMESPACE: 'todoist-mcp.local',
        SERVICE_NAME: 'todoist-mcp',
        SERVICE_PORT: '8765',
      },
      code: lambda.Code.fromInline(`
import json
import urllib.request
import urllib.error
import boto3
import os

def handler(event, context):
    # Get service discovery client
    sd = boto3.client('servicediscovery')
    
    # Discover ECS service instances
    namespace = os.environ['SERVICE_NAMESPACE']
    service_name = os.environ['SERVICE_NAME']
    service_port = os.environ['SERVICE_PORT']
    
    try:
        response = sd.discover_instances(
            NamespaceName=namespace,
            ServiceName=service_name,
            MaxResults=1
        )
        
        if not response['Instances']:
            return {
                'statusCode': 503,
                'body': json.dumps({'error': 'No service instances available'}),
                'headers': {'Content-Type': 'application/json'}
            }
        
        # Get the first instance
        instance = response['Instances'][0]
        instance_ip = instance['Attributes'].get('AWS_INSTANCE_IPV4')
        
        if not instance_ip:
            return {
                'statusCode': 503,
                'body': json.dumps({'error': 'Service instance has no IP'}),
                'headers': {'Content-Type': 'application/json'}
            }
        
        # Build target URL
        path = event.get('rawPath', '/')
        query_string = event.get('rawQueryString', '')
        target_url = f"http://{instance_ip}:{service_port}{path}"
        if query_string:
            target_url += f"?{query_string}"
        
        # Forward request
        headers = event.get('headers', {})
        # Remove Lambda-specific headers
        headers_to_remove = ['x-amzn-trace-id', 'x-forwarded-for', 'x-forwarded-port', 'x-forwarded-proto']
        for header in headers_to_remove:
            headers.pop(header, None)
        
        # Create request
        req = urllib.request.Request(target_url)
        for key, value in headers.items():
            req.add_header(key, value)
        
        # Handle request body if present
        body = event.get('body')
        if body:
            if event.get('isBase64Encoded'):
                import base64
                body = base64.b64decode(body)
            else:
                body = body.encode('utf-8')
        
        # Make request
        try:
            response = urllib.request.urlopen(req, data=body, timeout=900)
            response_body = response.read()
            
            # For SSE endpoints, we need to return streaming response
            # API Gateway v2 doesn't support true streaming, so we return the initial response
            response_headers = dict(response.headers)
            
            return {
                'statusCode': response.code,
                'body': response_body.decode('utf-8', errors='replace'),
                'headers': response_headers,
                'isBase64Encoded': False
            }
            
        except urllib.error.HTTPError as e:
            return {
                'statusCode': e.code,
                'body': e.read().decode('utf-8', errors='replace'),
                'headers': {'Content-Type': 'application/json'}
            }
            
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {'Content-Type': 'application/json'}
        }
      `),
    });

    // Create HTTP API
    this.httpApi = new apigatewayv2.HttpApi(this, 'TodoistMcpHttpApi', {
      apiName: 'todoist-mcp-http-api',
      description: 'HTTP API for Todoist MCP Server with SSE support',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST],
        allowHeaders: ['*'],
      },
    });

    // Create Lambda integration
    const integration = new apigatewayv2_integrations.HttpLambdaIntegration(
      'ProxyIntegration',
      proxyFunction
    );

    // Add catch-all route
    this.httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
    });

    // Add root route
    this.httpApi.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
    });

    this.apiEndpoint = this.httpApi.url!;

    // Output API endpoint
    new cdk.CfnOutput(this, 'HttpApiEndpoint', {
      value: this.apiEndpoint,
      description: 'HTTP API endpoint URL',
      exportName: 'TodoistMcpHttpApiEndpoint',
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      value: this.httpApi.apiId,
      description: 'HTTP API ID',
      exportName: 'TodoistMcpHttpApiId',
    });

    // Output SSE endpoint format
    new cdk.CfnOutput(this, 'SSEEndpointFormat', {
      value: `${this.apiEndpoint}sse/{integration_id}`,
      description: 'SSE endpoint URL format for MCP connections',
      exportName: 'TodoistMcpSSEEndpointFormat',
    });
  }
}