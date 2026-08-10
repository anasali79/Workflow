import { NhostClient } from "@nhost/nhost-js";

/**
 * Shared Nhost client configuration.
 * Secrets never belong here — only public subdomain/region (or explicit service URLs).
 *
 * Missing env vars use safe placeholders so the app can build and render the shell.
 * AuthGate surfaces a configuration banner until real values are set.
 */
export function createNhostClient(): NhostClient {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "puwxmgwnewcpwjizqfqb";
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || "ap-south-1";
  const backendUrl = process.env.NEXT_PUBLIC_NHOST_BACKEND_URL?.replace(/\/$/, "");

  // If backendUrl is set to a custom local endpoint (e.g. localhost), use explicit service URLs.
  if (backendUrl && (backendUrl.includes("localhost") || backendUrl.includes("127.0.0.1"))) {
    return new NhostClient({
      authUrl: `${backendUrl}/v1/auth`,
      graphqlUrl: `${backendUrl}/v1/graphql`,
      storageUrl: `${backendUrl}/v1/storage`,
      functionsUrl: `${backendUrl}/v1/functions`,
    });
  }

  // Override graphqlUrl because the Nhost SDK generates the wrong subdomain pattern:
  // SDK generates: https://<subdomain>.graphql.<region>.nhost.run/v1/graphql  ← 404 Not Found
  // Correct URL:   https://<subdomain>.hasura.<region>.nhost.run/v1/graphql   ← 200 OK
  return new NhostClient({
    subdomain,
    region,
    graphqlUrl: `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`,
  });
}

export const isNhostConfigured = Boolean(
  process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || process.env.NEXT_PUBLIC_NHOST_BACKEND_URL,
);

export const nhost = createNhostClient();

/**
 * Returns the correct Hasura GraphQL HTTP URL for Apollo Client.
 * The SDK generates the wrong "graphql" subdomain; this always returns the working "hasura" subdomain.
 */
export function getHasuraGraphqlUrl(): string {
  const backendUrl = process.env.NEXT_PUBLIC_NHOST_BACKEND_URL?.replace(/\/$/, "");
  if (backendUrl) return `${backendUrl}/v1/graphql`;
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "puwxmgwnewcpwjizqfqb";
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || "ap-south-1";
  return `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
}

/** Returns the WebSocket URL for Apollo Client graphql-ws subscriptions. */
export function getHasuraWsUrl(): string {
  return getHasuraGraphqlUrl().replace(/^http/, "ws");
}
