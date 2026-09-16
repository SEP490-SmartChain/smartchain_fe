export type DeploymentEnvironment = 'SANDBOX' | 'PRODUCTION';

export type CarrierCredentialAuthType = 'API_TOKEN' | 'BASIC' | 'OAUTH2';

export type CarrierCredentialStatus = 'UNVERIFIED' | 'CONNECTED' | 'FAILED';

export interface CarrierSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly logoUrl: string | null;
}

export interface CarrierCredential {
  readonly id: string;
  readonly tenantId: string;
  readonly carrierId: string;
  readonly carrier: CarrierSummary;
  readonly name: string;
  readonly environment: DeploymentEnvironment;
  readonly authType: CarrierCredentialAuthType;
  readonly maskedPreview: string;
  readonly status: CarrierCredentialStatus;
  readonly lastPingAt: string | null;
  readonly lastPingMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CarrierCredentialFilters {
  readonly carrierId?: string;
  readonly environment?: DeploymentEnvironment;
  readonly status?: CarrierCredentialStatus;
}

export interface CarrierCredentialsPayload {
  readonly apiToken: string;
  readonly shopId?: string;
  readonly username?: string;
  readonly password?: string;
  readonly clientSecret?: string;
}

export interface CreateCarrierCredentialInput {
  readonly carrierId: string;
  readonly name: string;
  readonly environment: DeploymentEnvironment;
  readonly authType: CarrierCredentialAuthType;
  readonly credentials: CarrierCredentialsPayload;
}

export interface UpdateCarrierCredentialInput {
  readonly name?: string;
  readonly environment?: DeploymentEnvironment;
  readonly credentials?: CarrierCredentialsPayload;
}

export interface PingTestResult {
  readonly credentialId: string;
  readonly status: CarrierCredentialStatus;
  readonly latencyMs: number;
  readonly message: string;
  readonly testedAt: string;
}
