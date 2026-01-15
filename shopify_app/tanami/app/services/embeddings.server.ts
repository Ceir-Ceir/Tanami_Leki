import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate embeddings using OpenAI's text-embedding-3-small model.
 * Returns a 1536-dimensional vector.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });

    return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a batch.
 * More efficient than calling one at a time.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
    });

    return response.data.map(d => d.embedding);
}
