# Chapter 6: System Testing and Implementation

---

## 6.1 Testing Strategy

The testing strategy for the **Smart Classroom Assistant** is designed to provide comprehensive coverage across all architectural tiers — from individual utility functions to full end-to-end user workflows. Given the system's reliance on real-time data pipelines, neural model inference, WebSocket communication, and AI orchestration, the testing methodology is organized into four progressively broader levels: Unit Testing, Integration Testing, System Testing, and User Acceptance Testing (UAT).

The overarching objective of the testing phase is to validate three fundamental properties of the system:

- **Functional Correctness**: Each feature behaves according to its specification under all defined input conditions.
- **Reliability and Stability**: The system maintains consistent performance across extended operating periods, including under concurrent load from multiple simultaneous users.
- **Boundary and Error Handling**: The system degrades gracefully and provides informative feedback when it encounters invalid inputs, network interruptions, or service unavailability.

---

## 6.2 Unit Testing

Unit tests validate the correctness of individual, isolated software components without dependencies on external services, databases, or network connections. All external dependencies (MongoDB, Qdrant, LLM API) are replaced with mock objects during unit testing.

### 6.2.1 Authentication and Security Module

| Test ID | Component Under Test | Test Case Description | Expected Outcome |
|:---|:---|:---|:---|
| UT_AUTH_01 | `passlib.bcrypt` | Hash a plaintext password and verify the resulting hash is non-reversible and length-consistent | Hash is 60-character bcrypt string; original password is not recoverable |
| UT_AUTH_02 | `passlib.verify_password` | Verify correct password against stored hash | Returns `True` |
| UT_AUTH_03 | `passlib.verify_password` | Verify incorrect password against stored hash | Returns `False` |
| UT_AUTH_04 | `python-jose` JWT Creation | Create JWT with `{"sub": "user_id", "role": "teacher"}` payload | Token string is well-formed; decoding yields correct payload |
| UT_AUTH_05 | `python-jose` JWT Expiry | Attempt to decode a token that has exceeded `ACCESS_TOKEN_EXPIRE_MINUTES` | Raises `ExpiredSignatureError` |
| UT_AUTH_06 | FastAPI RBAC Dependency | Call a route decorated with `require_role("teacher")` using a `student` JWT | Returns HTTP 403 Forbidden |
| UT_AUTH_07 | FastAPI RBAC Dependency | Call a route decorated with `require_role("teacher")` using a `teacher` JWT | Route proceeds normally; returns HTTP 200 |

### 6.2.2 Text Processing and Transcription Utilities

| Test ID | Component Under Test | Test Case Description | Expected Outcome |
|:---|:---|:---|:---|
| UT_TXT_01 | `chunk_text()` function | Chunk a 1,200-character string with `chunk_size=500, overlap=100` | Returns 3 chunks; second chunk begins 400 characters into the source |
| UT_TXT_02 | `chunk_text()` function | Pass an empty string as input | Returns an empty list without raising an exception |
| UT_TXT_03 | `chunk_text()` function | Pass a string shorter than `chunk_size` | Returns a single chunk containing the entire input |
| UT_TXT_04 | Repetition Suppression | Feed two consecutive identical transcript segments | Only one segment is stored/broadcast; the duplicate is discarded |
| UT_TXT_05 | Transcript Aggregation | Combine an array of 50 `{text, timestamp}` objects | Produces a single coherent concatenated string preserving insertion order |

### 6.2.3 Vector Store Operations

| Test ID | Component Under Test | Test Case Description | Expected Outcome |
|:---|:---|:---|:---|
| UT_VS_01 | `VectorStore.sync_collection()` | Initialize VectorStore against a fresh Qdrant instance | Collection `classroom_knowledge` is created; payload index on `session_id` is confirmed |
| UT_VS_02 | `VectorStore.add_texts()` | Add 5 text chunks with a specific `session_id` | 5 points are upserted; `search(limit=5)` filtered by same `session_id` returns all 5 |
| UT_VS_03 | `VectorStore.add_texts()` — Idempotency | Add 5 chunks for session A, then re-add 5 different chunks for session A | Old chunks are deleted first; only the 5 new chunks remain in the collection for session A |
| UT_VS_04 | `VectorStore.search()` — Single Session | Add chunks for sessions A and B; search filtered to session A | Returns only chunks belonging to session A |
| UT_VS_05 | `VectorStore.search()` — Multi-Session | Search using `session_ids=[A, B]` | Returns relevant chunks from both sessions A and B |
| UT_VS_06 | `VectorStore.search()` — Empty Collection | Search against an empty Qdrant collection | Returns an empty list without raising an exception |

