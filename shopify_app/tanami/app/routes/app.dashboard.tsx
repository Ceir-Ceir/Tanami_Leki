import { useState, useRef, useEffect } from "react";
import { useLoaderData, useActionData, Form } from "react-router";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, ReferenceLine
} from 'recharts';
import { authenticate } from "../shopify.server";
import {
    getDashboardMetrics,
    getLeads,
    getRecentEvents,
    getLeadStageDistribution,
    getTopEventsAggregated,
    getEventTrends,
    getLeadJourneyData
} from "../services/analytics.server";
import db from "../db.server";

// --- Loader: Fetch Data from Local Services ---
export const loader = async ({ request }: any) => {
    await authenticate.admin(request);

    // Fetch everything needed for the dashboard
    const [metrics, leads, recentEvents, stageDistribution, topEvents, eventTrends, leadJourneyData] = await Promise.all([
        getDashboardMetrics(),
        getLeads("ALL"),
        getRecentEvents(50),
        getLeadStageDistribution(),
        getTopEventsAggregated(),
        getEventTrends(),
        getLeadJourneyData()
    ]);

    return { metrics, leads, recentEvents, stageDistribution, topEvents, eventTrends, leadJourneyData, error: null };
};

// --- Action: Specific Handle for KB Submission ---
export const action = async ({ request }: any) => {
    await authenticate.admin(request);
    const formData = await request.formData();
    const content = formData.get("kb_content");

    if (!content) return { success: false, error: "Content is required" };

    try {
        // Create a simple KB document for now (or find one to attach to)
        const doc = await db.kb_documents.create({
            data: {
                title: `Manual Upload ${new Date().toLocaleDateString()}`,
                source_type: "other",
                enabled: true,
                kb_chunks: {
                    create: {
                        chunk_index: 0,
                        content: content as string,
                    }
                }
            }
        });

        return { success: true };
    } catch (error) {
        console.error("KB Submission failed:", error);
        return { success: false, error: "Failed to save to Knowledge Base" };
    }
};

