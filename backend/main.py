import os
import uuid
import base64
import fitz  # PyMuPDF
import logging
import torch
import httpx # <-- Added for making API calls to Unsplash
import aiofiles  # Add this import at the top
import wave
from dotenv import load_dotenv
from pathlib import Path
from typing import Dict, Any
from collections import defaultdict, deque

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.concurrency import run_in_threadpool

# RAG & Model Imports
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.messages import HumanMessage, SystemMessage
from piper import PiperVoice, SynthesisConfig

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
MULTIMODAL_MODEL_NAME = "google/gemma-3n-e4b-it"
#MULTIMODAL_MODEL_NAME = "google/gemini-2.5-flash"
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)
TEXT_SIM_THRESHOLD = float(os.getenv("TEXT_SIM_THRESHOLD", "0.5"))

# --- IN-MEMORY STATE & MODEL LOADING ---
logging.info("Initializing application state...")
rag_state = { "text_retriever": None }
current_language = {"lang": "en_US"}  # Default language
difficulty_level = {"difficulty": "easy"}  # Default difficulty

# --- CHAT HISTORY STATE ---
MAX_CHAT_HISTORY = 5
chat_histories = defaultdict(lambda: deque(maxlen=MAX_CHAT_HISTORY))

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
logging.info(f"Using device: {device}")

# --- TTS ENDPOINT ---
VOICE_MODEL_PATHS = {
    "en_US": os.getenv("PIPER_VOICE_PATH_EN", "voices/en_US-lessac-medium.onnx"),
    "pt_PT": os.getenv("PIPER_VOICE_PATH_PT", "voices/pt_PT-tug%C3%A3o-medium.onnx"),
    "es_ES": os.getenv("PIPER_VOICE_PATH_ES", "voices/es_ES-sharvard-medium.onnx"),
    # Add more language codes and model paths as needed
}
voice_cache = {}

def get_voice_for_lang(lang: str):
    """Returns a PiperVoice instance for the given language, loading if necessary."""
    if lang not in VOICE_MODEL_PATHS:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {lang}")
    if lang not in voice_cache:
        try:
            voice_cache[lang] = PiperVoice.load(VOICE_MODEL_PATHS[lang])
            logging.info(f"PiperVoice loaded for lang '{lang}' from {VOICE_MODEL_PATHS[lang]}")
        except Exception as e:
            logging.error(f"Failed to load PiperVoice for lang '{lang}': {e}")
            raise HTTPException(status_code=500, detail=f"TTS model not loaded for language '{lang}'.")
    return voice_cache[lang]

logging.info("Loading text embedding model...")
text_embeddings = HuggingFaceEmbeddings(
    model_name="./local_models/all-MiniLM-L6-v2",
    model_kwargs={'device': device}
)

