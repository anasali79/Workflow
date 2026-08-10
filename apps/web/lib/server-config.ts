export function getHasuraServerConfig() {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;

  const hasuraUrl =
    process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL ||
    (subdomain && region ? `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql` : "https://puwxmgwnewcpwjizqfqb.hasura.ap-south-1.nhost.run/v1/graphql");

  const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;

  if (!adminSecret) {
    throw new Error("HASURA_GRAPHQL_ADMIN_SECRET environment variable is not configured.");
  }

  return { hasuraUrl, adminSecret };
}
