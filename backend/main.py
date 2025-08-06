import io
import os
import base64
import wave
import fitz  # PyMuPDF
import logging
import json
import httpx
import anyio
from pathlib import Path
from typing import Dict, Any

from flask import Flask, request, jsonify, Response, abort
from flask_cors import CORS
from openai import AsyncOpenAI
from piper import PiperVoice

# --- CONFIGURATION & INITIALIZATION ---

from pathlib import Path
from dotenv import load_dotenv

dotenv_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=dotenv_path)

# Set up logging
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Load API keys and base URLs from environment
UNSPLASH_API_KEY = os.getenv("UNSPLASH_ACCESS_KEY")
OLLAMA_BASE_URL = os.getenv("BASE_URL") # For Ollama models
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") # For Whisper transcription

# --- Constants ---
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)
PDF_MAX_WORDS = 2000  # Process up to the first 10,000 words of a PDF
LLM_MAX_TOKENS_JSON = 4096
LLM_MAX_TOKENS_PROMPT = 256

# --- GLOBAL STATE & MODEL LOADING ---

# In-memory store for the current TTS language
current_language = {"lang": "en_US"}

# Initialize API Clients
logger.info("Initializing API clients...")

# Client for OpenAI's Whisper API
# Reads the OPENAI_API_KEY from the environment automatically
if not OPENAI_API_KEY:
    logger.warning("OPENAI_API_KEY not found. Audio transcription will fail.")
openai_client = AsyncOpenAI()

# Client for the first LLM step (prompt refinement) using Ollama
client_refinement = AsyncOpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")

# Client for the second LLM step (JSON generation) using Ollama
client_generation = AsyncOpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")

logger.info("API clients initialized.")


# --- TTS VOICE LOADING ---
BASE_DIR = Path(__file__).parent.resolve()
VOICE_MODEL_PATHS = {
    "en_US": str(BASE_DIR / "voices/en_US-lessac-medium.onnx"),
    "es_ES": str(BASE_DIR / "voices/es_ES-sharvard-medium.onnx"),
}
voice_cache = {}

def get_voice_for_lang(lang: str):
    """Returns a PiperVoice instance for the given language, loading if necessary."""
    if lang not in VOICE_MODEL_PATHS:
        abort(400, description=f"Unsupported language: {lang}")
    if lang not in voice_cache:
        try:
            model_path = VOICE_MODEL_PATHS[lang]
            if not Path(model_path).exists():
                 logger.error(f"Voice model file not found at path: {model_path}")
                 abort(500, description=f"TTS model file not found for language '{lang}'.")
            voice_cache[lang] = PiperVoice.load(model_path)
            logging.info(f"PiperVoice loaded for lang '{lang}' from {model_path}")
        except Exception as e:
            logging.error(f"Failed to load PiperVoice for lang '{lang}': {e}")
            abort(500, description=f"TTS model could not be loaded for language '{lang}'.")
    return voice_cache[lang]


# --- IMPROVED PROMPT TEMPLATES ---

PROMPT_REFINEMENT_SYSTEM_PROMPT = """
You are an expert at understanding and refining user requests for visual learning experiences.

Your task is to analyze the provided context and generate a clear, focused prompt that emphasizes the core learning objective and key concepts that benefit from visual representation.

**CONTEXT ANALYSIS**:
- Identify the main subject/topic
- Determine what specific concepts need visual explanation
- Note any complex relationships, processes, or structures mentioned
- Consider what would be most effectively communicated visually vs. textually

**OUTPUT REQUIREMENTS**:
- Single string prompt (no markdown, explanations, or additional text)
- Focus on concepts that benefit from visual representation
- Include specific details that help generate relevant, educational content
- Emphasize learning objectives and key relationships

**INPUT FORMAT**:
- User's transcribed speech: "The user said this..."
- Text from a relevant document: "Here is some text from a document..."
- Images: "The user has the following image(s) open..."

**OUTPUT**: A refined prompt that captures the essence of the learning request with focus on visual educational value.
"""

