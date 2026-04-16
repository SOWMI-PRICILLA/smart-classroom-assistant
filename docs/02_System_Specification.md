# Chapter 3: System Specification

---

## 3.1 Hardware Requirements

### 3.1.1 Server-Side Infrastructure (Backend Deployment)

The server hosts the neural transcription engine, the vector store, the FastAPI application layer, the WebSocket broadcast gateway, and the AI orchestration services. Given the computationally intensive nature of these workloads — particularly the Whisper neural model inference and real-time audio processing — the following specifications are mandatory for stable production operation.

| Component | Minimum Specification | Recommended Specification |
|:---|:---|:---|
| **Processor (CPU)** | Intel Core i7 (10th Gen) / AMD Ryzen 7 5000 Series, 8 cores | Intel Core i9 (12th Gen) / AMD Ryzen 9 5900X, 12+ cores |
| **System Memory (RAM)** | 16 GB DDR4 @ 3200 MHz | 32 GB DDR4 @ 3600 MHz |
| **Primary Storage** | 256 GB NVMe SSD (OS + Runtime) | 512 GB NVMe SSD |
| **Secondary Storage** | 256 GB SATA SSD (Data/Models) | 1 TB NVMe SSD (Data/Models/Media) |
| **GPU (Graphics Processing Unit)** | NVIDIA GeForce GTX 1660 Ti (6 GB VRAM) w/ CUDA 11.8+ | NVIDIA GeForce RTX 3060 / RTX 4070 (12 GB VRAM) w/ CUDA 12.0+ |
| **GPU Compute Capability** | CUDA 7.5+ (Pascal Architecture minimum) | CUDA 8.6+ (Ampere Architecture) |
| **Network Interface** | Gigabit Ethernet (1 Gbps) | 2.5 Gbps Ethernet + Wi-Fi 6 |
| **Upload / Download Bandwidth** | 20 Mbps symmetric | 100 Mbps symmetric (for multi-classroom deployments) |

> **Note on GPU Requirement**: The Whisper `small.en` neural model is executed using the **Faster-Whisper** implementation with **FP16 (float16) weight quantization**. While the system can operate in CPU-only mode via INT8 quantization with acceptable latency for smaller class sizes, GPU acceleration via CUDA is essential for achieving sub-second per-segment inference latency in live classroom conditions with concurrent student connections.

### 3.1.2 Client-Side Requirements (Teacher and Student Devices)

Client devices interact with the system entirely through a web browser over HTTP and WebSocket connections. No specialized hardware installation is required on client machines beyond standard browser capabilities.

**Common Requirements (Both Roles):**

| Component | Specification |
|:---|:---|
| **Processor** | Dual-core 2.0 GHz or better (Intel Core i3 / AMD Ryzen 3 or equivalent) |
| **System Memory** | 4 GB RAM minimum (8 GB recommended for multi-tab usage) |
| **Display Resolution** | Minimum 1366 × 768 (HD) — 1920 × 1080 (Full HD) recommended |
| **Operating System** | Windows 10/11, macOS Ventura+, Ubuntu 20.04+ |
| **Web Browser** | Google Chrome 110+, Microsoft Edge 110+, Brave (latest) — Chromium-based preferred |
| **Network Connectivity** | Stable internet or local network connection (≥ 5 Mbps) |

**Teacher-Specific Requirements:**

| Component | Specification |
|:---|:---|
| **Microphone** | USB condenser microphone (e.g., Blue Yeti, Rode NT-USB) — Recommended for optimal audio capture fidelity. Built-in laptop microphone supported but sub-optimal. |
| **Audio Interface** | OS-level audio levels set to 70–90% input gain to ensure 16kHz mono stream quality |
| **Screen Sharing** | Display resolution of 1920 × 1080 or higher for material broadcasting |

---

## 3.2 Software Requirements

### 3.2.1 Development and Runtime Environment

| Category | Requirement |
|:---|:---|
| **Operating System (Server)** | Ubuntu 22.04 LTS (preferred) / Windows 10/11 / macOS Ventura |
| **Backend Language** | Python 3.10+ |
| **Frontend Language** | JavaScript (ES2022) / JSX (React) |
| **Package Manager (Backend)** | pip 23.0+ within a dedicated Python Virtual Environment (`venv`) |
| **Package Manager (Frontend)** | Node.js 18.x LTS + npm 9.x |
| **Version Control** | Git 2.40+ |
| **Environment Management** | python-dotenv for runtime environment variable loading |
| **Code Editor (Development)** | Visual Studio Code with Python + ESLint extensions |

### 3.2.2 Backend Frameworks and Libraries

