import { SCOPES, appOrigin, resourceUrl } from "./common";

export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [appOrigin()],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Work Timer",
  };
}
export function authorizationServerMetadata() {
  const o = appOrigin();
  return {
    issuer: o,
    authorization_endpoint: o + "/oauth/authorize",
    token_endpoint: o + "/oauth/token",
    registration_endpoint: o + "/oauth/register",
    revocation_endpoint: o + "/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES,
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
  };
}
