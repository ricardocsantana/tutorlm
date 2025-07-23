import os
import io
import uuid
import base64
import httpx
import faiss
import fitz
import logging
from dotenv import load_dotenv
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool

# RAG & Model Imports
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_community.docstore import InMemoryDocstore
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.embeddings import Embeddings
from langchain_core.messages import HumanMessage

# Imports for CLIP & Image Processing
import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

# Configure logging
logging.basicConfig(
    level=logging.INFO, # Change to DEBUG to see more detailed logs if needed
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# --- INITIALIZATION ---
load_dotenv()

# --- CONFIGURATION ---
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL")
MULTIMODAL_MODEL_NAME = "google/gemma-3n-e4b-it"
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

# --- IN-MEMORY STATE & MODEL LOADING ---
logging.info("Initializing application state...")
rag_state = { "text_retriever": None, "image_vector_store": None }

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
logging.info(f"Using device: {device}")

logging.info("Loading text embedding model...")
text_embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={'device': device}
)

logging.info("Loading CLIP model...")
clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

logging.info("Initializing LLM client...")
llm = ChatOpenAI(
    model=MULTIMODAL_MODEL_NAME,
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
    max_tokens=512,
)
logging.info("All models loaded successfully.")

# --- HELPER FUNCTIONS & CLASSES ---
def get_image_embedding(image: Image.Image) -> list:
    with torch.no_grad():
        inputs = clip_processor(images=image, return_tensors="pt").to(device)
        image_features = clip_model.get_image_features(**inputs)
    return image_features.cpu().numpy()

def get_text_embedding_for_image_search(text: str) -> list:
    with torch.no_grad():
        inputs = clip_processor(text=text, return_tensors="pt").to(device)
        text_features = clip_model.get_text_features(**inputs)
    return text_features.cpu().numpy()

