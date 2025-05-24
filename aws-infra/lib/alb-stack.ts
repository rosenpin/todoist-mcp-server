import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface TodoistMcpAlbStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  domainName?: string; // Optional domain name for SSL
}

export class TodoistMcpAlbStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly listener: elbv2.ApplicationListener;

  constructor(scope: Construct, id: string, props: TodoistMcpAlbStackProps) {
    super(scope, id, props);

    // Create Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'TodoistMcpAlb', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: 'todoist-mcp-alb',
    });

    // Create target group for the ECS service
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'TodoistMcpTargetGroup', {
      vpc: props.vpc,
      port: 8765,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        path: '/health',
        port: '8765',
        protocol: elbv2.Protocol.HTTP,
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    if (props.domainName) {
      // If domain is provided, create SSL certificate and HTTPS listener
      const certificate = new acm.Certificate(this, 'TodoistMcpCertificate', {
        domainName: props.domainName,
        validation: acm.CertificateValidation.fromDns(),
      });

      // HTTPS listener
      this.listener = this.loadBalancer.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        defaultTargetGroups: [this.targetGroup],
      });

      // HTTP listener that redirects to HTTPS
      this.loadBalancer.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          permanent: true,
        }),
      });

      // Output certificate ARN
      new cdk.CfnOutput(this, 'CertificateArn', {
        value: certificate.certificateArn,
        description: 'The ARN of the SSL certificate',
        exportName: 'TodoistMcpCertificateArn',
      });
    } else {
      // HTTP only listener if no domain provided
      this.listener = this.loadBalancer.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultTargetGroups: [this.targetGroup],
      });
    }

    // Output load balancer information
    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'The DNS name of the load balancer',
      exportName: 'TodoistMcpLoadBalancerDns',
    });

    new cdk.CfnOutput(this, 'LoadBalancerArn', {
      value: this.loadBalancer.loadBalancerArn,
      description: 'The ARN of the load balancer',
      exportName: 'TodoistMcpLoadBalancerArn',
    });
  }
}