logging.info(f"Initializing LLM client with model: {MULTIMODAL_MODEL_NAME}...")
llm = ChatOpenAI(
    model=MULTIMODAL_MODEL_NAME,
    base_url="http://127.0.0.1:1234/v1",
    api_key="lmstudio",
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
    session_id = body.get("session_id", "default")
    lang = current_language.get("lang", "en")
    difficulty = difficulty_level.get("difficulty", "easy")
    logging.info(f"Received chat request with prompt: '{user_prompt[:50]}...' (lang: {lang})")
    if not user_prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    # --- Check Unsplash availability early ---
    unsplash_available = False
    if UNSPLASH_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                ping = await client.get(
                    "https://api.unsplash.com/photos/random",
                    headers={"Authorization": f"Client-ID {UNSPLASH_API_KEY}"},
                    params={"count": 1}
                )
                if ping.status_code == 200:
                    unsplash_available = True
        except Exception as e:
            logging.warning(f"Unsplash API not reachable: {e}")

    retrieved_text = ""
    if rag_state["text_retriever"]:
        try:
            docs = await rag_state["text_retriever"].ainvoke(user_prompt)
            if docs:
                retrieved_text = "\n\n".join([d.page_content for d in docs])
                logging.info(f"Retrieved {len(docs)} relevant text chunks.")
        except Exception as e:
            logging.error(f"Error during RAG retrieval: {e}")

    # --- Build system prompt, conditionally including image schema ---
    system_text = """
You are TutorLM, an expert visual educator. Your purpose is to convert any given topic into a single, valid JSON array representing a visual learning canvas.

Your entire output MUST be a single, valid JSON array. Do not add explanations or surrounding text.

---

## Core Principles

**Visual Narrative**: Think like a teacher. Design a logical flow from the main topic to key concepts, definitions, and examples.

**Clarity & Brevity**: Keep all text concise. Use bold for key terms and LaTeX for math (e.g., $E=mc^2$).

**Universal Rule**: Every element MUST have a `speakAloud` field containing a brief (1-2 sentence) narration of its content for text-to-speech. The `speakAloud` field must contain plain text (no markdown, no LaTeX).

---

## Layout Rules & Strategy (Canvas: 1920x1080)

**1. Coordinate System & Padding**:
* All `x`, `y` coordinates represent the **top-left corner** of an element.
* A **minimum padding of 40px** MUST be maintained between all elements.
* The bounding box of one element (`x`, `y`, `width`, `height`) must never overlap with another.

**2. Layout Pattern Selection**:
Before generating JSON, choose a layout pattern that fits the topic:
* **Top-Down Flow**: Best for processes or steps. Arrange elements vertically.
* **Columnar**: Best for comparisons or categories. Arrange content in 2-3 vertical columns.
* **Hub & Spoke**: Best for a central topic with related sub-points. Place the main idea in the center and radiate concepts outwards.

**3. Element Sizing**:
* You MUST define an explicit `width` and `height` for every `card` and `image` element.
* To estimate `card` height, start with a base of `120px` and add approximately `40px` for every two lines of content.

---

## Element Colors (card backgroundColor)

- **Key Concept**: `#E3F2FD` (Core ideas or process steps)
- **Definition**: `#E8F5E9` (Explanations of terms)
- **Example**: `#F3E5F5` (Concrete examples)
- **Important Note**: `#FFF3E0` (Crucial facts or tips)

---

## JSON Element Schemas

**1. Text (for titles/labels)**

JSON

{
  "type": "text",
  "content": "Text with **bold** or $math$.",
  "fontSize": 36,
  "x": 100,
  "y": 100,
  "textColor": "#333333",
  "speakAloud": "Spoken-word version of the text."
}

2. Card (for content blocks)

JSON

{
  "type": "card",
  "content": "Main content, using **bold** or bullet points.",
  "fontSize": 20,
  "x": 100,
  "y": 200,
  "width": 350,
  "height": 180,
  "backgroundColor": "#E3F2FD",
  "speakAloud": "A brief explanation of this card's content."
}
3. Line (for connections)

JSON

{
  "type": "line",
  "thickness": "m",
  "x1": 100, "y1": 200,
  "x2": 300, "y2": 400,
  "speakAloud": "Describes the connection (e.g., 'This leads to...')."
}
"""
    # Only add the Image schema if Unsplash is available
    if unsplash_available:
        system_text += """
4. Image (for illustration)
JSON

{
  "type": "image",
  "search": "a simple, clear search query for an image",
  "x": 100,
  "y": 500,
  "width": 150,
  "height": 150,
  "speakAloud": "A description of what the image illustrates."
}
"""

    # Add language and difficulty info to system prompt
    system_text += f"\n\nThe user has selected the language: '{lang}'. Output all text and speakAloud fields in this language."
    system_text += f"\n\nThe user has selected the explanation difficulty: '{difficulty}'. Easy corresponds to elementary level, medium to secondary level, and hard to college level. Make your explanation at this level."

    if retrieved_text:
        system_text += f"\n\nUse the following text context to answer the user's question:\n---\n{retrieved_text}\n---"
    
    messages = [SystemMessage(content=system_text)]

    # --- Add chat history as alternating Human/Assistant messages ---
    history = chat_histories[session_id]
    for turn in history:
        if "user" in turn:
            messages.append(HumanMessage(content=[{"type": "text", "text": turn["user"]}]))
        if "assistant" in turn:
            messages.append(SystemMessage(content=turn["assistant"]))

    # Add current user message
    human_content = [{"type": "text", "text": user_prompt}]

    # Only add image context if Unsplash is available and reachable
    image_files_found = 0
    logging.info(f"Scanning {UPLOADS_DIR} for image context...")
    image_extensions = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
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
        # --- Store the turn in chat history ---
        history.append({"user": user_prompt, "assistant": final_response})
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

@app.post("/api/tts")
async def tts_handler(request: Request):
    """
    Text-to-speech endpoint. Receives JSON: { "text": "..." }
    Returns: WAV audio file.
    """
    data = await request.json()
    text = data.get("text")
    lang = current_language.get("lang", "en_US")
    if not text:
        logging.error("TTS endpoint received request without 'text' field.")
        raise HTTPException(status_code=400, detail="Missing 'text' in request body.")

    try:
        logging.info(f"TTS requested for lang='{lang}' and text='{text[:30]}...'")
        voice = get_voice_for_lang(lang)
    except HTTPException as e:
        logging.error(f"TTS error: {e.detail} (lang='{lang}')")
        raise e
    except Exception as e:
        logging.error(f"Unexpected error in get_voice_for_lang: {e} (lang='{lang}')", exc_info=True)
        raise HTTPException(status_code=500, detail="Unexpected error in TTS language selection.")

    temp_wav_path = UPLOADS_DIR / f"{uuid.uuid4()}.wav"
    syn_config = SynthesisConfig(
        length_scale=1.5,
    )
    try:
        with wave.open(str(temp_wav_path), "wb") as wav_file:
            voice.synthesize_wav(text, wav_file, syn_config=syn_config)
        return FileResponse(
            str(temp_wav_path),
            media_type="audio/wav",
            filename="speech.wav",
            headers={"Content-Disposition": "attachment; filename=speech.wav"}
        )
    except Exception as e:
        logging.error(f"TTS synthesis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="TTS synthesis failed.")
    finally:
        # Optionally, clean up the wav file after sending (if not needed for caching)
        pass

@app.post("/api/set-language")
async def set_language(request: Request):
    """
    Receives the selected language from the frontend and stores it in memory.
    """
    data = await request.json()
    lang = data.get("lang")
    if not lang:
        logging.error("Missing 'lang' in request body.")
        raise HTTPException(status_code=400, detail="Missing 'lang' in request body.")
    # Normalize language code to use underscores
    lang = lang.replace("-", "_")
    current_language["lang"] = lang
    logging.info(f"Language set to: {lang}")
    return {"status": "ok", "lang": lang}

# --- DIFFICULTY ENDPOINT ---
@app.post("/api/set-difficulty")
async def set_difficulty(request: Request):
    """
    Receives the selected difficulty from the frontend and stores it in memory.
    """
    data = await request.json()
    difficulty = data.get("difficulty")
    if not difficulty:
        logging.error("Missing 'difficulty' in request body.")
        raise HTTPException(status_code=400, detail="Missing 'difficulty' in request body.")
    difficulty_level["difficulty"] = difficulty
    logging.info(f"Difficulty set to: {difficulty}")
    return {"status": "ok", "difficulty": difficulty}

