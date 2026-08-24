#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { TechhealthModernizationStack } from '../lib/techhealth-modernization-stack';

const app = new cdk.App();

new TechhealthModernizationStack(
  app,
  'TechhealthModernizationStack',
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    description:
      'Network infrastructure for the TechHealth patient portal modernization project',
  }
);