### 6.2.4 Database Utilities

| Test ID | Component Under Test | Test Case Description | Expected Outcome |
|:---|:---|:---|:---|
| UT_DB_01 | MongoDB Connection | Initialize `AsyncIOMotorClient` with the configured URI | Connection is established; `ping` command returns `{"ok": 1}` |
| UT_DB_02 | Session Document Insertion | Insert a new session document with required fields | Document is persisted; `_id` is auto-assigned |
| UT_DB_03 | Transcript Array Update | Use `$push` operator to append a transcript segment to an existing session | Session's `transcripts` array contains the new segment |
| UT_DB_04 | Assessment Document Retrieval | Query `assessments` collection with `is_published=True` and specific `subject_id` | Returns only published assessments for the target subject |

---

## 6.3 Integration Testing

Integration testing validates the cooperative behavior of two or more system components that must interact to deliver a feature. The goal is to identify interface mismatches, data contract violations, and unexpected inter-service behaviors.

### 6.3.1 Transcription Data Pipeline

**Objective**: Validate the complete flow from browser audio capture to student dashboard transcript display.

| Step | Interaction | Pass Criterion |
|:---|:---|:---|
| 1 | Browser MediaDevices API captures 16kHz PCM audio | Raw audio frames are correctly formatted and non-empty |
| 2 | Audio frames transmitted to Audio Service via WebSocket | Audio Service receives frames without frame loss or corruption |
| 3 | Faster-Whisper model processes accumulated audio buffer | Non-empty transcribed text is returned within 700ms per segment (GPU) |
| 4 | Audio Service forwards text to Main API via internal WebSocket | Main API receives transcript event with correct `text` and `session_id` fields |
| 5 | Main API persists segment to MongoDB | Session document's `transcripts` array contains the new segment |
| 6 | Main API broadcasts segment via WebSocket gateway | All students in the session's WebSocket room receive the segment event |
| 7 | Student React component re-renders with new transcript text | Transcript text appears on student dashboard within 500ms of speech |

### 6.3.2 Session Finalization and AI Processing Pipeline

**Objective**: Validate the complete asynchronous post-session pipeline from "End Session" trigger to artifact availability.

| Step | Interaction | Pass Criterion |
|:---|:---|:---|
| 1 | Teacher sends `POST /sessions/{id}/end` | Session status in MongoDB transitions from `"active"` to `"processing"` |
| 2 | Transcript indexing into Qdrant | All transcript chunks are embedded and stored; `session.is_indexed = True` |
| 3 | LLM Summarization call (Groq API) | Non-empty `summary`, `key_concepts`, `session_type`, `difficulty_level` fields populated |
| 4 | Edge-TTS audio generation | MP3 file is saved to `storage/audio/`; session's `audio_summary_url` is set |
| 5 | FPDF2 PDF report generation | PDF file is saved to `storage/reports/`; session's `pdf_report_url` is set |
| 6 | Resource discovery | At least 1 curated resource link is stored in `concept_resources` collection |
| 7 | Session status update | Session status in MongoDB transitions from `"processing"` to `"finished"` |
| 8 | WebSocket notification | Connected students receive a `session_finalized` event with the session ID |

### 6.3.3 RAG Assessment Generation Pipeline

**Objective**: Validate the end-to-end assessment creation workflow, from session selection to published assessment.

