import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class BuildTrackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // Resources will be added step by step
  }
}