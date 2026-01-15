import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { useRef, useEffect } from "react";
import {
    listKBDocuments,
    ingestKnowledgeText,
    deleteKBDocument,
    toggleKBDocumentEnabled,
    getKBStats,
} from "../services/knowledgebase.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await authenticate.admin(request);

    const [documents, stats] = await Promise.all([
        listKBDocuments(true),
        getKBStats(),
    ]);

    return { documents, stats };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await authenticate.admin(request);

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    try {
        if (intent === "create") {
            const title = formData.get("title") as string;
            const content = formData.get("content") as string;
            const sourceUrl = formData.get("sourceUrl") as string;
            const sourceType = formData.get("sourceType") as string;
            const enabled = formData.get("enabled") === "on";

            if (!title?.trim()) {
                return { error: "Title is required" };
            }

            if (!content?.trim()) {
                return { error: "Content is required" };
            }

            const result = await ingestKnowledgeText(
                title.trim(),
                content.trim(),
                sourceUrl?.trim() || null,
                sourceType || "other",
                enabled
            );

            return {
                success: `Created document "${result.document.title}" with ${result.chunksInserted} chunks`,
            };
        }

        if (intent === "delete") {
            const documentId = formData.get("documentId") as string;
            await deleteKBDocument(documentId);
            return { success: "Document deleted successfully" };
        }

        if (intent === "toggle") {
            const documentId = formData.get("documentId") as string;
            const enabled = formData.get("enabled") === "true";
            await toggleKBDocumentEnabled(documentId, enabled);
            return { success: `Document ${enabled ? "enabled" : "disabled"}` };
        }

        return { error: "Unknown action" };
    } catch (error: any) {
        console.error("Knowledge base action error:", error);
        return { error: error.message || "An error occurred" };
    }
};

