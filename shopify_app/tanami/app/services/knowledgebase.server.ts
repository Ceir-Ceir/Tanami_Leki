import db from "../db.server";

export interface KBDocument {
    id: string;
    title: string;
    source_url: string | null;
    source_type: string | null;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface KBChunk {
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    metadata: any;
    created_at: Date;
}

/**
 * Split text into overlapping character chunks for vector storage.
 */
export function chunkText(text: string, chunkSize: number = 1200, overlap: number = 150): string[] {
    if (chunkSize <= overlap) {
        throw new Error("chunkSize must be greater than overlap");
    }

    const normalized = (text || "").trim();
    if (!normalized) {
        return [];
    }

    const chunks: string[] = [];
    let start = 0;
    const step = chunkSize - overlap;

    while (start < normalized.length) {
        const end = start + chunkSize;
        chunks.push(normalized.slice(start, end));
        start += step;
    }

    return chunks;
}

/**
 * Fetch all knowledge base documents.
 */
export async function listKBDocuments(includeDisabled: boolean = true): Promise<KBDocument[]> {
    const where = includeDisabled ? {} : { enabled: true };

    const docs = await db.kb_documents.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: 200,
    });

    return docs as unknown as KBDocument[];
}

/**
 * Get a single document with its chunks.
 */
export async function getKBDocumentWithChunks(documentId: string) {
    const document = await db.kb_documents.findUnique({
        where: { id: documentId },
        include: { kb_chunks: { orderBy: { chunk_index: "asc" } } },
    });

    return document;
}

/**
 * Create a new knowledge base document.
 */
export async function createKBDocument(
    title: string,
    sourceUrl: string | null = null,
    sourceType: string = "other",
    enabled: boolean = true
): Promise<KBDocument> {
    const doc = await db.kb_documents.create({
        data: {
            title,
            source_url: sourceUrl,
            source_type: sourceType,
            enabled,
        },
    });

    return doc as unknown as KBDocument;
}

/**
 * Insert chunks for a document.
 */
export async function insertChunksForDocument(
    documentId: string,
    chunks: string[]
): Promise<number> {
    if (chunks.length === 0) {
        return 0;
    }

    const chunkData = chunks.map((content, index) => ({
        document_id: documentId,
        chunk_index: index,
        content,
        metadata: {},
    }));

    await db.kb_chunks.createMany({
        data: chunkData,
    });

    return chunkData.length;
}

/**
 * Create a document and ingest text content as chunks.
 */
export async function ingestKnowledgeText(
    title: string,
    content: string,
    sourceUrl: string | null = null,
    sourceType: string = "other",
    enabled: boolean = true,
    chunkSize: number = 1200,
    overlap: number = 150
): Promise<{ document: KBDocument; chunksInserted: number }> {
    // Create the document
    const document = await createKBDocument(title, sourceUrl, sourceType, enabled);

    // Chunk the text
    const chunks = chunkText(content, chunkSize, overlap);

    // Insert chunks
    const chunksInserted = await insertChunksForDocument(document.id, chunks);

    return { document, chunksInserted };
}

/**
 * Toggle document enabled status.
 */
export async function toggleKBDocumentEnabled(documentId: string, enabled: boolean): Promise<KBDocument> {
    const doc = await db.kb_documents.update({
        where: { id: documentId },
        data: { enabled, updated_at: new Date() },
    });

    return doc as unknown as KBDocument;
}

/**
 * Delete a knowledge base document (chunks will cascade delete).
 */
export async function deleteKBDocument(documentId: string): Promise<void> {
    await db.kb_documents.delete({
        where: { id: documentId },
    });
}

/**
 * Get summary stats for the knowledge base.
 */
export async function getKBStats(): Promise<{
    totalDocuments: number;
    enabledDocuments: number;
    totalChunks: number;
}> {
    const [totalDocuments, enabledDocuments, totalChunks] = await Promise.all([
        db.kb_documents.count(),
        db.kb_documents.count({ where: { enabled: true } }),
        db.kb_chunks.count(),
    ]);

    return { totalDocuments, enabledDocuments, totalChunks };
}
