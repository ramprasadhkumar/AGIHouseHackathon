import os
import faiss
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer
from transformers import pipeline

# 1. Load and chunk text data
def load_text_files(folder_path):
    all_texts = []
    for file_path in Path(folder_path).rglob("*.txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            # Chunking: simple split by paragraphs or fixed-size windows
            chunks = [content[i:i+500] for i in range(0, len(content), 500)]
            all_texts.extend(chunks)
    return all_texts

# 2. Embed the chunks
def embed_chunks(chunks, model_name="sentence-transformers/all-MiniLM-L6-v2"):
    embedder = SentenceTransformer(model_name)
    embeddings = embedder.encode(chunks, convert_to_numpy=True)
    return embeddings, chunks

# 3. Build the FAISS index
def build_faiss_index(embeddings):
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    return index

# 4. Retrieve top-k relevant chunks
def retrieve_relevant_chunks(query, index, chunks, embedder, k=5):
    query_embedding = embedder.encode([query], convert_to_numpy=True)
    distances, indices = index.search(query_embedding, k)
    return [chunks[i] for i in indices[0]]

# 5. Generate answer from context
def generate_answer(question, context, model_name="gpt2"):
    prompt = f"Context:\n{context}\n\nQuestion: {question}\nAnswer:"
    generator = pipeline("text-generation", model=model_name)
    output = generator(prompt, max_length=300, do_sample=True, temperature=0.7)
    return output[0]["generated_text"]

# 🧪 Example usage
folder = "path_to_your_text_folder"
question = "What are the main challenges discussed?"

# Step-by-step
chunks = load_text_files(folder)
embeddings, chunk_texts = embed_chunks(chunks)
faiss_index = build_faiss_index(embeddings)
embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
retrieved = retrieve_relevant_chunks(question, faiss_index, chunk_texts, embedder)

# Combine retrieved chunks into a single context
context_text = "\n".join(retrieved)
answer = generate_answer(question, context_text)

print("\n💡 Answer:", answer)
