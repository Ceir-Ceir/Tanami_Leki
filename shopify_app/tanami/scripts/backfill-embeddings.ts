/**
 * Backfill embeddings for existing kb_chunks using OpenAI.
 * Run this script with: npx tsx scripts/backfill-embeddings.ts
 * 
 * Uses OpenAI text-embedding-3-small which produces 1536-dimensional embeddings.
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://acmueqibtcyggwvrboii.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseKey) {
    console.error("Missing SUPABASE_KEY in environment");
    process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });
    return response.data[0].embedding;
}

async function backfillEmbeddings() {
    console.log("🔍 Fetching chunks without embeddings...");

    // Fetch chunks that need embeddings
    const { data: chunks, error } = await supabase
        .from("kb_chunks")
        .select("id, content")
        .is("embedding", null)
        .limit(100);

    if (error) {
        console.error("Error fetching chunks:", error);
        return;
    }

    if (!chunks || chunks.length === 0) {
        console.log("✅ All chunks already have embeddings!");
        return;
    }

    console.log(`📝 Found ${chunks.length} chunks to embed...`);
    console.log("   Using OpenAI text-embedding-3-small (1536 dimensions)");

    let successCount = 0;
    let errorCount = 0;

    for (const chunk of chunks) {
        try {
            process.stdout.write(`  Embedding chunk ${chunk.id.slice(0, 8)}...`);

            const embedding = await generateEmbedding(chunk.content);

            // Update the chunk with the embedding
            const { error: updateError } = await supabase
                .from("kb_chunks")
                .update({ embedding: embedding })
                .eq("id", chunk.id);

            if (updateError) {
                console.log(` ❌ Error: ${updateError.message}`);
                errorCount++;
            } else {
                console.log(` ✅`);
                successCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err: any) {
            console.log(` ❌ Error: ${err.message}`);
            errorCount++;
        }
    }

    console.log("\n📊 Backfill complete!");
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
}

backfillEmbeddings().catch(console.error);
