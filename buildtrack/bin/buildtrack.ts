import * as cdk from 'aws-cdk-lib';
import { BuildTrackStack } from '../lib/buildtrack-stack';

const app = new cdk.App();

new BuildTrackStack(app, 'BuildTrackStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'BuildTrack Construction Management App',
});