| Step | Interaction | Pass Criterion |
|:---|:---|:---|
| 1 | Teacher selects subject and session(s) for assessment generation | System retrieves valid `session_id` strings for selected sessions |
| 2 | `generate_rag_quiz()` called with session IDs | Qdrant search returns > 0 relevant chunks for all selected sessions |
| 3 | LLM assessment generation prompt submitted to Groq API | LLM returns valid JSON conforming to the quiz schema |
| 4 | Questions persist to `assessments` collection | Document with `questions` array is saved; `is_published = False` |
| 5 | Teacher publishes assessment (`PATCH /assessments/{id}/publish`) | `is_published` field updates to `True` in MongoDB |
| 6 | Student queries `GET /assessments?subject_id=...` | Published assessment appears in the student's response |

### 6.3.4 RAG Grading Pipeline Integration

**Objective**: Validate the AI grading pipeline from student submission to result delivery.

| Step | Interaction | Pass Criterion |
|:---|:---|:---|
| 1 | Student submits answers via `POST /assessments/{id}/submit` | Submission document is created in the `submissions` collection |
| 2 | Per-question grading context retrieval from Qdrant | At least 1 relevant chunk retrieved per short-answer question |
| 3 | `grade_student_answer_rag()` called per question | Returns valid JSON with `score`, `grade`, `feedback`, `teacher_quote` |
| 4 | `total_score` and `percentage` calculated correctly | Computed values match manual calculation from per-question scores |
| 5 | Grading results persisted to submission document | `grading_results` array populated; `status = "graded"` |
| 6 | Result returned to student | Student receives complete result report in < 10 seconds |

---

## 6.4 System Test Cases

The following comprehensive test cases cover key user-facing scenarios, validating the system's functional correctness and performance characteristics under realistic conditions.

| Case ID | Module / Feature | Test Scenario | Input Conditions | Expected Result / KPI |
|:---|:---|:---|:---|:---|
| **TC_01** | User Authentication | Teacher submits valid credentials | Registered teacher email + correct password | HTTP 200; JWT token issued with `role: "teacher"` claim; response time < 200ms |
| **TC_02** | User Authentication | Student submits incorrect password | Registered student email + wrong password | HTTP 401 Unauthorized; no token issued; descriptive error message returned |
| **TC_03** | RBAC Enforcement | Student attempts to access teacher-only endpoint | Valid student JWT + `POST /sessions/start` | HTTP 403 Forbidden; access denied without error trace exposure |
| **TC_04** | Session Lifecycle | Teacher initiates a new teaching session | Valid teacher JWT + `{title, subject_id}` payload | Session document created in MongoDB; `status = "active"`; transcript array initialized empty |
| **TC_05** | Neural Transcription Startup | Audio Service receives first audio frame | 16kHz mono PCM audio frame over WebSocket connection | `WhisperModel` processes frame; transcription returned within 700ms; no crash or timeout |
| **TC_06** | Transcription Accuracy | Continuous speech with technical terminology | 60-second academic lecture audio clip | Word Error Rate (WER) < 10%; all domain-specific terms reasonably transcribed |
| **TC_07** | WebSocket Material Sync | Teacher uploads a PDF slide during active session | 2 MB PDF uploaded via multipart form | All connected student dashboards receive material update within 500ms; PDF text indexed into Qdrant |
| **TC_08** | Pop Quiz Dispatch | Teacher triggers in-session pop quiz | Active session with ≥ 500 words of transcript | 3–5 questions generated in < 5 seconds; quiz modal appears on student dashboard via WebSocket |
| **TC_09** | RAG Chunk Retrieval | Assessment engine queries for session content | `session_ids` list of 3 finalized sessions | ≥ 10 semantically relevant chunks returned; all chunks have `session_id` matching input list |
| **TC_10** | RAG Assessment Generation | Teacher generates AI assessment for a subject | 2 source sessions with indexed transcripts | Assessment document with ≥ 5 questions (min. 2 MCQ, min. 2 short-answer) created in < 15 seconds |
| **TC_11** | Assessment Edit | Teacher modifies a question in an unpublished assessment | Valid question update payload via `PUT /assessments/{id}` | Assessment document updated; question text reflects new content |
| **TC_12** | Assessment Delete | Teacher deletes an unpublished assessment | Valid `DELETE /assessments/{id}` request | Assessment document removed from MongoDB; subsequent `GET` returns 404 |
| **TC_13** | Assessment Publication | Teacher publishes an assessment | `PATCH /assessments/{id}/publish` with teacher JWT | `is_published` field set to `True`; assessment appears in student query results |
| **TC_14** | Student Assessment Submission | Student submits answers to a published assessment | Complete answer payload (MCQ selections + short-answer text) | Submission document created; AI grading pipeline invoked; graded result returned in < 15 seconds |
| **TC_15** | AI Grading Accuracy (MCQ) | MCQ with known correct answer graded automatically | Student selects correct option (index 0) | Score equals `max_points` for the question; grade `A` assigned |
| **TC_16** | AI Grading — Short Answer | Short-answer question graded with relevant response | Student provides substantively correct answer | LLM assigns score ≥ 7/10; `teacher_quote` is non-empty and from the lecture context |
| **TC_17** | Session Summarization Pipeline | Teacher ends a 45-minute session | Session with 500+ transcript segments | Executive summary generated; key concepts extracted; audio summary MP3 produced; PDF report generated — all within 90 seconds |
| **TC_18** | RAG Q&A Chatbot | Student asks a subject-specific question via AI Chat | Question semantically related to an indexed session | Chatbot returns contextually grounded answer citing lecture content within 5 seconds |
| **TC_19** | Concurrent WebSocket Connections | 30 students simultaneously connected to one session | 30 concurrent WebSocket client connections | All 30 clients receive transcript and event broadcasts; no dropped connections; broadcast latency < 100ms |
| **TC_20** | Session History Retrieval | Student views session history for a subject | HTTP GET with valid student JWT and `subject_id` | All completed sessions for the subject returned; summary, audio URL, and PDF URL fields populated |

