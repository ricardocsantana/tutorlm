import os
import uuid
import base64
import fitz  # PyMuPDF
import logging
import torch
import faiss
import httpx # <-- Added for making API calls to Unsplash
import aiofiles  # Add this import at the top
from dotenv import load_dotenv
from pathlib import Path
from typing import Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool

# RAG & Model Imports
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.messages import HumanMessage, SystemMessage

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# --- INITIALIZATION ---
load_dotenv()

# --- CONFIGURATION ---
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
UNSPLASH_API_KEY = os.getenv("UNSPLASH_ACCESS_KEY") # <-- Added for image search
MULTIMODAL_MODEL_NAME = "openai/gpt-4o"
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)
TEXT_SIM_THRESHOLD = float(os.getenv("TEXT_SIM_THRESHOLD", "0.5"))

# --- IN-MEMORY STATE & MODEL LOADING ---
logging.info("Initializing application state...")
rag_state = { "text_retriever": None }

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
logging.info(f"Using device: {device}")

logging.info("Loading text embedding model...")
text_embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={'device': device}
)

logging.info(f"Initializing LLM client with model: {MULTIMODAL_MODEL_NAME}...")
llm = ChatOpenAI(
    model=MULTIMODAL_MODEL_NAME,
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
    max_tokens=2048,
)
logging.info("All models loaded successfully.")

# --- HELPER FUNCTIONS & CLASSES ---
def image_to_base64_data_url(filepath: str) -> str:
    """Converts an image file to a base64 data URL."""
    try:
        ext = Path(filepath).suffix[1:].lower()
        if ext == "jpg":
            ext = "jpeg"
        with open(filepath, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode()
        return f"data:image/{ext};base64,{encoded_string}"
    except Exception as e:
        logging.error(f"Error converting image {filepath} to base64: {e}")
        return ""


# --- FASTAPI APP SETUP ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- SYNCHRONOUS BLOCKING FUNCTIONS ---
def process_pdf_data(file_content: bytes, filename: str) -> Dict[str, Any]:
    """
    Processes an uploaded PDF file by extracting text for RAG and a preview image of the first page.
    The preview image is saved to UPLOADS_DIR to be used as context in chat.
    """
    temp_pdf_path = UPLOADS_DIR / f"{uuid.uuid4()}.pdf"
    try:
        with open(temp_pdf_path, "wb") as buffer:
            buffer.write(file_content)

        full_text = ""
        with fitz.open(temp_pdf_path) as pdf_doc:
            for page in pdf_doc:
                full_text += page.get_text()

        if not full_text.strip():
            logging.warning(f"No text could be extracted from PDF '{filename}'. It might be image-based.")
        else:
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
            texts = text_splitter.split_text(full_text)
            splits = [Document(page_content=text) for text in texts]

            if not splits:
                logging.warning(f"Text was present in '{filename}' but no splits were generated.")
            else:
                vectorstore = FAISS.from_documents(documents=splits, embedding=text_embeddings)
                
                rag_state["text_retriever"] = vectorstore.as_retriever(
                    search_type="similarity_score_threshold",
                    search_kwargs={"k": 3, "score_threshold": TEXT_SIM_THRESHOLD}
                )
                logging.info(f"Successfully created text retriever for '{filename}'.")

        image_data_url = None
        with fitz.open(temp_pdf_path) as pdf_doc:
            if len(pdf_doc) > 0:
                page = pdf_doc[0]
                pix = page.get_pixmap(dpi=150)
                preview_image_path = UPLOADS_DIR / f"{temp_pdf_path.stem}.png"
                pix.save(str(preview_image_path))
                image_data_url = image_to_base64_data_url(str(preview_image_path))

        return {"status": "success", "type": "pdf", "filename": filename, "imageDataUrl": image_data_url}
    finally:
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)


