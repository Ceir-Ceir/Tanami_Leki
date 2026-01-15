import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function App() {
  return (
    <>
      <s-app-nav>
        <s-link href="/app" rel="home">Home</s-link>
        <s-link href="/app/dashboard">Dashboard</s-link>
        <s-link href="/app/knowledgebase">Knowledge Base</s-link>
      </s-app-nav>
      <Outlet />
    </>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