| Library / Framework | Version | Purpose |
|:---|:---|:---|
| **FastAPI** | ≥ 0.110 | High-performance, asynchronous Python web framework for REST API and WebSocket endpoint management |
| **Uvicorn** | ≥ 0.29 | ASGI-compliant server for running the FastAPI application with async I/O |
| **Motor** | ≥ 3.3 | Asynchronous, non-blocking MongoDB driver for Python (built on `pymongo`) |
| **Faster-Whisper** | ≥ 0.10 | Optimized CTranslate2-based implementation of the Whisper neural model for low-latency local transcription |
| **PyTorch** | ≥ 2.1 (CUDA 12.1 build) | Deep learning framework providing the CUDA runtime and tensor operations required by the neural model backend |
| **Sentence-Transformers** | ≥ 2.6 | Semantic embedding model library (`all-MiniLM-L6-v2`) for generating 384-dimensional text vectors for the RAG pipeline |
| **Qdrant-Client** | ≥ 1.8 | Python client library for the Qdrant vector database, managing both local embedded and remote server modes |
| **PyPDF** | ≥ 4.0 | PDF parsing library for extracting structured text content from uploaded teaching materials for indexing |
| **Groq SDK** | ≥ 0.7 | Python SDK for accessing Groq's high-speed LLM inference API (Llama 3.3 70B Versatile / Llama 3.1 8B Instant models) |
| **FPDF2** | ≥ 2.7 | PDF generation library for producing formatted session reports and study guides |
| **python-jose** | ≥ 3.3 | JWT (JSON Web Token) encoding, decoding, and validation for stateless authentication |
| **passlib** | ≥ 1.7 | Password hashing library using the bcrypt algorithm for secure credential storage |
| **python-multipart** | ≥ 0.0.9 | Multipart form data parsing for handling file uploads (PDFs, images) |
| **httpx** | ≥ 0.27 | Asynchronous HTTP client for internal service-to-service communication |
| **edge-tts** | ≥ 6.1 | Microsoft Edge Text-to-Speech library for generating podcast-quality audio summaries |
| **librosa / soundfile** | ≥ 0.10 | Audio preprocessing library for resampling and normalizing incoming audio streams before neural inference |
| **websockets** | ≥ 12.0 | Low-level, high-performance WebSocket implementation for the real-time broadcast layer |

### 3.2.3 Frontend Frameworks and Libraries

| Library / Framework | Version | Purpose |
|:---|:---|:---|
| **React.js** | ≥ 18.2 | Declarative, component-based UI library for building the interactive single-page application (SPA) |
| **Vite** | ≥ 5.0 | Next-generation frontend build tool with ESM-native module resolution and hot module replacement (HMR) |
| **Tailwind CSS** | ≥ 3.4 | Utility-first CSS framework for building responsive, premium-grade layouts with minimal custom CSS |
| **Axios** | ≥ 1.6 | Promise-based HTTP client for making authenticated REST API requests to the FastAPI backend |
| **Framer Motion** | ≥ 11.0 | Production-grade animation library for React, used for page transitions, modal animations, and micro-interactions |
| **Lucide-React** | ≥ 0.363 | Tree-shakeable, modern icon library providing a consistent, professional iconography set |
| **React Router DOM** | ≥ 6.22 | Client-side routing for multi-page navigation within the SPA without full page reloads |
| **Recharts** | ≥ 2.12 | Composable charting library built on D3.js for rendering analytical dashboards and performance visualizations |

### 3.2.4 Database and Infrastructure

| Component | Specification | Justification |
|:---|:---|:---|
| **Primary Database** | MongoDB 7.0+ (Atlas or self-hosted) | Document-oriented NoSQL model provides the schema flexibility required to store heterogeneous session data (transcripts, materials, concepts, summaries) without rigid table joins |
| **Vector Database** | Qdrant (Embedded local mode via `qdrant_client`) | High-performance vector similarity search for the RAG pipeline; embedded mode eliminates external service dependencies |
| **Authentication Protocol** | JSON Web Tokens (JWT) — HS256 algorithm | Stateless, scalable, role-based session management; tokens carry embedded user role claim for RBAC enforcement |
| **Password Security** | bcrypt hashing (cost factor 12) | Industry-standard adaptive hashing algorithm resistant to brute-force attacks |
| **Cross-Origin Resource Sharing** | FastAPI CORS Middleware | Configurable CORS policy to allow the React frontend origin to interact securely with the backend API |
| **Secret Management** | python-dotenv + `.env` file | Sensitive configuration (database URIs, API keys, JWT secrets) are isolated from the source code |