---

## 6.5 System Implementation

### 6.5.1 Implementation Architecture Overview

The **Smart Classroom Assistant** is implemented following a decoupled, service-oriented architecture pattern. The system is organized into four independent runtime processes, each with clearly defined responsibilities and communication interfaces. This separation of concerns ensures that a failure or performance degradation in one service does not propagate to the others, and that each service can be scaled, updated, or restarted independently.

---

### 6.5.2 Service 1 — Audio Processing Service (Transcription Engine)

**Location**: `backend/audio_service/`
**Runtime**: Independent Python process launched via `run_audio_service.bat`
**Port**: 8765 (WebSocket)

This service is the sole custodian of the neural transcription workload. It operates as a standalone Python process to ensure that the computationally expensive neural inference operations are fully isolated from the main application server's request-handling loop.

**Implementation Details:**
- **Model Loading**: At startup, the Faster-Whisper library loads the `small.en` Whisper model weights into GPU memory (VRAM) using `float16` precision. The model remains resident in memory for the duration of the server's uptime, eliminating cold-start latency.
- **Audio Buffer Management**: The service maintains a continuously growing audio buffer. Audio frames received over the WebSocket connection are appended to this buffer. When the buffer accumulates sufficient audio (typically 3–5 seconds), inference is triggered.
- **VAD Pre-Processing**: A Voice Activity Detection (VAD) filter is applied to the buffered audio to identify and isolate speech segments, discarding silence padding that would otherwise degrade transcription quality.
- **Faster-Whisper Inference**: The accumulated speech segment is passed to the `WhisperModel.transcribe()` method with the beam size set to 5 for a strong accuracy-speed balance. The model returns a list of `Segment` objects containing the transcribed text.
- **Post-Processing and Forwarding**: The transcribed text is cleaned of common artifacts (ghost phrases, repetitions), and the resulting clean segment is forwarded to the main FastAPI application's internal WebSocket endpoint (`/ws/internal/transcript`) for persistence and broadcast.

---

### 6.5.3 Service 2 — Main Application Layer (FastAPI)

**Location**: `backend/app.py` and supporting modules
**Runtime**: Uvicorn ASGI server
**Port**: 8001

The FastAPI application server is the system's central nervous system. It manages all client-facing REST API endpoints, the WebSocket gateway for real-time communication, business logic orchestration, and coordination with all data stores.

**Key Implementation Modules:**

