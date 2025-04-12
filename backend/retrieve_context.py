import os
import faiss
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer
from transformers import pipeline
import yaml

class LLMPrompt:
    def __init__(self, model_name="deepseek-ai/DeepSeek-R1-Distill-Llama-8B"):
        self.model_name = model_name
        self.generator = pipeline("text-generation", model=model_name)
        # 🧪 Example usage
        self.folder = "spend-folder-txt"
        # question = "What is the total amount spent?"

        with open("../rag-solution/config.yaml", "r") as f:
            config = yaml.safe_load(f)

        self.test_mode = config["test_mode"]
        self.chunks = self.load_text_files(self.folder)
        self.embeddings, self.chunk_texts = self.embed_chunks(self.chunks)
        self.faiss_index = self.build_faiss_index(self.embeddings)
        self.embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        
    # 1. Load and chunk text data
    def load_text_files(self, folder_path):
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
    def embed_chunks(self, chunks, model_name="sentence-transformers/all-MiniLM-L6-v2"):
        embedder = SentenceTransformer(model_name)
        embeddings = embedder.encode(chunks, convert_to_numpy=True) # (10, 384)
        return embeddings, chunks

    # 3. Build the FAISS index
    def build_faiss_index(self, embeddings):
        dim = embeddings.shape[1] # dim = 384 # embeddings.shape = (10, 384)
        index = faiss.IndexFlatL2(dim)
        index.add(embeddings)
        return index

    # 4. Retrieve top-k relevant chunks
    def retrieve_relevant_chunks(self, query, index, chunks, embedder, k=5):
        k = min(k, len(chunks))
        query_embedding = embedder.encode([query], convert_to_numpy=True)
        distances, indices = index.search(query_embedding, k) # distances.shape = (1, 5) # indices.shape = (1, 5)
        return [chunks[i] for i in indices[0]]

    # 5. Generate answer from context
    def generate_answer(self, question, context):
        prompt = f"Context:\n{context}\n\nQuestion: {question}\nAnswer:"
        output = self.generator(prompt, max_length=10000, do_sample=True, temperature=0.7)
        generated_text = output[0]["generated_text"]
        amount = None
        # Parse the amount from the answer
        try:
            # Look for "Answer:" followed by a dollar amount
            if "Answer:" in generated_text:
                answer_text = generated_text.split("Answer:")[-1]
                # Find dollar amount, looking for \boxed{number} format
                import re
                amount_match = re.search(r'\\boxed{([\d.]+)}', answer_text)
                if amount_match:
                    return float(amount_match.group(1)), answer_text
                # Fallback to looking for $ followed by number
                amount_match = re.search(r'\$\s*([\d,.]+)', answer_text)
                if amount_match:
                    amount = amount_match.group(1).replace(',', '')
                    return float(amount), answer_text
            return amount, generated_text
        except:
            return amount, generated_text

    def prompt_llm(self, question: str, retrieval_length: int = 100):
        # Step-by-step
        retrieved = self.retrieve_relevant_chunks(question, self.faiss_index, self.chunk_texts, self.embedder, k=retrieval_length)
        print(1)
        # Combine retrieved chunks into a single context
        context_text = "\n".join(retrieved)
        print(2)
        # answer = generate_answer(question, context_text, model_name="deepseek-ai/deepseek-coder-6.7b-base")
        answer, generated_text = self.generate_answer(question, context_text)
        print(3,answer)
        if isinstance(answer, float):
            answer = {
                "message": f"The total amount spent is ${answer:.2f}",
                "status": "Yes",
                "amount": answer,
                "generated_text": generated_text
            }
        else:
            answer = {
                "message": generated_text,
                "status": "No/Not sure"
            }
        print(4)
        return answer

if __name__ == "__main__":
    llm = LLMPrompt()
    print(llm.prompt_llm("What is the total amount spent?"))