JSON_GENERATION_SYSTEM_PROMPT = """
You are TutorLM, an expert visual educator specializing in creating effective educational layouts using text, cards, and strategic imagery.

**CRITICAL REQUIREMENT**: Output ONLY a valid JSON array. No explanations, markdown, or additional text.

**DESIGN PRINCIPLES**:
- Use images ONLY when they add genuine educational value to the concept
- Prioritize clear text hierarchy and well-organized cards for content delivery
- Images should illustrate specific concepts, processes, structures, or phenomena
- Avoid decorative or generic images that don't enhance understanding

**ELEMENT TYPES**:

1. **Text Elements** - For titles, headings, and key concepts
   {
     "type": "text",
     "content": "Clear title with **emphasis** or $LaTeX$ formulas",
     "fontSize": 18-32,
     "x": position, "y": position (use increments of 80-100px for proper spacing),
     "textColor": "#000000",
     "speakAloud": "Clear narration explaining this concept"
   }

2. **Card Elements** - For explanations, definitions, and detailed content
   {
     "type": "card",
     "content": "Structured content with markdown formatting and $LaTeX$ when needed",
     "fontSize": 14-18,
     "x": position, "y": position (ensure 100-120px gaps between cards),
     "width": 300-400,
     "backgroundColor": "#F8F9FA", "#E3F2FD", "#E8F5E8", "#FFF3E0", "#F3E5F5", "#FCE4EC", "#E0F2F1", "#FFF8E1", "#FFEBEE", "#E1F5FE", "#F1F8E9", "#FFF9C4", "#EFEBE9", "#FAFAFA", "#FFFFFF",
     "speakAloud": "Detailed explanation of the card's educational content"
   }

3. **Image Elements** - ONLY for concepts that benefit from visual representation
   {
     "type": "image",
     "search": "specific, educational search term (e.g., 'mitochondria diagram', 'water cycle illustration', 'DNA double helix structure')",
     "x": position, "y": position (account for image height + 20px margin),
     "width": 150-300,
     "speakAloud": "Explanation of how this image relates to and enhances the learning concept"
   }

**IMAGE USAGE GUIDELINES**:
- Use images for: scientific structures, historical artifacts, geographical features, mathematical visualizations, technical diagrams, natural phenomena
- AVOID images for: abstract concepts, general topics, decorative purposes
- Search terms should be specific and educational (not generic or decorative)
- Each image must have clear educational relevance explained in speakAloud

**LAYOUT STRATEGY**:
- Create logical visual flow from general to specific concepts
- **CRITICAL**: Ensure NO vertical overlapping - each element needs sufficient vertical spacing
- Text elements: minimum 60px vertical separation
- Card elements: minimum 80px vertical separation (cards are typically 60-100px tall)
- Images: minimum 100px vertical separation (account for image height + margins)
- Use a grid-like approach: place elements at y-coordinates like 50, 150, 250, 350, etc.
- Balance text-heavy cards with strategic visual elements
- Consider element heights when positioning: text ~40px, cards ~80-120px, images variable
- Ensure content is educational and purposeful

Your response must be a valid JSON array starting with `[` and ending with `]`, containing 4-8 thoughtfully designed elements.
"""

# --- HELPER FUNCTIONS ---

async def search_for_image_on_unsplash(q: str) -> Dict[str, Any]:
    """Searches for an image on Unsplash and returns a dictionary with its details."""
    logging.info(f"Performing Unsplash search for query: '{q}'")
    if not UNSPLASH_API_KEY:
        logging.error("UNSPLASH_API_KEY is not set. Cannot perform image search.")
        raise ConnectionError("Image search is not configured on the server (missing API key).")
    if not q:
        raise ValueError("Search query cannot be empty.")

    url = "https://api.unsplash.com/search/photos"
    headers = {"Authorization": f"Client-ID {UNSPLASH_API_KEY}", "Accept-Version": "v1"}
    params = {"query": q, "per_page": 1}

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()

    data = response.json()
    if not data.get("results"):
        raise FileNotFoundError(f"No images found for '{q}'")

    first_image = data["results"][0]
    image_url = first_image.get("urls", {}).get("regular")
    if not image_url:
        raise ValueError("Unsplash API returned incomplete image data.")

    return {"imageUrl": image_url, "width": first_image.get("width"), "height": first_image.get("height")}


def image_to_base64_data_url(file_content: bytes, filename: str) -> str:
    """Converts an image file's content to a base64 data URL."""
    try:
        ext = Path(filename).suffix.lstrip('.').lower()
        if ext == "jpg": ext = "jpeg"
        encoded_string = base64.b64encode(file_content).decode()
        return f"data:image/{ext};base64,{encoded_string}"
    except Exception as e:
        logger.error(f"Error converting image {filename} to base64: {e}")
        return ""


async def transcribe_audio(audio_file_stream, audio_filename: str) -> str:
    """Transcribes audio using the OpenAI Whisper API."""
    logger.info(f"Transcribing audio file: {audio_filename} using OpenAI API")
    if not OPENAI_API_KEY:
        abort(501, description="Audio transcription service is not configured.")
    try:
        transcription = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=(audio_filename, audio_file_stream.read()),
        )
        logger.info(f"OpenAI transcription successful for {audio_filename}.")
        return transcription.text
    except Exception as e:
        logger.error(f"OpenAI transcription failed: {e}", exc_info=True)
        abort(500, description="Audio transcription failed.")


# --- FLASK APP ---
app = Flask(__name__)
CORS(app) # Enable Cross-Origin Resource Sharing for all routes

