
export interface LoginInput {
  email: string;
  password: string;
}

// Tokens returned by a successful login
export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;       // seconds until accessToken/idToken expire
}

// Request body for POST /auth/refresh
export interface RefreshInput {
  refreshToken: string;
}

// Response for POST /auth/refresh — no new refreshToken is issued
export interface RefreshResult {
  accessToken: string;
  idToken: string;
  expiresIn: number;
}