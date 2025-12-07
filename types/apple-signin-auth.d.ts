declare module 'apple-signin-auth' {
  export interface AppleTokenPayload {
    sub: string;
    email?: string;
    [key: string]: unknown;
  }

  export interface AppleSigninVerifyOptions {
    clientID: string;
    redirectUri?: string;
  }

  export interface AppleSigninAuthOptions {
    clientID: string;
    teamID: string;
    keyIdentifier: string;
    privateKeyPath?: string;
    privateKey?: string;
    redirectUri?: string;
    scope?: string | string[];
    state?: string;
    responseMode?: 'form_post';
    responseType?: 'code' | 'id_token' | 'code id_token';
  }

  export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    id_token?: string;
  }

  export interface GenerateClientSecretOptions {
    clientID: string;
    teamID: string;
    keyIdentifier: string;
    privateKeyPath?: string;
    privateKey?: string;
  }

  export function verifyIdToken(
    token: string,
    options: AppleSigninVerifyOptions
  ): Promise<AppleTokenPayload>;

  export function getAuthorizationUrl(options: AppleSigninAuthOptions): string;

  export function refreshAuthorizationToken(options: {
    refreshToken: string;
    clientID: string;
    clientSecret: string;
  }): Promise<TokenResponse>;

  export function getClientSecret(options: GenerateClientSecretOptions): Promise<string>;

  const appleSignin: {
    verifyIdToken: typeof verifyIdToken;
    getAuthorizationUrl: typeof getAuthorizationUrl;
    refreshAuthorizationToken: typeof refreshAuthorizationToken;
    getClientSecret: typeof getClientSecret;
  };

  export default appleSignin;
}
