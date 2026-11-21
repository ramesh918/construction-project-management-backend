export interface AuthorizerContext {
  sub: string;
  email?: string;
  groups?: string; // comma-separated when a user is in more than one group
}

export interface LambdaProxyEvent {
  requestContext: {
    authorizer?: AuthorizerContext;
  };
}

export type AppBindings = { Bindings: { event: LambdaProxyEvent } };
