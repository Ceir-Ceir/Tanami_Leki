import { pipeline } from "@xenova/transformers";
import Groq from "groq-sdk";
import prisma from "../db.server";

// Initialize Clients
// Ensure OPENAI_API_KEY (for embeddings) and GROQ_API_KEY (for chat) are in .env
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// Singleton for the extractor to avoid reloading model on every request
let extractor: any = null;

export async function generateEmbedding(text: string): Promise<number[]> {
    if (!extractor) {
        // specific model optimized for sentence embeddings
        extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }

    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
}

export async function searchKnowledgeBase(embedding: number[]) {
    // Query Supabase via Prisma raw query for vector similarity
    // Note: We use queryRaw because Prisma doesn't natively support pgvector syntax strongly yet
    const vectorStr = `[${embedding.join(",")}]`;

    // Adjust threshold (0.5) and limit (5) as needed
    const chunks = await prisma.$queryRaw`
    SELECT id, content, metadata, 1 - (embedding <=> ${vectorStr}::vector) as similarity
    FROM kb_chunks
    WHERE 1 - (embedding <=> ${vectorStr}::vector) > 0.5
    ORDER BY similarity DESC
    LIMIT 5
  `;

    return chunks as Array<{ content: string; similarity: number }>;
}

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

export async function processChat(query: string) {
    try {
        const embedding = await generateEmbedding(query);
        const results = await searchKnowledgeBase(embedding);

        // If no good matches
        if (results.length === 0) {
            return {
                answer: "I'm sorry, I couldn't find any information about that in my knowledge base. Please try asking differently or contact support.",
                sources: []
            };
        }

        const contextChunks = results.map(r => r.content);
        const answer = await generateAnswer(query, contextChunks);

        return {
            answer,
            sources: results // Optional: return sources to UI
        };
    } catch (error) {
        console.error("RAG Error:", error);
        return {
            answer: "I'm having trouble connecting to my brain right now. Please try again later.",
            sources: []
        }
    }
}