def process_image_data(file_content: bytes, filename: str) -> Dict[str, Any]:
    """
    Processes and saves an uploaded image file to the UPLOADS_DIR.
    """
    filepath = UPLOADS_DIR / f"{uuid.uuid4()}{Path(filename).suffix}"
    try:
        with open(filepath, "wb") as buffer:
            buffer.write(file_content)

        image_data_url = image_to_base64_data_url(str(filepath))
        return {"status": "success", "type": "image", "filename": filename, "imageDataUrl": image_data_url}
    except Exception as e:
        logging.error(f"Failed to process image data for {filename}: {e}")
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=f"Failed to process image: {e}")


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
async def upload_image(request: Request):
    logging.info(f"Received request for /api/upload-image")
    try:
        form = await request.form()
        file: UploadFile = form.get("file")
        display_file: UploadFile = form.get("display_file")

        if not file:
            raise HTTPException(status_code=400, detail="No 'file' part in the form.")

        file_content = await file.read()
        result = await run_in_threadpool(process_image_data, file_content, file.filename)

        if display_file:
            display_file_content = await display_file.read()
            ext = Path(display_file.filename).suffix.lower()[1:]
            if ext == "jpg":
                ext = "jpeg"
            encoded_string = base64.b64encode(display_file_content).decode()
            display_image_data_url = f"data:image/{ext};base64,{encoded_string}"
            result["displayImageDataUrl"] = display_image_data_url

        logging.info(f"Successfully processed image '{file.filename}'.")
        return result
    except Exception as e:
        logging.error(f"Error in /api/upload-image: {e}", exc_info=True)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to process image: {e}")