export default function KnowledgeBasePage() {
    const { documents, stats } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isLoading = navigation.state === "submitting";
    const formRef = useRef<HTMLFormElement>(null);

    // Clear form after successful submission
    useEffect(() => {
        if (actionData?.success && actionData.success.includes("Created document")) {
            formRef.current?.reset();
        }
    }, [actionData]);

    // Styling constants matching dashboard
    const GREEN_ACCENT = "#22c55e";
    const DARK_BG = "#0e110e";
    const DARK_SURFACE = "#1a1f1a";
    const DARK_BORDER = "#2d362d";
    const LIGHT_TEXT = "#e8f5e9";

    return (
        <s-page>
            <s-text slot="title">Knowledge Base</s-text>

            <style>{`
                #kb-container {
                    background-color: ${DARK_BG};
                    color: ${LIGHT_TEXT};
                    padding: 1.5rem;
                    border-radius: 12px;
                }
                .kb-stats-row {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .kb-stat-box {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1.25rem;
                    text-align: center;
                }
                .kb-stat-box h3 {
                    margin: 0 0 0.5rem 0;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: ${LIGHT_TEXT};
                    opacity: 0.8;
                }
                .kb-stat-box .value {
                    font-size: 2rem;
                    font-weight: bold;
                    color: ${GREEN_ACCENT};
                }
                .kb-form-section {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1.5rem;
                    margin-bottom: 1.5rem;
                }
                .kb-form-section h2 {
                    margin: 0 0 0.5rem 0;
                    font-size: 1.125rem;
                    font-weight: 600;
                    color: ${LIGHT_TEXT};
                }
                .kb-form-section p {
                    margin: 0 0 1rem 0;
                    font-size: 0.875rem;
                    opacity: 0.7;
                }
                .kb-form-row {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .kb-form-row.full {
                    flex-direction: column;
                }
                .kb-form-group {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .kb-form-group label {
                    font-size: 0.875rem;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    color: ${LIGHT_TEXT};
                }
                .kb-form-group input,
                .kb-form-group select,
                .kb-form-group textarea {
                    background-color: ${DARK_BG};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 6px;
                    padding: 0.75rem;
                    color: ${LIGHT_TEXT};
                    font-size: 0.875rem;
                }
                .kb-form-group input:focus,
                .kb-form-group select:focus,
                .kb-form-group textarea:focus {
                    outline: none;
                    border-color: ${GREEN_ACCENT};
                }
                .kb-form-group textarea {
                    min-height: 150px;
                    resize: vertical;
                }
                .kb-checkbox-row {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }
                .kb-checkbox-row input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    accent-color: ${GREEN_ACCENT};
                }
                .kb-submit-btn {
                    background-color: ${GREEN_ACCENT};
                    color: #000;
                    border: none;
                    border-radius: 6px;
                    padding: 0.75rem 1.5rem;
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: opacity 0.2s;
                }
                .kb-submit-btn:hover {
                    opacity: 0.9;
                }
                .kb-submit-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .kb-docs-section {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1.5rem;
                }
                .kb-docs-section h2 {
                    margin: 0 0 1rem 0;
                    font-size: 1.125rem;
                    font-weight: 600;
                    color: ${LIGHT_TEXT};
                }
                .kb-docs-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .kb-docs-table th,
                .kb-docs-table td {
                    padding: 0.75rem;
                    text-align: left;
                    border-bottom: 1px solid ${DARK_BORDER};
                }
                .kb-docs-table th {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    opacity: 0.7;
                }
                .kb-docs-table td {
                    font-size: 0.875rem;
                }
                .kb-badge {
                    display: inline-block;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                .kb-badge.enabled {
                    background-color: ${GREEN_ACCENT};
                    color: #000;
                }
                .kb-badge.disabled {
                    background-color: #ef4444;
                    color: #fff;
                }
                .kb-action-btn {
                    background-color: transparent;
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 4px;
                    padding: 0.375rem 0.75rem;
                    font-size: 0.75rem;
                    color: ${LIGHT_TEXT};
                    cursor: pointer;
                    margin-right: 0.5rem;
                    transition: border-color 0.2s;
                }
                .kb-action-btn:hover {
                    border-color: ${GREEN_ACCENT};
                }
                .kb-action-btn.delete:hover {
                    border-color: #ef4444;
                    color: #ef4444;
                }
                .kb-empty {
                    text-align: center;
                    padding: 2rem;
                    opacity: 0.6;
                }
                @media (max-width: 768px) {
                    .kb-stats-row { grid-template-columns: 1fr; }
                    .kb-form-row { flex-direction: column; }
                }
            `}</style>

            {actionData?.success && (
                <s-banner tone="success" heading={actionData.success}></s-banner>
            )}
            {actionData?.error && (
                <s-banner tone="critical" heading={actionData.error}></s-banner>
            )}

            <s-box padding="base">
                <div id="kb-container">
                    {/* Stats Row */}
                    <div className="kb-stats-row">
                        <div className="kb-stat-box">
                            <h3>Total Documents</h3>
                            <div className="value">{stats.totalDocuments}</div>
                        </div>
                        <div className="kb-stat-box">
                            <h3>Enabled</h3>
                            <div className="value">{stats.enabledDocuments}</div>
                        </div>
                        <div className="kb-stat-box">
                            <h3>Total Chunks</h3>
                            <div className="value">{stats.totalChunks}</div>
                        </div>
                    </div>

                    {/* Add Document Form */}
                    <div className="kb-form-section">
                        <h2>Add New Document</h2>
                        <p>Paste knowledge text to be chunked and stored for RAG retrieval.</p>

                        <Form method="post" ref={formRef}>
                            <input type="hidden" name="intent" value="create" />

                            <div className="kb-form-row">
                                <div className="kb-form-group">
                                    <label htmlFor="title">Title *</label>
                                    <input
                                        type="text"
                                        id="title"
                                        name="title"
                                        placeholder="e.g., Product FAQ, Return Policy"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="kb-form-row">
                                <div className="kb-form-group">
                                    <label htmlFor="sourceType">Source Type</label>
                                    <select id="sourceType" name="sourceType" defaultValue="other">
                                        <option value="other">Other</option>
                                        <option value="web">Web</option>
                                        <option value="pdf">PDF</option>
                                        <option value="faq">FAQ</option>
                                        <option value="support">Support</option>
                                        <option value="product">Product</option>
                                    </select>
                                </div>
                                <div className="kb-form-group">
                                    <label htmlFor="sourceUrl">Source URL (optional)</label>
                                    <input
                                        type="text"
                                        id="sourceUrl"
                                        name="sourceUrl"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div className="kb-form-row full">
                                <div className="kb-form-group">
                                    <label htmlFor="content">Knowledge Content *</label>
                                    <textarea
                                        id="content"
                                        name="content"
                                        placeholder="Paste your knowledge text here. It will be split into chunks for vector storage..."
                                        required
                                    ></textarea>
                                </div>
                            </div>

                            <div className="kb-checkbox-row">
                                <input
                                    type="checkbox"
                                    id="enabled"
                                    name="enabled"
                                    defaultChecked
                                />
                                <label htmlFor="enabled">Enabled (available for RAG queries)</label>
                            </div>

                            <button
                                type="submit"
                                className="kb-submit-btn"
                                disabled={isLoading}
                            >
                                {isLoading ? "Ingesting..." : "Ingest Document"}
                            </button>
                        </Form>
                    </div>

                    {/* Documents Table */}
                    <div className="kb-docs-section">
                        <h2>Documents ({documents.length})</h2>

                        {documents.length === 0 ? (
                            <div className="kb-empty">
                                <p>No documents yet. Add your first knowledge document using the form above.</p>
                            </div>
                        ) : (
                            <table className="kb-docs-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Type</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {documents.map((doc: any) => (
                                        <tr key={doc.id}>
                                            <td>{doc.title}</td>
                                            <td>{doc.source_type || "other"}</td>
                                            <td>
                                                <span className={`kb-badge ${doc.enabled ? "enabled" : "disabled"}`}>
                                                    {doc.enabled ? "Enabled" : "Disabled"}
                                                </span>
                                            </td>
                                            <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <Form method="post" style={{ display: "inline" }}>
                                                    <input type="hidden" name="intent" value="toggle" />
                                                    <input type="hidden" name="documentId" value={doc.id} />
                                                    <input type="hidden" name="enabled" value={(!doc.enabled).toString()} />
                                                    <button type="submit" className="kb-action-btn" disabled={isLoading}>
                                                        {doc.enabled ? "Disable" : "Enable"}
                                                    </button>
                                                </Form>
                                                <Form method="post" style={{ display: "inline" }} onSubmit={(e) => {
                                                    if (!confirm("Delete this document and all its chunks?")) {
                                                        e.preventDefault();
                                                    }
                                                }}>
                                                    <input type="hidden" name="intent" value="delete" />
                                                    <input type="hidden" name="documentId" value={doc.id} />
                                                    <button type="submit" className="kb-action-btn delete" disabled={isLoading}>
                                                        Delete
                                                    </button>
                                                </Form>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </s-box>
        </s-page>
    );
}
