import OpenAI from "openai";
import Groq from "groq-sdk";
import prisma from "../db.server";

// Initialize OpenAI for embeddings
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Groq for chat completions
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
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
 * Search the knowledge base using vector similarity.
 */
export async function searchKnowledgeBase(embedding: number[]) {
    const vectorStr = `[${embedding.join(",")}]`;

    // Query using pgvector cosine distance
    const chunks = await prisma.$queryRaw`
        SELECT id, content, metadata, 1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM kb_chunks
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> ${vectorStr}::vector) > 0.3
        ORDER BY similarity DESC
        LIMIT 5
    `;

    return chunks as Array<{ content: string; similarity: number }>;
}

/**
 * Generate an answer using Groq and the provided context.
 */
export async function generateAnswer(query: string, contextChunks: string[]) {
    const context = contextChunks.join("\n\n---\n\n");

    const systemPrompt = `You are Leki, a helpful AI assistant for this store.
Use the following context to answer the user's question.
If the answer is not in the context, say you don't know but offer to help find contact info.
Keep answers concise and friendly.
  
Context:
${context}
  `;

    const completion = await groq.chat.completions.create({
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.5,
    });

    return completion.choices[0]?.message?.content || "";
}

/**
 * Main RAG pipeline: embed query, search KB, generate answer.
 */
export async function processChat(query: string) {
    try {
        // 1. Generate embedding for the query
        const embedding = await generateEmbedding(query);

        // 2. Search knowledge base
        const results = await searchKnowledgeBase(embedding);

        // 3. If no good matches, return fallback
        if (results.length === 0) {
            return {
                answer: "I'm sorry, I couldn't find any information about that in my knowledge base. Please try asking differently or contact support.",
                sources: []
            };
        }

        // 4. Generate answer using the context
        const contextChunks = results.map(r => r.content);
        const answer = await generateAnswer(query, contextChunks);

        return {
            answer,
            sources: results
        };
    } catch (error) {
        console.error("RAG Error:", error);
        return {
            answer: "I'm having trouble connecting to my brain right now. Please try again later.",
            sources: []
        };
    }
}
