import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class TechhealthModernizationStack extends cdk.Stack {
  // Export the VPC so EC2 and RDS resources can use it later.
  public readonly vpc: ec2.Vpc;

  constructor(
    scope: Construct,
    id: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    /*
     * TechHealth network
     *
     * Creates:
     * - One VPC
     * - Two Availability Zones
     * - One public subnet in each AZ
     * - One isolated private subnet in each AZ
     * - No NAT Gateways
     */
    this.vpc = new ec2.Vpc(this, 'TechHealthVpc', {
      vpcName: 'techhealth-patient-portal-vpc',

      // VPC address range
      ipAddresses: ec2.IpAddresses.cidr('10.20.0.0/16'),

      // Use exactly two Availability Zones
      maxAzs: 2,

      // Do not create NAT Gateways
      natGateways: 0,

      subnetConfiguration: [
        {
          // CDK creates one public subnet in each AZ
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,

          // EC2 instances launched here can receive public IPs
          mapPublicIpOnLaunch: true,
        },
        {
          // CDK creates one isolated subnet in each AZ
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    /*
     * Tags help identify and manage the resources.
     */
    cdk.Tags.of(this.vpc).add(
      'Project',
      'TechHealth-Patient-Portal'
    );

    cdk.Tags.of(this.vpc).add(
      'Environment',
      'Development'
    );

    cdk.Tags.of(this.vpc).add(
      'ManagedBy',
      'AWS-CDK'
    );

    /*
     * CloudFormation outputs
     *
     * These values will appear after cdk deploy.
     */
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'TechHealth VPC ID',
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets
        .map((subnet) => subnet.subnetId)
        .join(','),
      description: 'Public subnet IDs',
    });

    new cdk.CfnOutput(this, 'PrivateDatabaseSubnetIds', {
      value: this.vpc.isolatedSubnets
        .map((subnet) => subnet.subnetId)
        .join(','),
      description: 'Isolated private database subnet IDs',
    });

    new cdk.CfnOutput(this, 'PublicRouteTableIds', {
      value: this.vpc.publicSubnets
        .map((subnet) => subnet.routeTable.routeTableId)
        .join(','),
      description: 'Public subnet route table IDs',
    });

    new cdk.CfnOutput(this, 'PrivateRouteTableIds', {
      value: this.vpc.isolatedSubnets
        .map((subnet) => subnet.routeTable.routeTableId)
        .join(','),
      description: 'Isolated database subnet route table IDs',
    });
  }
}