export default function Dashboard() {
    const loaderData = useLoaderData() as any;
    const { metrics, leads, recentEvents, error, topEvents, stageDistribution, eventTrends, leadJourneyData } = loaderData;
    const actionData = useActionData() as any;
    const [selectedTab, setSelectedTab] = useState("dashboard");
    const tabsRef = useRef<any>(null);

    const GREEN_ACCENT = "#22c55e";
    const DARK_BG = "#0e110e";
    const DARK_SURFACE = "#1a1f1a";
    const DARK_BORDER = "#2d362d";
    const LIGHT_TEXT = "#e8f5e9";
    const GREEN_SHADES = ['#22c55e', '#166534', '#15803d', '#14532d'];

    useEffect(() => {
        const tabsEl = tabsRef.current;
        if (!tabsEl) return;

        const handleSelect = (e: any) => {
            if (e.detail?.id) {
                setSelectedTab(e.detail.id);
            }
        };

        tabsEl.addEventListener("shopify:select", handleSelect);
        return () => tabsEl.removeEventListener("shopify:select", handleSelect);
    }, []);

    const renderDashboard = () => (
        <div id="tanami-dashboard">
            <style>{`
                #tanami-dashboard {
                    background-color: ${DARK_BG};
                    color: ${LIGHT_TEXT};
                    padding: 1.5rem;
                    border-radius: 12px;
                }
                /* Metric Row - 4 columns */
                .metrics-row {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .metric-box {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1.25rem;
                    text-align: center;
                }
                .metric-box h3 {
                    margin: 0 0 0.5rem 0;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: ${LIGHT_TEXT};
                    opacity: 0.8;
                }
                .metric-box .value {
                    font-size: 2rem;
                    font-weight: bold;
                    color: ${GREEN_ACCENT};
                }
                /* Chart Rows - 2 columns each */
                .charts-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .chart-box {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1rem;
                    min-height: 320px;
                }
                .chart-box h3 {
                    margin: 0 0 1rem 0;
                    font-size: 1rem;
                    font-weight: 600;
                    color: ${LIGHT_TEXT};
                }
                /* Full width chart */
                .chart-box.full-width {
                    grid-column: span 2;
                }
                /* Tables Row */
                .tables-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .table-box {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1rem;
                    overflow-x: auto;
                }
                .table-box.full-width {
                    grid-column: span 2;
                }
                .table-box h3 {
                    margin: 0 0 1rem 0;
                    font-size: 1rem;
                    font-weight: 600;
                    color: ${LIGHT_TEXT};
                }
                #tanami-dashboard s-data-table {
                    --s-data-table-background: ${DARK_SURFACE};
                    --s-data-table-border-color: ${DARK_BORDER};
                    color: ${LIGHT_TEXT};
                }
                /* Scrollbar styling */
                #tanami-dashboard ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                #tanami-dashboard ::-webkit-scrollbar-track {
                    background: ${DARK_BG};
                }
                #tanami-dashboard ::-webkit-scrollbar-thumb {
                    background: ${DARK_BORDER};
                    border-radius: 4px;
                }
                #tanami-dashboard ::-webkit-scrollbar-thumb:hover {
                    background: ${GREEN_ACCENT};
                }
                /* Responsive */
                @media (max-width: 768px) {
                    .metrics-row { grid-template-columns: repeat(2, 1fr); }
                    .charts-row { grid-template-columns: 1fr; }
                    .tables-row { grid-template-columns: 1fr; }
                    .chart-box.full-width, .table-box.full-width { grid-column: span 1; }
                }
            `}</style>

            {/* Metric Boxes Row - 4 Horizontal */}
            <div className="metrics-row">
                <div className="metric-box">
                    <h3>Visitors Tracked</h3>
                    <div className="value">{metrics?.totalSessions || 0}</div>
                </div>
                <div className="metric-box">
                    <h3>HVP Count (Total)</h3>
                    <div className="value">{metrics?.hvpCount || 0}</div>
                </div>
                <div className="metric-box">
                    <h3>Emails Captured</h3>
                    <div className="value">{metrics?.emailsCaptured || 0}</div>
                </div>
                <div className="metric-box">
                    <h3>Avg Lead Score</h3>
                    <div className="value">{metrics?.avgLeadScore || 0}</div>
                </div>
            </div>

            {/* Charts Row 1 - Weekly Activity (Full Width) */}
            <div className="charts-row">
                <div className="chart-box full-width">
                    <h3>Weekly Event Activity</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={eventTrends}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={DARK_BORDER} />
                            <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} stroke={LIGHT_TEXT} />
                            <YAxis fontSize={12} tickLine={false} axisLine={false} stroke={LIGHT_TEXT} />
                            <Tooltip
                                contentStyle={{ backgroundColor: DARK_SURFACE, borderColor: DARK_BORDER, color: LIGHT_TEXT }}
                                itemStyle={{ color: GREEN_ACCENT }}
                                cursor={{ fill: DARK_BORDER, opacity: 0.4 }}
                            />
                            <Bar dataKey="count" fill={GREEN_ACCENT} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Charts Row 2 - Two Charts Side by Side */}
            <div className="charts-row">
                <div className="chart-box">
                    <h3>Lead Stage Distribution</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie
                                data={stageDistribution}
                                dataKey="count"
                                nameKey="stage"
                                cx="50%"
                                cy="50%"
                                outerRadius={90}
                                label={{ fill: LIGHT_TEXT, fontSize: 12 }}
                            >
                                {stageDistribution.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={GREEN_SHADES[index % GREEN_SHADES.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: DARK_SURFACE, borderColor: DARK_BORDER, color: LIGHT_TEXT }}
                            />
                            <Legend wrapperStyle={{ color: LIGHT_TEXT }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-box">
                    <h3>Top Event Types (Leads)</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={topEvents} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={DARK_BORDER} />
                            <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} stroke={LIGHT_TEXT} />
                            <YAxis dataKey="type" type="category" fontSize={10} tickLine={false} axisLine={false} width={100} stroke={LIGHT_TEXT} />
                            <Tooltip
                                contentStyle={{ backgroundColor: DARK_SURFACE, borderColor: DARK_BORDER, color: LIGHT_TEXT }}
                                itemStyle={{ color: GREEN_ACCENT }}
                                cursor={{ fill: DARK_BORDER, opacity: 0.4 }}
                            />
                            <Bar dataKey="count" fill={GREEN_ACCENT} radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Lead Journey Section */}
            <div className="charts-row">
                <div className="chart-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h3>Lead Journey</h3>
                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>Avg Session</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: GREEN_ACCENT }}>
                                {leadJourneyData?.avgSessionMinutes || 0} min
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>Paid Traffic</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                {leadJourneyData?.paidPercentage || 0}%
                            </div>
                        </div>
                    </div>
                </div>
                <div className="chart-box">
                    <h3>Traffic Sources (with Paid Overlay)</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={leadJourneyData?.referrerDistribution || []} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={DARK_BORDER} />
                            <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} stroke={LIGHT_TEXT} domain={[0, 100]} unit="%" />
                            <YAxis dataKey="source" type="category" fontSize={10} tickLine={false} axisLine={false} width={120} stroke={LIGHT_TEXT} />
                            <Tooltip
                                contentStyle={{ backgroundColor: DARK_SURFACE, borderColor: DARK_BORDER, color: LIGHT_TEXT }}
                                formatter={(value: any) => [`${value}%`, 'Share']}
                            />
                            <Bar dataKey="percentage" fill={GREEN_ACCENT} radius={[0, 4, 4, 0]} />
                            <ReferenceLine x={leadJourneyData?.paidPercentage || 0} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" label={{ value: `Paid: ${leadJourneyData?.paidPercentage || 0}%`, fill: '#f59e0b', fontSize: 10, position: 'top' }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );

    const renderKB = () => (
        <s-section heading="Feed the Brain">
            <s-stack gap="base">
                <s-text>Add new text chunks to the knowledge base. This data is stored locally and used for RAG context.</s-text>

                {actionData?.success && <s-banner tone="success" heading="Added to Knowledge Base!"></s-banner>}
                {actionData?.error && <s-banner tone="critical" heading={actionData.error}></s-banner>}

                <Form method="post">
                    <s-stack gap="base">
                        <s-text-field
                            label="Knowledge Content"
                            name="kb_content"
                            rows="6"
                            placeholder="Ex: Our return policy is 30 days..."
                        ></s-text-field>
                        <s-button variant="primary" type="submit">Submit to Brain</s-button>
                    </s-stack>
                </Form>
            </s-stack>
        </s-section>
    );

    return (
        <s-page>
            <s-text slot="title">Leki x Tanami</s-text>
            {error && <s-banner tone="critical" heading={error}></s-banner>}

            <s-tabs
                ref={tabsRef}
            >
                <s-tab id="dashboard" label="Dashboard" selected={selectedTab === "dashboard"}></s-tab>
                <s-tab id="kb" label="Knowledge Base" selected={selectedTab === "kb"}></s-tab>
            </s-tabs>

            <s-box padding="base">
                {selectedTab === "dashboard" && renderDashboard()}
                {selectedTab === "kb" && renderKB()}
            </s-box>
        </s-page>
    );
}

function MetricCard({ title, value }: { title: string; value: string | number }) {
    return (
        <s-section heading={title}>
            <s-box padding="base">
                <s-text font-weight="bold">{value}</s-text>
            </s-box>
        </s-section>
    )
}
