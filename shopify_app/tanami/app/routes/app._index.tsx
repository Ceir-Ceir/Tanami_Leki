import type { LoaderFunctionArgs } from "react-router";
// Use the loader from the Shopify package, not the standard redirect
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // 2. Destructure 'redirect' from the authenticate object
  const { redirect } = await authenticate.admin(request);

  // 3. Use THIS redirect. It handles the headers and "breaks" out of 
  // the frame if necessary to avoid the X-Frame-Options error.
  return redirect("/app/dashboard");
};

export default function Index() {
  return null;
}

export const headers = ({ parentHeaders }) => {
  return parentHeaders;
};