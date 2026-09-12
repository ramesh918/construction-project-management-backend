export interface AuthorizerClaims {
  sub: string;
  email?: string;
  'cognito:groups'?: string; // comma-separated when a user is in more than one group
}

export interface LambdaProxyEvent {
  requestContext: {
    authorizer?: {
      claims?: AuthorizerClaims;
    };
  };
}

export type AppBindings = { Bindings: { event: LambdaProxyEvent } };
