import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class TechhealthModernizationStack extends cdk.Stack {
  // Export the VPC so EC2 and RDS resources can use it later.
  public readonly vpc: ec2.Vpc;
  public readonly ec2SecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;

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
    /*
 * EC2 application security group
 */
this.ec2SecurityGroup = new ec2.SecurityGroup(
  this,
  'Ec2SecurityGroup',
  {
    vpc: this.vpc,
    securityGroupName: 'techhealth-ec2-sg',
    description:
      'Controls network access to the TechHealth patient portal EC2 instance',

    // EC2 needs outbound access for updates, Systems Manager,
    // and communication with RDS.
    allowAllOutbound: true,
  }
);

/*
 * Permit HTTP access to the proof-of-concept patient portal.
 *
 * A production healthcare application should use HTTPS
 * through an Application Load Balancer.
 */
this.ec2SecurityGroup.addIngressRule(
  ec2.Peer.anyIpv4(),
  ec2.Port.tcp(80),
  'Allow HTTP access to the patient portal'
);

/*
 * RDS database security group
 */
this.rdsSecurityGroup = new ec2.SecurityGroup(
  this,
  'RdsSecurityGroup',
  {
    vpc: this.vpc,
    securityGroupName: 'techhealth-rds-sg',
    description:
      'Allows PostgreSQL connections only from the TechHealth EC2 application',

    // RDS does not need to initiate outbound connections
    allowAllOutbound: false,
  }
);

/*
 * Permit PostgreSQL traffic from EC2 to RDS.
 *
 * This rule references the EC2 security group instead of
 * allowing an IP address or the entire internet.
 */
this.rdsSecurityGroup.addIngressRule(
  this.ec2SecurityGroup,
  ec2.Port.tcp(5432),
  'Allow PostgreSQL traffic from TechHealth EC2 only'
);
new cdk.CfnOutput(this, 'Ec2SecurityGroupId', {
  value: this.ec2SecurityGroup.securityGroupId,
  description: 'Security group used by the EC2 application',
});

new cdk.CfnOutput(this, 'RdsSecurityGroupId', {
  value: this.rdsSecurityGroup.securityGroupId,
  description: 'Security group used by the private RDS database',
});
  }
}