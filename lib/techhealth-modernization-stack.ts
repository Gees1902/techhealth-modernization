import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';

export class TechhealthModernizationStack extends cdk.Stack {
  // Export the VPC so EC2 and RDS resources can use it later.
  public readonly vpc: ec2.Vpc;
  public readonly ec2SecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;
  public readonly ec2Role: iam.Role;
  public readonly applicationInstance: ec2.Instance;
  public readonly database: rds.DatabaseInstance;

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

  this.applicationInstance = new ec2.Instance(
    this,
    'ApplicationInstance',
    {
      vpc: this.vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      securityGroup: this.ec2SecurityGroup,
    }
  );

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

    /*
     * IAM role used by the EC2 instance.
     *
     * This permits Systems Manager Session Manager access
     * without opening inbound SSH port 22.
     */
    this.ec2Role = new iam.Role(this, 'TechHealthEc2Role', {
      roleName: 'techhealth-ec2-ssm-role',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description:
        'Allows the TechHealth EC2 instance to communicate with AWS Systems Manager',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore'
        ),
      ],
    });

    /*
     * Startup commands for the EC2 instance.
     */
    const userData = ec2.UserData.forLinux();

    userData.addCommands(
      '#!/bin/bash',
      'dnf install -y httpd postgresql15',
      'systemctl enable httpd',
      'systemctl start httpd',
      'echo "<h1>TechHealth Patient Portal</h1><p>Infrastructure deployed with AWS CDK.</p>" > /var/www/html/index.html'
    );

    /*
     * Public EC2 application instance.
     */
    this.applicationInstance = new ec2.Instance(
      this,
      'PatientPortalInstance',
      {
        vpc: this.vpc,

        // Meet the project requirement for public-subnet placement.
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },

        instanceName: 'techhealth-patient-portal',

        instanceType: new ec2.InstanceType('t2.micro'),

        machineImage:
          ec2.MachineImage.latestAmazonLinux2023({
            cpuType: ec2.AmazonLinuxCpuType.X86_64,
          }),

        securityGroup: this.ec2SecurityGroup,
        role: this.ec2Role,

        // Require secure Instance Metadata Service version 2.
        requireImdsv2: true,

        // Encrypt the EC2 root volume.
        blockDevices: [
          {
            deviceName: '/dev/xvda',
            volume: ec2.BlockDeviceVolume.ebs(8, {
              encrypted: true,
              volumeType: ec2.EbsDeviceVolumeType.GP3,
              deleteOnTermination: true,
            }),
          },
        ],

      }
    );

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
    new cdk.CfnOutput(this, 'Ec2InstanceId', {
      value: this.applicationInstance.instanceId,
      description: 'TechHealth patient portal EC2 instance ID',
    });

    new cdk.CfnOutput(this, 'Ec2PublicIp', {
      value: this.applicationInstance.instancePublicIp,
      description: 'Public IPv4 address of the patient portal',
    });

    new cdk.CfnOutput(this, 'PatientPortalUrl', {
      value: `http://${this.applicationInstance.instancePublicDnsName}`,
      description: 'TechHealth patient portal test URL',
    });
    /*
 * Private PostgreSQL RDS database.
 */
this.database = new rds.DatabaseInstance(
  this,
  'TechHealthDatabase',
  {
    instanceIdentifier: 'techhealth-patient-database',

    engine: rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.of(
        '16.14',
        '16'
  ),

    }),

    // Generate the database password in Secrets Manager.
    credentials: rds.Credentials.fromGeneratedSecret(
      'techhealthadmin',
      {
        secretName: 'techhealth/rds/admin',
        excludeCharacters: '"@/\\\' ',
      }
    ),

    databaseName: 'techhealthdb',

    instanceType: ec2.InstanceType.of(
      ec2.InstanceClass.T3,
      ec2.InstanceSize.MICRO
    ),

    allocatedStorage: 20,
    storageType: rds.StorageType.GP3,
    storageEncrypted: true,

    vpc: this.vpc,

    // RDS can use both isolated subnets as its DB subnet group.
    vpcSubnets: {
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    },

    securityGroups: [this.rdsSecurityGroup!],

    // Ensure that RDS receives no public endpoint.
    publiclyAccessible: false,

    // Single-AZ keeps this proof of concept cost-conscious.
    multiAz: false,

    backupRetention: cdk.Duration.days(1),
    deleteAutomatedBackups: true,

    // Required so the assignment can demonstrate cdk destroy.
    deletionProtection: false,
    removalPolicy: cdk.RemovalPolicy.DESTROY,

    autoMinorVersionUpgrade: true,
    allowMajorVersionUpgrade: false,
  }
);

  /*
   * Allow the EC2 IAM role to retrieve the generated
   * database credentials from Secrets Manager.
   */
  if (this.database.secret) {
    this.database.secret.grantRead(this.ec2Role);
  }

    new cdk.CfnOutput(this, 'RdsEndpoint', {
      value: this.database.dbInstanceEndpointAddress,
      description: 'Private PostgreSQL RDS endpoint',
    });

    new cdk.CfnOutput(this, 'RdsPort', {
      value: this.database.dbInstanceEndpointPort,
      description: 'PostgreSQL database port',
    });

    if (this.database.secret) {
      new cdk.CfnOutput(this, 'RdsSecretName', {
        value: this.database.secret.secretName,
        description:
          'Secrets Manager secret containing the RDS credentials',
      });
    }
  }
}