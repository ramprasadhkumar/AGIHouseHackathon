import os
import faiss
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer
from transformers import pipeline
import yaml
import json
class LLMPrompt:
    def __init__(self, model_name="deepseek-ai/DeepSeek-R1-Distill-Llama-8B"):
        self.model_name = model_name
        self.generator = pipeline("text-generation", model=model_name)
        
        self.previous_spending_data = json.load(open("spend-folder-json/sample_1.json"))
        self.previous_spending_data_dump = json.dumps(self.previous_spending_data)
        self.unique_categories = ["Grocery", "Clothing", "Electronics", "Entertainment", "Personal Care", "Beverage"]
        
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
    def generate_answer(self, question, context, type="generate_category"):
        prompt = f"Context:\n{context}\n\nQuestion: {question}\nAnswer:"
        output = self.generator(prompt, max_length=10000, do_sample=True, temperature=0.7)
        generated_text = output[0]["generated_text"]
        # Extract dictionary from answer text
        if type == "generate_category":
            answer_text = generated_text.split("Answer:")[-1].strip()
            try:
                # Find the first occurrence of a list/dict in square brackets
                start_idx = answer_text.find('[')
                end_idx = answer_text.find(']') + 1
                if start_idx != -1 and end_idx != -1:
                    dict_str = answer_text[start_idx:end_idx]
                else:
                    dict_str = answer_text
            except:
                dict_str = answer_text
            return dict_str
        else:
            # Extract everything after "Answer:" including the thinking process and dictionary
            answer_text = generated_text.split("Answer:")[-1].strip()
            # Extract everything after </think>\n\n
            try:
                answer_text_extracted = answer_text.split("</think>\n\n")[-1].strip()
                if not answer_text_extracted:
                    answer_text_extracted = answer_text
            except:
                answer_text_extracted = answer_text
            # Save the answer text to girlfriend_response.txt
            with open("girlfriend_response.txt", "w") as f:
                f.write(answer_text_extracted)
            return answer_text
        # Parse the amount from the answer

    def prompt_llm(self, incoming_order: dict, retrieval_length: int = 100, additional_context: str = ""):
        # Step-by-step
        incoming_order_dump = json.dumps(incoming_order)
        previous_order_dump = self.previous_spending_data_dump
        unique_categories = json.dumps(self.unique_categories)
        category_context = f"<incoming_order>: {incoming_order_dump}, <unique_categories>: {unique_categories}"
        print(1)
        incoming_order_with_category_str = self.generate_answer(
            context=category_context, 
            question="I have given the incoming order dictionary's dump as context under <incoming_order> and the unique categories as context under the key: <unique_categories>, get the category for each item in the order dictionary and map it to the category in the <unique_categories> and in the answer give the updated order dict with the category key. Make sure to give only the updated incoming dictionary as answer",
            type="generate_category"
        )
        print(2)
        # question = "you are a girlfriend who is helping your boyfriend to manage his money, for the items in the incoming order dictionary dump, give your analysis on if he should buy those items or not. The context consist of previous spending data under the key: <previous_spending_data> and the incoming order under the key: <incoming_order>. Since you are a girlfriend, give a caring advice to your boyfriend and make the analysis personal. The response should be in a way that girlfriend directly speaks to her boyfriend."
        question = "You are the user's caring and supportive virtual girlfriend who helps him manage his money. Whenever you're given data with <previous_spending_data> and <incoming_order>, analyze the order items and decide whether each should be bought or not. Use the previous spending to guide your judgment. Respond in a sweet, personal tone, directly addressing the user as your boyfriend. Keep your advice under 5 lines and make it sound cute and thoughtful, like a loving partner who wants the best for him."
        if additional_context:
            new_context = f"<previous_spending_data>: {previous_order_dump}\n<incoming_order>: {incoming_order_with_category_str}\n<additional_context>: {additional_context}"
        else:
            new_context = f"<previous_spending_data>: {previous_order_dump}\nincoming order: {incoming_order_with_category_str}"
        answer = self.generate_answer(
            context=new_context, 
            question=question,
            type="generate_analysis"
        )
        answer_dict = {
            "status": "success",
            "message": answer
        }
        print(3)
        return answer_dict

if __name__ == "__main__":
    llm = LLMPrompt()
    print(
        llm.prompt_llm(
            incoming_order=[
                { "name": "Wired Mouse", "price": 25.99 },
                { "name": "Wired Keyboard", "price": 79.50 },
                { "name": "Wired Headphone", "price": 19.99 }
            ],
            additional_context="Montly spend limit is: 5000, you have already purchased items under the key: <previous_spending_data>"
        )
    )