def image_to_base64_data_url(filepath: str) -> str:
    ext = Path(filepath).suffix[1:].lower()
    with open(filepath, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode()
    return f"data:image/{ext};base64,{encoded_string}"

class ClipEmbeddings(Embeddings):
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError("This class is for search queries, not indexing.")
    def embed_query(self, text: str) -> List[float]:
        return get_text_embedding_for_image_search(text).flatten().tolist()

clip_embedding_function = ClipEmbeddings()


# --- FASTAPI APP SETUP ---
app = FastAPI()

logging.info(f"Configuring CORS for origin: {FRONTEND_URL}")
if not FRONTEND_URL:
    logging.warning("FRONTEND_URL is not set in .env file. CORS may block requests.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL] if FRONTEND_URL else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- SYNCHRONOUS BLOCKING FUNCTIONS ---
def process_pdf_data(file_content: bytes, filename: str) -> Dict[str, Any]:
    filepath = UPLOADS_DIR / f"{uuid.uuid4()}{Path(filename).suffix}"
    try:
        with open(filepath, "wb") as buffer:
            buffer.write(file_content)

        loader = PyPDFLoader(str(filepath))
        docs = loader.load()
        if not docs:
            raise HTTPException(status_code=400, detail="Could not load any content from the PDF.")

        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        splits = text_splitter.split_documents(docs)
        if not splits:
            raise HTTPException(status_code=400, detail="Could not extract text. PDF might be image-based or empty.")

        # Batch processing to prevent memory overload
        batch_size = 32
        vectorstore = FAISS.from_documents(documents=splits[:batch_size], embedding=text_embeddings)
        for i in range(batch_size, len(splits), batch_size):
            vectorstore.add_documents(documents=splits[i:i+batch_size])

        rag_state["text_retriever"] = vectorstore.as_retriever(search_kwargs={"k": 3})

        image_data_url = None
        with fitz.open(filepath) as pdf_doc:
            if len(pdf_doc) > 0:
                page = pdf_doc[0]
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                base64_image = base64.b64encode(img_bytes).decode("utf-8")
                image_data_url = f"data:image/png;base64,{base64_image}"

        return {"status": "success", "type": "pdf", "filename": filename, "imageDataUrl": image_data_url}
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


def process_image_data(file_content: bytes, filename: str, display_file_content: bytes = None) -> Dict[str, Any]:
    filepath = UPLOADS_DIR / f"{uuid.uuid4()}{Path(filename).suffix}"
    with open(filepath, "wb") as buffer:
        buffer.write(file_content)

    try:
        image = Image.open(filepath).convert("RGB")
        embedding = get_image_embedding(image)
        embedding_dimension = embedding.shape[1]

        if rag_state["image_vector_store"] is None:
            index = faiss.IndexFlatL2(embedding_dimension)
            rag_state["image_vector_store"] = FAISS(embedding_function=clip_embedding_function, index=index, docstore=InMemoryDocstore(), index_to_docstore_id={})
        
        image_filepath_str = str(filepath)
        image_embedding = embedding.tolist()[0]
        rag_state["image_vector_store"].add_embeddings(
            text_embeddings=[(image_filepath_str, image_embedding)],
            metadatas=[{"filepath": image_filepath_str}]
        )
        
        # If a separate display file is provided, encode that for the frontend.
        # Otherwise, fall back to the main processed file.
        if display_file_content:
            encoded_string = base64.b64encode(display_file_content).decode()
            image_data_url = f"data:image/png;base64,{encoded_string}"
        else:
            image_data_url = image_to_base64_data_url(image_filepath_str)


        return {"status": "success", "type": "image", "filename": filename, "imageDataUrl": image_data_url}
    except Exception as e:
        # If processing fails, remove the orphaned file
        if os.path.exists(filepath):
            os.remove(filepath)
        raise e


# --- API ENDPOINTS ---
@app.get("/api")
def root():
    return {"status": "TutorLM multimodal backend is running!"}

@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    logging.info(f"Received request for /api/upload-pdf, filename: '{file.filename}'")
    try:
        file_content = await file.read()
        result = await run_in_threadpool(process_pdf_data, file_content, file.filename)
        logging.info(f"Successfully processed PDF '{file.filename}'.")
        return result
    except Exception as e:
        logging.error(f"Error in /api/upload-pdf for file '{file.filename}': {e}", exc_info=True)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...), display_file: UploadFile = File(None)):
    logging.info(f"Received request for /api/upload-image, filename: '{file.filename}'")
    try:
        file_content = await file.read()
        display_file_content = await display_file.read() if display_file else None
        result = await run_in_threadpool(process_image_data, file_content, file.filename, display_file_content)
        logging.info(f"Successfully processed image '{file.filename}'.")
        return result
    except Exception as e:
        logging.error(f"Error in /api/upload-image for file '{file.filename}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process image: {e}")

@app.post("/api/chat")
async def chat_handler(request: Request):
    body = await request.json()
    user_prompt = body.get("prompt")
    logging.info(f"Received chat request with prompt: '{user_prompt[:50]}...'")
    if not user_prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    retrieved_text_context = ""
    retrieved_images = []

    if rag_state["text_retriever"]:
        retrieved_docs = await rag_state["text_retriever"].ainvoke(user_prompt)
        retrieved_text_context = "\n\n".join([doc.page_content for doc in retrieved_docs])

    if rag_state["image_vector_store"] and rag_state["image_vector_store"].index.ntotal > 0:
        retrieved_docs = rag_state["image_vector_store"].similarity_search(user_prompt, k=1)
        for doc in retrieved_docs:
            if "filepath" in doc.metadata:
                retrieved_images.append(image_to_base64_data_url(doc.metadata["filepath"]))

    final_prompt_parts = []
    system_text = "You are TutorLM, a helpful AI assistant. Please format your response using Markdown and LaTeX for maths."
    if retrieved_text_context:
        system_text += f"\n\nUse the following text context to answer the user's question:\n---\n{retrieved_text_context}\n---"
    system_text += f"\n\nUser's question: {user_prompt}"
    
    final_prompt_parts.append({"type": "text", "text": system_text})
    
    for img_data_url in retrieved_images:
        final_prompt_parts.append({"type": "image_url", "image_url": {"url": img_data_url}})

    message = HumanMessage(content=final_prompt_parts)

    async def stream_response():
        async for chunk in llm.astream([message]):
            yield chunk.content

    return StreamingResponse(stream_response(), media_type="text/plain; charset=utf-8")
