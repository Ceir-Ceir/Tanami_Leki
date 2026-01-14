import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    InlineGrid,
    Tabs,
    IndexTable,
    TextField,
    Button,
    FormLayout,
    Banner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useLoaderData, useActionData, useSubmit, Form } from "@react-router/node"; // Remix/RR7 imports
// Note: If @remix-run/react is used, switch imports. Assuming RR7 based on previous files.
import { authenticate } from "../shopify.server";

// --- Loader: Fetch Data from Python Service ---
export const loader = async ({ request }: any) => {
    await authenticate.admin(request);

    // URL of your Python Service (Render or Local)
    // Ensure PYTHON_API_URL is set in .env or fallback
    const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://127.0.0.1:5000";

    try {
        const [statsRes, leadsRes] = await Promise.all([
            fetch(`${PYTHON_API_URL}/api/stats`),
            fetch(`${PYTHON_API_URL}/api/leads`)
        ]);

        const stats = await statsRes.json();
        const leads = await leadsRes.json();

        return { stats, leads, pythonUrl: PYTHON_API_URL, error: null };
    } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        return {
            stats: null,
            leads: [],
            pythonUrl: process.env.PYTHON_API_URL,
            error: "Failed to connect to Analytics Service"
        };
    }
};

// --- Action: Specific Handle for KB Submission ---
export const action = async ({ request }: any) => {
    await authenticate.admin(request);
    const formData = await request.formData();
    const content = formData.get("kb_content");

    const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://127.0.0.1:5000";

    try {
        const response = await fetch(`${PYTHON_API_URL}/api/kb`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
        });

        if (!response.ok) {
            throw new Error("API Error");
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to save to Knowledge Base" };
    }
};


export default function Dashboard() {
    const { stats, leads, error } = useLoaderData() as any;
    const actionData = useActionData() as any;
    const submit = useSubmit();

    const [selectedTab, setSelectedTab] = useState(0);

    const handleTabChange = useCallback(
        (selectedTabIndex: number) => setSelectedTab(selectedTabIndex),
        [],
    );

    const tabs = [
        { id: "overview", content: "Overview", panelID: "overview-panel" },
        { id: "trends", content: "Trends & Activity", panelID: "trends-panel" },
        { id: "kb", content: "Knowledge Base", panelID: "kb-panel" },
    ];

    // --- Render Functions ---

    const renderOverview = () => (
        <BlockStack gap="500">
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                <MetricCard title="Total Leads (Unique)" value={stats?.unique_visitors || 0} />
                <MetricCard title="HVP Count (>=150)" value={stats?.hvp_count || 0} />
                <MetricCard title="Emails Captured" value={stats?.emails_captured || 0} />
                <MetricCard title="Avg Lead Score" value={stats?.avg_lead_score || 0} />
            </InlineGrid>
            {/* Placeholder for charts if needed later */}
            <Card>
                <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">System Status</Text>
                    <Text as="p" tone="subdued">Connected to RAG Brain</Text>
                </BlockStack>
            </Card>
        </BlockStack>
    );

    const renderTrends = () => (
        <Card padding="0">
            <IndexTable
                resourceName={{ singular: "lead", plural: "leads" }}
                itemCount={leads.length}
                headings={[
                    { title: "Email" },
                    { title: "Score" },
                    { title: "Stage" },
                    { title: "Last Seen" },
                ]}
                selectable={false}
            >
                {leads.map((lead: any, index: number) => (
                    <IndexTable.Row id={lead.anonymous_id || index} key={index} position={index}>
                        <IndexTable.Cell>
                            <Text variant="bodyMd" fontWeight="bold" as="span">
                                {lead.email || "Anonymous"}
                            </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{lead.lead_score}</IndexTable.Cell>
                        <IndexTable.Cell>{lead.stage || "-"}</IndexTable.Cell>
                        <IndexTable.Cell>{lead.last_seen ? new Date(lead.last_seen).toLocaleDateString() : "-"}</IndexTable.Cell>
                    </IndexTable.Row>
                ))}
            </IndexTable>
        </Card>
    );

    const renderKB = () => (
        <Card>
            <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Feed the Brain</Text>
                <Text as="p">Add new text chunks to the knowledge base. The AI will immediately use this context for future answers.</Text>

                {actionData?.success && <Banner type="success">Added to Knowledge Base!</Banner>}
                {actionData?.error && <Banner type="critical">{actionData.error}</Banner>}

                <Form method="post">
                    <FormLayout>
                        <TextField
                            label="Knowledge Content"
                            name="kb_content"
                            multiline={6}
                            autoComplete="off"
                            placeholder="Ex: Our return policy is 30 days..."
                        />
                        <Button submit variant="primary">Submit to Brain</Button>
                    </FormLayout>
                </Form>
            </BlockStack>
        </Card>
    );

    return (
        <Page title="Leki Command Center" fullWidth>
            <Layout>
                <Layout.Section>
                    {error && <Banner type="critical">{error}</Banner>}

                    <Card padding="0">
                        <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                            <Card.Section>
                                <div style={{ padding: "16px" }}>
                                    {selectedTab === 0 && renderOverview()}
                                    {selectedTab === 1 && renderTrends()}
                                    {selectedTab === 2 && renderKB()}
                                </div>
                            </Card.Section>
                        </Tabs>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

function MetricCard({ title, value }: { title: string; value: string | number }) {
    return (
        <Card>
            <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">{title}</Text>
                <Text as="p" variant="headingXl">{value}</Text>
            </BlockStack>
        </Card>
    )
}