| Module | Responsibility |
|:---|:---|
| `backend/app.py` | Main application entry point; registers all routers, middleware (CORS, Auth), and the WebSocket gateway |
| `backend/auth.py` | JWT token generation, validation, and the `require_role()` FastAPI dependency for RBAC |
| `backend/db.py` | MongoDB connection initialization via `AsyncIOMotorClient` and database accessor functions |
| `backend/utils/vector_store.py` | Singleton-patterned VectorStore class managing all Qdrant interactions (insert, search, delete) |
| `backend/utils/indexer.py` | Text chunking, PDF parsing, and orchestration of vector embedding and Qdrant insertion |
| `backend/utils/assessment_engine.py` | RAG query orchestration and LLM API calls for assessment generation and student answer grading |
| `backend/utils/summarizer.py` | Multi-stage LLM prompt chains for post-session summarization, concept extraction, and podcast script generation |
| `backend/utils/tts_generator.py` | Edge-TTS API calls for generating podcast-format MP3 audio summaries |

**WebSocket Gateway Architecture:**
The primary FastAPI application hosts the real-time WebSocket gateway. When a student or teacher client connects to a session's WebSocket endpoint (e.g., `/ws/session/{session_id}`), they are registered in a session-specific "broadcast room." The gateway maintains a dictionary mapping `session_id → List[WebSocket]`. When an event is emitted (transcript segment, slide update, quiz prompt), it is serialized to JSON and sent to every registered connection in the target room in a non-blocking `asyncio.gather()` call. Disconnected clients are automatically pruned from the room upon the detect of a `WebSocketDisconnect` exception.

---

### 6.5.4 Service 3 — RAG and AI Orchestration Layer

**Location**: `backend/utils/` (assessment_engine.py, vector_store.py, indexer.py, summarizer.py)
**Runtime**: Embedded within the FastAPI process (async worker threads)

The RAG pipeline is implemented as a set of asynchronous utility functions that are invoked as needed by the FastAPI request handlers. Blocking operations (LLM API calls, Qdrant searches, embedding generation) are offloaded to a thread pool via `asyncio.to_thread()` to prevent blocking the event loop.

**Embedding Model**: `all-MiniLM-L6-v2` (loaded via `sentence-transformers`) is kept resident in memory as a singleton alongside the VectorStore instance. Batch encoding of text chunks is performed using `model.encode(texts).tolist()`, producing a list of 384-dimensional float vectors.

**LLM Provider Resilience**: The assessment engine implements a two-model fallback strategy. All LLM calls first attempt the `llama-3.3-70b-versatile` model. If this call fails (e.g., due to rate limiting or a transient API error), the system automatically retries with the lighter `llama-3.1-8b-instant` model, ensuring that assessment generation and grading remain available even during peak API load.

---

### 6.5.5 Service 4 — Frontend Application (React SPA)

**Location**: `frontend/src/`
**Runtime**: Vite development server (`npm run dev`) or static build served via CDN/Nginx
**Port (Dev)**: 5173

The React frontend is organized around a role-based routing structure. Upon authentication, the JWT payload is decoded on the client side to determine the user's role, and the application renders the appropriate dashboard variant.

**Key Frontend Implementation Patterns:**

| Pattern | Implementation Detail |
|:---|:---|
| **WebSocket Lifecycle Management** | A custom React hook (`useSessionSocket`) manages WebSocket connection establishment, message parsing, reconnection with exponential backoff, and cleanup on component unmount |
| **Global State Management** | React Context API is used for user authentication state; local component state (via `useState` and `useReducer`) manages UI-specific data |
| **Optimistic UI Updates** | Transcript segments are appended to the local state immediately upon WebSocket message receipt, without waiting for server confirmation |
| **Audio Recording Pipeline** | The teacher's interface uses `MediaDevices.getUserMedia()` to access the microphone, then streams raw PCM audio frames to the Audio Service WebSocket using the `AudioWorklet` API |
| **Protected Routing** | A `ProtectedRoute` higher-order component wraps all authenticated views, verifying the JWT token's presence and expiry before rendering |
| **Lazy Loading** | Large page components (Session History, Assessment Hub, Analytics) are loaded using `React.lazy()` and `Suspense` to minimize the initial application bundle size and time-to-interactive |