# ✨ --- NEW ENDPOINT FOR IMAGE SEARCH --- ✨
@app.get("/api/image-search")
async def image_search(q: str):
    """
    Searches for an image on Unsplash using the provided query 'q' and returns
    the URL, width, and height of the first result.
    Requires an UNSPLASH_API_KEY in the .env file.
    """
    logging.info(f"Received image search request for query: '{q}'")
    if not UNSPLASH_API_KEY:
        logging.error("UNSPLASH_API_KEY is not set. Cannot perform image search.")
        raise HTTPException(
            status_code=501, # 501 Not Implemented
            detail="Image search is not configured on the server (missing API key)."
        )
    if not q:
        raise HTTPException(status_code=400, detail="Search query 'q' cannot be empty.")

    url = "https://api.unsplash.com/search/photos"
    headers = {"Authorization": f"Client-ID {UNSPLASH_API_KEY}", "Accept-Version": "v1"}
    params = {"query": q, "per_page": 1}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()

        data = response.json()
        results = data.get("results")

        if not results:
            raise HTTPException(status_code=404, detail=f"No images found for '{q}'")

        first_image = results[0]
        image_url = first_image.get("urls", {}).get("regular")
        width = first_image.get("width")
        height = first_image.get("height")

        if not all([image_url, width, height]):
             raise HTTPException(status_code=500, detail="Unsplash API returned incomplete image data.")

        return {"imageUrl": image_url, "width": width, "height": height}

    except httpx.HTTPStatusError as e:
        logging.error(f"HTTP error during Unsplash API call: {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=f"Error from image search provider.")
    except Exception as e:
        logging.error(f"An unexpected error occurred during image search: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred during image search.")


@app.post("/api/chat")
async def chat_handler(request: Request):
    body = await request.json()
    user_prompt = body.get("prompt")
    logging.info(f"Received chat request with prompt: '{user_prompt[:50]}...'")
    if not user_prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    retrieved_text = ""
    if rag_state["text_retriever"]:
        try:
            docs = await rag_state["text_retriever"].ainvoke(user_prompt)
            if docs:
                retrieved_text = "\n\n".join([d.page_content for d in docs])
                logging.info(f"Retrieved {len(docs)} relevant text chunks.")
        except Exception as e:
            logging.error(f"Error during RAG retrieval: {e}")

    system_text = """You are TutorLM, an engaging AI tutor that creates visually appealing and educational content on a collaborative canvas (similar to Miro). Your goal is to make learning interactive, clear, and visually compelling.

## Response Format
Respond with a JSON array containing canvas elements. Each element should contribute to an organized, visually cohesive learning experience.

## Element Types & Specifications

### 1. Text Elements
```json
{
  "type": "text",
  "content": "Your text content with **markdown** and $LaTeX$ support",
  "fontSize": 16-24,
  "x": 100,
  "y": 200,
  "color": "#333333" // Optional: use for emphasis or categorization
}
```

### 2. Card Elements (Primary content containers)
```json
{
  "type": "card",
  "content": "Card content with **formatting** and $math$",
  "fontSize": 14-20,
  "x": 100,
  "y": 200,
  "background": "#F8F9FA", // Use varied, pleasant colors
  "width": 250-400, // Optional: specify for better layouts
  "height": 150-300 // Optional: specify for better layouts
}
```

### 3. Connection Lines
```json
{
  "type": "line",
  "thickness": "s|m|l",
  "x1": 100, "y1": 200,
  "x2": 300, "y2": 400,
  "color": "#666666" // Optional: use to show relationships
}
```

### 4. Visual Elements
```json
{
  "type": "image",
  "search": "specific, relevant search query",
  "x": 100,
  "y": 200,
  "height": 150-300,
  "caption": "Brief descriptive caption" // Optional but recommended
}
```

## Design Principles

### Visual Hierarchy
- **Headers**: Use larger fonts (20-24px) for main topics
- **Body text**: Use medium fonts (16-18px) for explanations
- **Details**: Use smaller fonts (14-16px) for supplementary info

### Color Coding System
- **Key concepts**: `#E3F2FD` (light blue)
- **Examples**: `#F3E5F5` (light purple) 
- **Definitions**: `#E8F5E8` (light green)
- **Important notes**: `#FFF3E0` (light orange)
- **Warnings/Common mistakes**: `#FFEBEE` (light red)

### Spacing & Layout
- Leave 50-100px between related elements
- Leave 150-200px between different topic sections
- Create logical flow: left-to-right or top-to-bottom
- Group related concepts with consistent spacing

### Content Enhancement
- Use **bold** for key terms and important points
- Use *italics* for emphasis or examples
- Include $LaTeX$ for mathematical expressions: `$x^2 + y^2 = r^2$`
- Add relevant emojis sparingly for visual appeal: 📊 💡 ⚡ 🎯

## Response Guidelines

1. **Start with a clear title/header** that summarizes the topic
2. **Create logical sections** with distinct visual separation
3. **Use connecting lines** to show relationships between concepts
4. **Include visual elements** (images/diagrams) when they enhance understanding
5. **Provide examples** in visually distinct cards
6. **End with key takeaways** or next steps when appropriate

## Content Quality Standards
- Make explanations clear
- Break complex topics into digestible chunks
- Provide concrete examples alongside abstract concepts
- Include mnemonics or memory aids when helpful
- Connect new information to familiar concepts

Remember: Create canvas layouts that are both educational and visually engaging. Students should be able to follow the flow of information naturally while being drawn in by the appealing visual design."""

    if retrieved_text:
        system_text += f"\n\nUse the following text context to answer the user's question:\n---\n{retrieved_text}\n---"
    
    messages = [SystemMessage(content=system_text)]
    
    human_content = [{"type": "text", "text": user_prompt}]
    
    logging.info(f"Scanning {UPLOADS_DIR} for image context...")
    image_extensions = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    image_files_found = 0
    for f in sorted(UPLOADS_DIR.glob("*")):
        if f.is_file() and f.suffix.lower() in image_extensions:
            data_url = image_to_base64_data_url(str(f))
            if data_url:
                human_content.append({"type": "image_url", "image_url": {"url": data_url}})
                image_files_found += 1

    logging.info(f"Added {image_files_found} images to the prompt.")
    messages.append(HumanMessage(content=human_content))

    async def stream_response():
        response_chunks = []
        try:
            async for chunk in llm.astream(messages):
                response_chunks.append(chunk.content)
                yield chunk.content
        except Exception as e:
            logging.error(f"Error during LLM stream: {e}", exc_info=True)
            yield "Sorry, an error occurred while generating the response."
        # Log the final response after streaming
        final_response = "".join(response_chunks)
        async with aiofiles.open("llm_responses.txt", "a") as log_file:
            await log_file.write(final_response + "\n---\n")

    return StreamingResponse(stream_response(), media_type="text/plain; charset=utf-8")

@app.post("/api/clear")
def clear_all():
    """Clears the RAG state and deletes all files in the uploads directory."""
    logging.info("Clearing application state and uploaded files.")
    rag_state["text_retriever"] = None
    for f in UPLOADS_DIR.glob("*"):
        try:
            if f.is_file():
                f.unlink()
        except OSError as e:
            logging.error(f"Error deleting file {f}: {e}")
    return {"status": "cleared"}