# --- API ENDPOINTS ---

@app.route("/api/speech-to-prompt", methods=['POST'])
async def speech_to_prompt():
    """
    Step 1: Takes audio, optional PDF, and optional images, performs transcription,
    processes context, and refines it into a clear prompt.
    """
    if 'session_id' not in request.form or 'audio_file' not in request.files:
        abort(400, description="Missing 'session_id' or 'audio_file' in form data.")

    session_id = request.form['session_id']
    audio_file = request.files['audio_file']
    pdf_file = request.files.get('pdf_file')
    image_files = [file for key, file in request.files.items() if key.startswith('image_file_')]

    logger.info(f"Received STP request for session_id: {session_id}")

    try:
        # 1. Transcribe Audio using OpenAI API
        transcribed_text = await transcribe_audio(audio_file.stream, audio_file.filename)

        # 2. Process PDF for context (if provided)
        retrieved_text = ""
        if pdf_file:
            logger.info(f"Processing PDF: {pdf_file.filename}")
            try:
                pdf_content = pdf_file.read()
                full_text = ""
                with fitz.open(stream=pdf_content, filetype="pdf") as doc:
                    full_text = "".join(page.get_text() for page in doc)

                if full_text.strip():
                    words = full_text.split()
                    if len(words) > PDF_MAX_WORDS:
                        retrieved_text = " ".join(words[:PDF_MAX_WORDS])
                        logger.info(f"PDF content truncated to the first {PDF_MAX_WORDS} words.")
                    else:
                        retrieved_text = full_text
                else:
                    logger.warning(f"PDF '{pdf_file.filename}' contains no extractable text.")
            except Exception as e:
                logger.error(f"Failed to process PDF {pdf_file.filename}: {e}", exc_info=True)
                retrieved_text = "" # Proceed without PDF context on error

        # 3. Process images for visual context
        image_context = []
        if image_files:
            for img_file in image_files:
                img_content = img_file.read()
                data_url = image_to_base64_data_url(img_content, img_file.filename)
                if data_url:
                    image_context.append({"type": "image_url", "image_url": {"url": data_url}})
            logger.info(f"Loaded {len(image_context)} images for context.")

        # 4. Refine the prompt with an LLM if context exists
        has_context = bool(retrieved_text or image_context)
        context_summary = "User provided audio only."
        if not has_context:
            refined_prompt = transcribed_text.strip()
        else:
            llm_messages = [{"role": "system", "content": PROMPT_REFINEMENT_SYSTEM_PROMPT}]
            user_content_parts = [f"User's transcribed speech: \"{transcribed_text}\""]
            if retrieved_text:
                user_content_parts.append(f"Text from a relevant document:\n---\n{retrieved_text}\n---")
                context_summary = "User provided audio, and text from a document"
            if image_context:
                user_content_parts.append("The user also has the following image(s) open:")
                context_summary += f", and {len(image_context)} image(s)."

            llm_user_message = [{"type": "text", "text": "\n\n".join(user_content_parts)}]
            llm_user_message.extend(image_context)
            llm_messages.append({"role": "user", "content": llm_user_message})

            logger.info("Requesting prompt refinement from Ollama...")
            response = await client_refinement.chat.completions.create(
                model="gemma3", messages=llm_messages, max_tokens=LLM_MAX_TOKENS_PROMPT, temperature=0.2
            )
            refined_prompt = response.choices[0].message.content.strip()

        logger.info(f"Refined prompt: '{refined_prompt}'")
        return jsonify({
            "refined_prompt": refined_prompt,
            "session_id": session_id,
            "context_summary": context_summary
        })

    except Exception as e:
        logger.error(f"Error in speech-to-prompt endpoint: {e}", exc_info=True)
        # Check if it's a werkzeug/flask exception with a description
        error_desc = getattr(e, 'description', str(e))
        error_code = getattr(e, 'code', 500)
        return jsonify({"error": error_desc}), error_code


