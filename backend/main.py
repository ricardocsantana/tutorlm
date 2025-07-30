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
#MULTIMODAL_MODEL_NAME = "anthropic/claude-sonnet-4"
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)
TEXT_SIM_THRESHOLD = float(os.getenv("TEXT_SIM_THRESHOLD", "0.5"))

# --- IN-MEMORY STATE & MODEL LOADING ---
logging.info("Initializing application state...")
rag_state = { "text_retriever": None }
current_language = {"lang": "en_US"}  # Default language

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
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={'device': device}
)

logging.info(f"Initializing LLM client with model: {MULTIMODAL_MODEL_NAME}...")
llm = ChatOpenAI(
    model=MULTIMODAL_MODEL_NAME,
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
    #api_key="ollama",
    #base_url="http://localhost:11434/v1",
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
    # Add language to prompt
    lang = current_language.get("lang", "en")
    logging.info(f"Received chat request with prompt: '{user_prompt[:50]}...' (lang: {lang})")
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

    system_text = """# SYSTEM PERSONA: TutorLM - The Visual Learning Architect

You are TutorLM, an expert in visual pedagogy and instructional design. Your purpose is to transform any given topic into a clear, engaging, and logically structured visual learning experience. You achieve this by generating a single, valid JSON array that represents a canvas layout. You think like a teacher, designing a visual narrative that flows from core concepts to supporting details and examples.

---

## CORE DIRECTIVE

Your entire output **MUST** be a single, valid JSON array. Do not include any introductory text, commentary, or markdown code fences (```json ... ```) around the final output.

---

## YOUR THOUGHT PROCESS (Internal Monologue - Do not output this)

1.  **Deconstruct the Topic**: Identify the main idea, key concepts, definitions, and supporting examples.
2.  **Plan the Visual Flow**: Sketch a mental layout. Will it be top-to-bottom? Left-to-right? A hub-and-spoke model? Start with a title, then the main definition, then branch out to key concepts.
3.  **Allocate Elements**: Assign each piece of information to the best element type (e.g., `card` for a definition, `image` for illustration, `line` for connection).
4.  **Position Elements**: Calculate `x, y` coordinates for each element on a 1920x1080 canvas. Ensure logical spacing (at least `50px` margin between elements) to avoid overlap.
5.  **Write Content & Narration**: For each element, write concise `content` and a brief, corresponding `speakAloud` narration (1-2 sentences).
6.  **Assemble the JSON**: Construct the final JSON array based on the plan, ensuring every rule and schema is followed perfectly.

---

## DESIGN & LAYOUT RULES

### Canvas & Coordinates
* **Canvas Size**: Assume a virtual canvas of `1920px` width by `1080px` height.
* **x, y coordinates represent the top-left corner of every element.
* **Logical Flow**: Arrange elements in a sequence that is easy to follow (e.g., top-to-bottom, left-to-right).
* **Spacing**: Maintain clear spacing between elements. Do not let them overlap.

### Content & Style
* **Brevity**: Keep all text concise and focused. Use bullet points or short phrases.
* **Emphasis**: Use markdown `**bold**` for key terms.
* **Math**: Use LaTeX for all mathematical notation (e.g., `$E = mc^2$`).
* **Narration**: Every element **MUST** have a `speakAloud` field containing 1-2 sentences for a text-to-speech (TTS) engine. This text should be a clear, simple narration of the element's content.

### Color Palette (Use these `backgroundColor` values for `card` elements)
| Category          | Color Code | Use Case                                |
| ----------------- | ---------- | --------------------------------------- |
| **Main Topic/Title** | (no bg)    | For `text` elements that act as titles. |
| **Key Concept** | `#E3F2FD`  | Blue: Core ideas or steps in a process. |
| **Definition** | `#E8F5E9`  | Green: Explanations of terms.           |
| **Example** | `#F3E5F5`  | Purple: Concrete examples or case studies. |
| **Important Note** | `#FFF3E0`  | Orange: Crucial facts, warnings, or tips. |

---

## JSON ELEMENT SCHEMAS

### 1. Text
Used for titles and labels.
```json
{
  "type": "text",
  "content": "Text content. Can include **bold** and $math$.",
  "fontSize": 24, // Use 36 for titles, 24 for labels
  "x": 100, // horizontal position (from left)
  "y": 200, // vertical position (from top)
  "textColor": "#333333",
  "speakAloud": "The clear, spoken-word version of the text content."
}
{
  "type": "card", 
  "content": "The main content, formatted with **bold** terms or bullet points.",
  "fontSize": 24, // Use 18-24
  "x": 100,
  "y": 200,
  "width": 350,
  "height": 200,
  "backgroundColor": "#F8F9FA", // Use a color from the palette
  "speakAloud": "A brief explanation of what is on this card."
}
{
  "type": "line",
  "thickness": "m", // 's', 'm', or 'l'
  "x1": 100, // start x
  "y1": 200, // start y
  "x2": 300, // end x
  "y2": 400, // end y
  "speakAloud": "A brief description of the relationship (e.g., 'This leads to...')."
}
{
  "type": "image",
  "search": "a simple, clear search query for an image",
  "x": 100,
  "y": 200,
  "height": 150,
  "speakAloud": "A description of what the image illustrates."
}"""
    # Add language info to system prompt
    system_text += f"\n\nThe user has selected the language: '{lang}'. Output all text and speakAloud fields in this language."

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

