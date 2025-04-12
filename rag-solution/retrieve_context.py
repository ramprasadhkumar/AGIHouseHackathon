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
            content = []
            for line in f:
                content.append(line)
            # text = ''.join(content)
            # Chunking: simple split by paragraphs or fixed-size windows 
            # chunks = [text[i:i+500] for i in range(0, len(text), 500)]
            all_texts.extend(content)
    return all_texts

# 2. Embed the chunks
def embed_chunks(chunks, model_name="sentence-transformers/all-MiniLM-L6-v2"):
    embedder = SentenceTransformer(model_name)
    embeddings = embedder.encode(chunks, convert_to_numpy=True) # (10, 384)
    return embeddings, chunks

# 3. Build the FAISS index
def build_faiss_index(embeddings):
    dim = embeddings.shape[1] # dim = 384 # embeddings.shape = (10, 384)
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    return index

# 4. Retrieve top-k relevant chunks
def retrieve_relevant_chunks(query, index, chunks, embedder, k=5):
    query_embedding = embedder.encode([query], convert_to_numpy=True)
    distances, indices = index.search(query_embedding, k) # distances.shape = (1, 5) # indices.shape = (1, 5)
    return [chunks[i] for i in indices[0]]

# 5. Generate answer from context
def generate_answer(question, context, model_name="gpt2"):
    prompt = f"Context:\n{context}\n\nQuestion: {question}\nAnswer:"
    generator = pipeline("text-generation", model=model_name)
    output = generator(prompt, max_length=300, do_sample=True, temperature=0.7)
    return output[0]["generated_text"]

# 🧪 Example usage
folder = "/home/ubuntu/AGIHouseHackathon/spend-folder-txt"
question = "What is the total amount spent?"

# Step-by-step
chunks = load_text_files(folder)
embeddings, chunk_texts = embed_chunks(chunks)
faiss_index = build_faiss_index(embeddings)
embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
retrieved = retrieve_relevant_chunks(question, faiss_index, chunk_texts, embedder, k=100)

# Combine retrieved chunks into a single context
context_text = "\n".join(retrieved)
answer = generate_answer(question, context_text, model_name="deepseek-ai/deepseek-coder-6.7b-base")

print("\n💡 Answer:", answer)
