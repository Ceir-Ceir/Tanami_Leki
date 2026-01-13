import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processChat } from "../models/rag.server";

// App Proxy Endpoints are public but signed. 
// We use authenticate.public.appProxy to verify the request comes from Shopify.

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.public.appProxy(request);

    if (!session) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.json();
    const message = formData.message;

    if (!message) {
        return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await processChat(message);

    return Response.json(result);
};

// Handle OPTIONS for CORS if needed (though Proxy usually handles this)
export const loader = async () => {
    return Response.json({ status: "ok" });
};
