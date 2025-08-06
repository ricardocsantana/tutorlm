# TutorLM

TutorLM is an intelligent visual learning platform that transforms audio conversations into interactive educational experiences. Using AI-powered speech recognition, natural language processing, and dynamic content generation, TutorLM creates personalized visual learning materials with text-to-speech narration.

![TutorLM Logo](frontend/public/logo.png)

## ✨ Features

- **🎤 Voice-to-Learning**: Speak your questions and get visual educational content
- **📄 PDF Integration**: Upload documents for context-aware learning
- **🖼️ Image Support**: Include images for enhanced visual context
- **🗣️ Text-to-Speech**: Multi-language narration (English/Spanish)
- **🎨 Interactive Canvas**: Dynamic visual layouts with cards, text, and images
- **🌐 Multi-language Support**: English and Spanish interface and TTS
- **⚡ Real-time Streaming**: Live content generation and display
- **📱 Responsive Design**: Works on desktop and mobile devices

## 🏗️ Architecture

TutorLM consists of three main components:

### Backend (`/backend`)

- **Flask** web server with async support
- **OpenAI Whisper** for speech-to-text transcription
- **Ollama LLM** integration for content generation
- **Piper TTS** for text-to-speech synthesis
- **Unsplash API** for educational image search
- **PyMuPDF** for PDF text extraction

### Frontend (`/frontend`)

- **React + TypeScript + Vite** application
- **Konva.js** for interactive canvas rendering
- **Tailwind CSS** for responsive styling
- **Real-time streaming** with Server-Sent Events
- **Audio recording** and file upload capabilities

### Voice Models (`/backend/voices`)

- Pre-trained Piper TTS models for multiple languages
- English (US) and Spanish (ES) voice synthesis

## 🚀 Quick Start

### Prerequisites

- **Python 3.9+**
- **Node.js 18+**
- **Ollama** (for local LLM inference)

### Environment Setup

1. Clone the repository:

```bash
git clone https://github.com/ricardocsantana/tutorlm.git
cd tutorlm
```

2. Create environment file:

```bash
cp backend/.env.example backend/.env
```

3. Configure your API keys in `backend/.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here
BASE_URL=http://localhost:11434/v1  # Ollama endpoint
```

### Backend Setup

1. Navigate to backend directory:

```bash
cd backend
```

2. Create virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Download TTS voice models:

```bash
# The voice models should be placed in backend/voices/
# en_US-lessac-medium.onnx and en_US-lessac-medium.onnx.json
# es_ES-sharvard-medium.onnx and es_ES-sharvard-medium.onnx.json
```

5. Start the Flask server:

```bash
python main.py
```

The backend will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend directory:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Ollama Setup

1. Install Ollama from [ollama.ai](https://ollama.ai)

2. Pull required models:

```bash
ollama pull gemma3      # For prompt refinement
ollama pull gemma3n     # For JSON generation
```

3. Start Ollama server:

```bash
ollama serve
```

## 📁 Project Structure

```
tutorlm/
├── backend/
│   ├── main.py                 # Flask application
│   ├── requirements.txt        # Python dependencies
│   ├── .env                   # Environment variables
│   ├── uploads/               # File upload directory
│   └── voices/                # TTS voice models
│       ├── en_US-lessac-medium.onnx
│       ├── en_US-lessac-medium.onnx.json
│       ├── es_ES-sharvard-medium.onnx
│       └── es_ES-sharvard-medium.onnx.json
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── store/            # State management
│   │   ├── utils/            # Utility functions
│   │   └── api/              # API integration
│   ├── public/               # Static assets
│   ├── package.json          # Node.js dependencies
│   └── vite.config.ts        # Vite configuration
└── offload/                  # Additional resources
```

## 🔧 API Endpoints

### POST `/api/speech-to-prompt`

Processes audio input with optional PDF and image context to generate refined learning prompts.

**Request:**

- `session_id` (form): Unique session identifier
- `audio_file` (file): Audio recording
- `pdf_file` (file, optional): PDF document for context
- `image_file_*` (files, optional): Context images

**Response:**

```json
{
  "refined_prompt": "Generated learning prompt",
  "session_id": "session_123",
  "context_summary": "Context description"
}
```

### GET `/api/reply`

Streams educational content as Server-Sent Events.

**Parameters:**

- `refined_prompt`: The learning prompt
- `session_id`: Session identifier
- `context_summary`: Context description

**Response:** Stream of JSON objects representing canvas elements

### POST `/api/set-language`

Sets the TTS language preference.

**Request:**

```json
{
  "lang": "en-US" | "es-ES"
}
```

### GET `/api/image-search`

Searches for educational images on Unsplash.

**Parameters:**

- `q`: Search query

## 🛠️ Development

### Running Tests

```bash
# Backend tests
cd backend
python -m pytest

# Frontend tests
cd frontend
npm test
```

### Building for Production

```bash
# Frontend build
cd frontend
npm run build

# Backend deployment
cd backend
gunicorn --bind 0.0.0.0:8000 main:app
```

### Code Formatting

```bash
# Frontend
cd frontend
npm run lint

# Backend
cd backend
black main.py
```

## 🎯 Usage Flow

1. **Record Audio**: Click the microphone button and speak your learning question
2. **Add Context** (optional): Upload PDF documents or images for additional context
3. **Process**: TutorLM transcribes speech, analyzes context, and refines the prompt
4. **Generate**: AI creates visual educational content with text, cards, and images
5. **Learn**: Interactive canvas displays content with audio narration
6. **Export**: Save your learning session as PDF or image

## 🔑 Key Technologies

- **Speech Recognition**: OpenAI Whisper API
- **Language Models**: Ollama (Gemma 3)
- **Text-to-Speech**: Piper TTS
- **Image Search**: Unsplash API
- **PDF Processing**: PyMuPDF
- **Canvas Rendering**: Konva.js
- **Real-time Communication**: Server-Sent Events
- **Frontend Framework**: React + TypeScript
- **Backend Framework**: Flask (async)
- **Styling**: Tailwind CSS

## 🌍 Multi-language Support

TutorLM supports multiple languages for both interface and text-to-speech:

- **English (en-US)**: Full support with Lessac voice model
- **Spanish (es-ES)**: Full support with Sharvard voice model

## 📝 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for Whisper | Yes |
| `UNSPLASH_ACCESS_KEY` | Unsplash API key for images | Yes |
| `BASE_URL` | Ollama server endpoint | Yes |

### TTS Voice Models

Voice models should be placed in `backend/voices/` directory:

- Download from [Piper TTS Models](https://github.com/rhasspy/piper/releases)
- Ensure both `.onnx` and `.onnx.json` files are present

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai/) for local LLM inference
- [Piper TTS](https://github.com/rhasspy/piper) for text-to-speech
- [Unsplash](https://unsplash.com/) for educational images
- [Konva.js](https://konvajs.org/) for canvas rendering

## 📞 Support

For support, please open an issue on GitHub.

---

**TutorLM** - Transforming conversations into visual learning experiences 🚀
