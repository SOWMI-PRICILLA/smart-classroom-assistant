# Smart Classroom Assistant 🎓

An AI-powered real-time classroom assistant that provides live transcription, automated pedagogical analysis, RAG-based quizzes, and multi-modal resource indexing.

![Project Status](https://img.shields.io/badge/status-active-success)
![Technology](https://img.shields.io/badge/Stack-FastAPI%20|%20React%20|%20MongoDB-blue)

---

## 🏛 System Architecture

The project is structured as a 3-tier distributed system to ensure high availability and real-time performance:

1.  **FastAPI Backend (Port 8001)**: Handles core business logic, RAG (Retrieval Augmented Generation) logic, authentication, and database interactions.
2.  **Audio WebSocket Service (Port 8765)**: A high-concurrency Python service dedicated to real-time speech-to-text processing using Whisper and VAD (Voice Activity Detection).
3.  **Vite / React Frontend (Port 5173)**: A modern, responsive dashboard for Teachers and Students with real-time sync via WebSockets.

---

## 🚀 Getting Started

### Prerequisites

-   **Node.js**: v18 or later
-   **Python**: v3.9 or later
-   **MongoDB**: An active MongoDB Atlas cluster or local instance.
-   **API Keys**: You will need keys for **Groq (Llama-3)** and **Google Gemini/YouTube**.

---

### 1. Backend Setup

1.  Navigate to the project root and create a virtual environment:
    ```bash
    python -m venv venv
    venv\Scripts\activate  # Windows
    source venv/bin/activate  # macOS/Linux
    ```
2.  Install backend dependencies:
    ```bash
    pip install -r backend/requirements.txt
    pip install -r backend/audio_service/requirements.txt
    ```
3.  **Environment Configuration**:
    -   Copy `.env.example` to `.env`.
    -   Fill in your `MONGO_URI`, `GROQ_API_KEY`, etc.

---

### 2. Audio Service Setup

The audio service handles the heavy lifting of real-time transcription. On Windows, you can start it immediately using the provided batch script:

1.  **Initialize Folders**: Ensure `backend/audio_service/recordings` exists.
2.  **Run the Service**:
    ```cmd
    backend\run_audio_service.bat
    ```
    *This script automatically configures your `PYTHONPATH` and starts the server on port 8765.*

---

### 3. Frontend Setup

1.  Navigate to the `frontend/` directory:
    ```bash
    cd frontend
    npm install
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```
    *The app will be available at `http://localhost:5173`.*

---

## 📊 Data Initialization

To populate the system with academic departments, subjects, and sample users, run the seeding script:

```bash
python -m backend.seed_data
```

---

## 🛠 Tech Stack

-   **Backend**: FastAPI, Motor (Async MongoDB), Pydantic
-   **AI Layers**: Groq Llama-3 (Summarization), Faster-Whisper (Transcription), Qdrant (Vector DB)
-   **Frontend**: React, Vite, Framer Motion, Lucide Icons, Tailwind CSS
-   **Real-time**: WebSockets (Native & `websockets` library)
-   **Utilities**: `edge-tts` (Audio Podcasts), `fpdf2` (PDF Insights)

---

## 🔒 Security Note

-   **Secrets**: All API keys must be kept in the `.env` file. Never hardcode them.
-   **CORS**: Currently configured for development. Ensure proper origin white-listing in `backend/app.py` for production.

---

Developed with ❤️ for Academic Excellence.
