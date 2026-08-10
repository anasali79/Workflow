"use client";

import { useMemo } from "react";
import {
  ApolloClient,
  ApolloProvider,
  InMemoryCache,
  createHttpLink,
  split,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { useAccessToken } from "@nhost/react";
import { createClient } from "graphql-ws";
import { getHasuraGraphqlUrl, getHasuraWsUrl } from "@/lib/nhost";

export function ApolloAppProvider({ children }: { children: React.ReactNode }) {
  const accessToken = useAccessToken();

  const client = useMemo(() => {
    const graphqlUrl = getHasuraGraphqlUrl();
    const wsUrl = getHasuraWsUrl();

    const httpLink = createHttpLink({
      uri: graphqlUrl,
    });

    const authLink = setContext((_, { headers }) => {
      const authHeaders: Record<string, string> = {
        ...headers,
      };

      if (accessToken) {
        authHeaders["authorization"] = `Bearer ${accessToken}`;
      }

      return { headers: authHeaders };
    });

    const wsLink =
      typeof window !== "undefined"
        ? new GraphQLWsLink(
            createClient({
              url: wsUrl,
              connectionParams: () => {
                return {
                  headers: {
                    authorization: accessToken ? `Bearer ${accessToken}` : "",
                  },
                };
              },
            }),
          )
        : null;

    const splitLink =
      typeof window !== "undefined" && wsLink
        ? split(
            ({ query }) => {
              const definition = getMainDefinition(query);
              return (
                definition.kind === "OperationDefinition" &&
                definition.operation === "subscription"
              );
            },
            wsLink,
            authLink.concat(httpLink),
          )
        : authLink.concat(httpLink);

    return new ApolloClient({
      link: splitLink,
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: "cache-and-network",
          errorPolicy: "all",
        },
        query: {
          fetchPolicy: "network-only",
          errorPolicy: "all",
        },
        mutate: {
          errorPolicy: "all",
        },
      },
    });

  }, [accessToken]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