@app.route("/api/reply", methods=['GET'])
def reply_stream():
    """Streams the generated canvas elements as server-sent events."""
    args = request.args
    refined_prompt = args.get('refined_prompt')
    session_id = args.get('session_id')
    context_summary = args.get('context_summary')

    if not all([refined_prompt, session_id, context_summary]):
        abort(400, "Missing one or more required query parameters: refined_prompt, session_id, context_summary")

    async def event_generator():
        try:
            lang = current_language.get("lang", "en_US")
            voice = get_voice_for_lang(lang) if get_voice_for_lang else None

            messages = [
                {"role": "system", "content": JSON_GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": refined_prompt}
            ]

            response_stream = await client_generation.chat.completions.create(
                model="gemma3n", messages=messages, max_tokens=LLM_MAX_TOKENS_JSON, temperature=0.7, stream=True
            )

            accumulated_content = ""
            bracket_count = 0
            in_string = False
            escape_next = False
            object_start = -1

            async for chunk in response_stream:
                delta = chunk.choices[0].delta.content
                if not delta: continue
                accumulated_content += delta
                # Simple and robust JSON object streaming parser
                for i, char in enumerate(delta):
                    pos = len(accumulated_content) - len(delta) + i
                    if in_string:
                        if escape_next: escape_next = False
                        elif char == '\\': escape_next = True
                        elif char == '"': in_string = False
                    else:
                        if char == '"': in_string = True
                        elif char == '{':
                            if bracket_count == 0: object_start = pos
                            bracket_count += 1
                        elif char == '}':
                            bracket_count -= 1
                            if bracket_count == 0 and object_start != -1:
                                json_str = accumulated_content[object_start : pos + 1]
                                try:
                                    obj = json.loads(json_str)
                                    # --- Image Search Logic ---
                                    if obj.get("type") == "image" and obj.get("search"):
                                        try:
                                            image_data = await search_for_image_on_unsplash(obj["search"])
                                            aspect_ratio = image_data["height"] / image_data["width"] if image_data["width"] > 0 else 1
                                            final_width = obj.get("width") if isinstance(obj.get("width"), int) else 350
                                            obj.update({
                                                "imageUrl": image_data["imageUrl"],
                                                "width": final_width,
                                                "height": int(final_width * aspect_ratio)
                                            })
                                        except Exception as search_error:
                                            logger.error(f"Image search failed: {search_error}")
                                            obj.update({
                                                "type": "text",
                                                "content": f"**Error:** Could not find image for '{obj['search']}'",
                                                "textColor": "#ef4444"
                                            })

                                    # --- TTS Generation Logic ---
                                    narration_text = obj.get("speakAloud")
                                    if narration_text and voice:
                                        try:
                                            with io.BytesIO() as wav_buffer:
                                                with wave.open(wav_buffer, "wb") as wav_file:
                                                    voice.synthesize_wav(narration_text, wav_file)
                                                base64_audio = base64.b64encode(wav_buffer.getvalue()).decode('utf-8')
                                                obj['audioDataUrl'] = f"data:audio/wav;base64,{base64_audio}"
                                        except Exception as tts_error:
                                            logger.error(f"Error generating TTS audio: {tts_error}")
                                            obj['audioDataUrl'] = None

                                    yield f"data: {json.dumps(obj)}\n\n"
                                except json.JSONDecodeError:
                                    pass # Incomplete object, wait for more chunks

            logger.info(f"Streaming completed for session: {session_id}")
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Error in reply streaming generator: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    def sync_event_stream():
        # Use anyio to run the async generator and yield results synchronously
        async def run_and_yield():
            async for item in event_generator():
                yield item

        # anyio.to_thread.run_sync expects a sync function, so we use a queue to bridge async->sync
        import queue
        import threading

        q = queue.Queue()
        sentinel = object()

        def runner():
            async def async_runner():
                async for item in event_generator():
                    q.put(item)
                q.put(sentinel)
            anyio.run(async_runner)

        thread = threading.Thread(target=runner)
        thread.start()
        while True:
            item = q.get()
            if item is sentinel:
                break
            yield item
        thread.join()

    return Response(sync_event_stream(), mimetype="text/event-stream")

@app.route("/api/set-language", methods=['POST'])
def set_language():
    """Receives the selected language from the frontend and stores it."""
    data = request.get_json()
    lang = data.get("lang")
    if not lang:
        abort(400, description="Missing 'lang' in request body.")
    current_language["lang"] = lang.replace("-", "_")
    logger.info(f"Language set to: {current_language['lang']}")
    return jsonify({"status": "ok", "lang": current_language['lang']})

@app.route("/api/image-search", methods=['GET'])
async def image_search():
    """Searches for an image on Unsplash."""
    query = request.args.get('q')
    if not query:
        abort(400, description="Missing query parameter 'q'.")
    try:
        result = await search_for_image_on_unsplash(query)
        return jsonify(result)
    except ValueError as e: abort(400, description=str(e))
    except FileNotFoundError as e: abort(404, description=str(e))
    except ConnectionError as e: abort(501, description=str(e))
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error during Unsplash API call: {e.response.text}")
        abort(e.response.status_code, "Error from image search provider.")
    except Exception as e:
        logger.error(f"Unexpected error during image search: {e}", exc_info=True)
        abort(500, "An internal error occurred during image search.")


# To run this app locally:
# 1. Ensure you have an .env file with your API keys.
# 2. Run 'flask --app your_script_name --debug run' in your terminal.
if __name__ == '__main__':
    # This block is for local development and won't be used by a WSGI server like Gunicorn on PythonAnywhere
    app.run(debug=False, port=8000)