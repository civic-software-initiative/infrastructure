import {
  Stack,
  StackProps,
} from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs';

export class DemoEnvironments extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const keyPairName = 'nikhil@lemur';

    // Create new VPC with 2 Subnets
    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 0,
      subnetConfiguration: [{
        cidrMask: 24,
        name: "asterisk",
        subnetType: ec2.SubnetType.PUBLIC
      }]
    });

    // Allow SSH (TCP Port 22) access from anywhere
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Allow inbound ssh/http traffic',
      allowAllOutbound: true
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH Access')
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP Access')
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS Access')

    const role = new iam.Role(this, 'ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })

    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))

    // Use Latest Ubuntu Image
    const ami = ec2.MachineImage.fromSsmParameter(
      '/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id',
      { os: ec2.OperatingSystemType.LINUX }
    );

    const wellspringDemoInstance = new ec2.Instance(this, 'WellspringDemoInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ami,
      securityGroup: securityGroup,
      keyName: keyPairName,
      role: role
    });
    const fairChoicesDemoInstance = new ec2.Instance(this, 'FairChoicesDemoInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ami,
      securityGroup: securityGroup,
      keyName: keyPairName,
      role: role
    });


    // Create outputs for connecting
    new cdk.CfnOutput(this, 'WellspringDemoInstance IP Address', { value: wellspringDemoInstance.instancePublicIp });
    new cdk.CfnOutput(this, 'FairChoicesDemoInstance IP Address', { value: fairChoicesDemoInstance.instancePublicIp });
  }
}
