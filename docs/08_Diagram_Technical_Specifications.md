# Technical Specifications for Smart Classroom Assistant Diagrams

## Document Purpose
This document provides detailed technical specifications required to draw context diagrams, system-level data flow diagrams, and role-specific flow diagrams for the Smart Classroom Assistant system. All specifications are derived from actual implementation code and architecture decisions.

---

# PART 1: CONTEXT DIAGRAM (Level 0 - System Boundary)

## Overview
The context diagram shows the system as a single black box with external actors and major data flows crossing the system boundary.

## Diagram Structure

### External Actors (Outside System Boundary)

#### 1. Teacher Actor
- **Role**: Session initiator, content provider, quiz broadcaster
- **Interfaces with System via**:
  - Web Browser (React SPA at `frontend/src/pages/teacher/TeacherSessionViewPage.jsx`)
  - HTTPS/WebSocket protocols
- **Input Flows to System**:
  - Voice audio (16 kHz mono PCM via microphone)
  - Session commands (start, end, upload materials, broadcast quiz)
  - Teaching materials (PDF, images)
  - Assessment configuration
- **Output Flows from System**:
  - Live transcript display (partial/final segments)
  - Session analysis (summary, concepts, PDF report, audio overview)
  - Student submission results
  - Participant analytics

#### 2. Student Actor
- **Role**: Session attendee, quiz participant, knowledge seeker
- **Interfaces with System via**:
  - Web Browser (React SPA at `frontend/src/pages/SessionViewPage.jsx`)
  - HTTPS/WebSocket protocols
- **Input Flows to System**:
  - Quiz answers (MCQ selections, short-answer text)
  - Q&A queries (semantic search for concepts)
  - Session feedback (raise hand, reactions, doubts)
  - Attendance confirmation
- **Output Flows from System**:
  - Real-time transcript stream (live captions)
  - Synchronized teaching materials / screen sharing context
  - Pop quiz prompts and questions
  - Assessment feedback and grades
  - Session history and analysis artifacts
  - Resource recommendations

#### 3. Groq LLM API (External Cloud Service)
- **Address**: `api.groq.com`
- **Protocol**: HTTPS REST
- **Models Used**:
  - `Llama 3.3 70B Versatile` (summarization, concept extraction, quiz generation, answer grading)
  - `Llama 3.1 8B Instant` (fast responses, fallback)
- **Input Flows from System**:
  - Session transcript text (full or chunked)
  - Assessment generation prompts
  - Student answer grading requests (with RAG context)
- **Output Flows to System**:
  - Executive summaries (multi-paragraph text)
  - Key concept lists (structured JSON)
  - Quiz questions (MCQ + short-answer format)
  - Grading results (score, grade letter, feedback, teacher quotes)
  - Podcast-style audio scripts

#### 4. YouTube Resource Discovery (External Web Service)
- **Protocol**: HTTPS with YouTube Data API v3 (deprecated) or similar search
- **Purpose**: Automated resource curation for extracted concepts
- **Input Flows from System**:
  - Extracted concept terms (e.g., "Binary Search Tree", "Machine Learning")
  - Subject/topic context
- **Output Flows to System**:
  - Video metadata (title, channel, thumbnail URL, duration)
  - Direct video links
  - Relevance scoring

#### 5. Microsoft Edge TTS Service (External Service)
- **Technology**: `edge-tts` library (cloud-backed)
- **Purpose**: Text-to-Speech synthesis for audio podcast generation
- **Input Flows from System**:
  - Podcast-style narrative script (generated from summary)
  - Language: English (Indian English female voice preferred)
  - Speed: 0.95x (slightly slower for clarity)
- **Output Flows to System**:
  - MP3 audio file (binary)

### System Boundary (Black Box)

**System Name**: Smart Classroom Assistant  
**Primary Function**: Real-time AI-powered intelligent pedagogical platform integrating live transcription, semantic indexing, automated assessment, and multi-format study material generation.

### Diagram Drawing Instructions

**Canvas Layout**:
1. Draw a large rectangle to represent the system boundary
2. Label the rectangle: "Smart Classroom Assistant System"
3. Place actors OUTSIDE the rectangle:
   - **Teacher** on the left
   - **Student** on the right
   - **Groq LLM API** above
   - **YouTube Service** above-right
   - **Edge-TTS** below-right
4. Draw arrows for data flows:
   - Use solid arrows for request/input flows
   - Use dashed arrows for response/output flows
   - Label each arrow with data type and frequency

**Arrows & Flows to Draw**:

| From | To | Data Type | Frequency | Format |
|:---|:---|:---|:---|:---|
| Teacher | System | Voice Audio (PCM) | Continuous during session | 16kHz mono, 16-bit signed, ~32kB/sec |
| Teacher | System | Session Commands | On-demand | JSON: `{type, session_id, payload}` |
| Teacher | System | Materials Upload | On-demand | multipart/form-data (PDF, images) |
| System | Teacher | Live Transcript | Real-time | JSON: `{type: "partial"\|"final", text, start, duration}` |
| System | Teacher | Session Analysis | Post-session | JSON: `{summary, concepts, difficulty, session_type, audio_url, pdf_url}` |
| System | Teacher | Student Results | On-demand | JSON: `{student_name, score, grade, feedback}` |
| Student | System | Quiz Answers | On-demand | JSON: `{question_id, answer_text\|option_index}` |
| Student | System | Q&A Query | On-demand | JSON: `{question, session_id}` |
| Student | System | Feedback (reactions, raise hand) | During session | JSON: `{type, emoji\|action, student_id}` |
| System | Student | Transcript Stream | Real-time | JSON: `{type, text, timestamp}` |
| System | Student | Material Context | Real-time | JSON: `{type: "context_update", context: {type, url, page}}` |
| System | Student | Pop Quiz | On-demand | JSON: `{type: "pop_quiz", question, duration, options}` |
| System | Student | Assessment Feedback | Post-submission | JSON: `{score, percentage, grade, per_question_feedback}` |
| System | Groq LLM | Summarization Request | Post-session | JSON: `{transcript_text, prompt_template}` |
| Groq LLM | System | Summarization Result | Post-session | JSON: `{summary, concepts, type, difficulty}` |
| System | Groq LLM | Quiz Generation Request | On-demand | JSON: `{context_chunks, question_count, format}` |
| Groq LLM | System | Quiz JSON | On-demand | JSON: `{questions: [{type, question, options, correct_index}]}` |
| System | Groq LLM | Answer Grading Request | Post-submission | JSON: `{answer, context_chunks, model_answer}` |
| Groq LLM | System | Grade Result | Post-submission | JSON: `{score, grade_letter, feedback, teacher_quote}` |
| System | YouTube | Concept Search | Post-session | JSON: `{concept, subject}` |
| YouTube | System | Resources | Post-session | JSON: `{videos: [{title, url, channel, thumbnail}]}` |
| System | Edge-TTS | TTS Request | Post-session | JSON: `{script, language, voice, speed}` |
| Edge-TTS | System | Audio File | Post-session | Binary MP3 |

---

# PART 2: SYSTEM-LEVEL DATA FLOW DIAGRAM (DFD Level 1)

## Overview
This diagram decomposes the system into major data processing nodes and data stores, showing how information flows between components during different phases of the classroom lifecycle.

## Data Flow Diagram Components

### Data Processing Nodes (Processes)

#### Process 1: Session Management & Coordination (FastAPI Backend)
**Location**: `backend/app.py`  
**Technology Stack**:
- Framework: FastAPI 0.110+
- Server: Uvicorn ASGI
- Port: 8001
- Async: `asyncio` with `Motor` async MongoDB driver

**Responsibilities**:
- Create/retrieve/update session documents
- Route teacher commands (start, end, pause, resume)
- Manage WebSocket client registry (teacher + students)
- Broadcast transcript events to connected clients
- Receive and process material uploads
- Orchestrate post-session processing pipelines
- Handle authentication and RBAC

**Key Input Data Flows**:
- HTTP POST `/sessions/start` → `{title, subject_id}`
- HTTP POST `/sessions/{id}/end` → trigger processing
- HTTP POST `/materials/upload` → multipart form data
- WebSocket message `subscribe` → `{session_id}`
- WebSocket message `pop_quiz` → `{session_id, duration}`

**Key Output Data Flows**:
- WebSocket broadcast `final` → `{text, start, duration, session_id}`
- WebSocket broadcast `partial` → `{text, session_id}`
- MongoDB write: sessions collection (transcripts array push)
- HTTP 200 response with session details
- WebSocket broadcast `context_update` → teacher context changes

**Rate & Latency**:
- Transcript event broadcast: < 100ms
- Material sync: < 200ms
- MongoDB writes: batched, committed within 1-2 seconds

---

#### Process 2: Audio Capture & Transcription (Audio Service)
**Location**: `backend/audio_service/server.py`  
**Technology Stack**:
- Language: Python 3.10+
- Protocol: WebSocket (RFC 6455)
- Port: 8765
- Audio Model: Whisper `small.en` via Faster-Whisper

**Components**:
- **WhisperStream** (`backend/audio_service/whisper_stream.py`):
  - Loads `small.en` model on startup (quantized FP16 on GPU, INT8 on CPU)
  - Maintains continuous inference pipeline
  - Accepts audio buffers of 16kHz PCM
  - Returns transcribed text segments with timing metadata
  - Inference latency: ~200-500ms per segment (GPU-accelerated)

- **VADProcessor** (`backend/audio_service/vad.py`):
  - Voice Activity Detection using WebRTC VAD
  - Aggressiveness level: 1 (lower to detect soft speech)
  - Removes silence frames before sending to Whisper
  - Reduces inference calls by ~40% on typical classroom audio

- **SpeechSegmenter** (`backend/audio_service/speech_segmenter.py`):
  - Detects segment boundaries based on:
    - Silence duration: 450ms minimum
    - Force-flush duration: 2.4 seconds
    - Confidence threshold for segment completion
  - Preserves timing metadata (start_time, duration)
  - Overlaps segments by 200ms for context continuity

**Input Data Format**:
- Raw PCM frames: `Int16Array` @ 16kHz, 16-bit signed
- Frame size: varies (typically 4096-8192 samples = 256-512ms audio)
- Transmitted via WebSocket binary frames
- Session metadata: `{session_id, teacher_id}`

**Processing Flow**:
1. Receive raw PCM frames from teacher browser
2. Accumulate frames in buffer
3. Apply VAD: discard silence-only frames
4. Accumulate 2-4 seconds of speech
5. Send to Whisper inference
6. Receive transcribed text + confidence score
7. Forward to FastAPI via internal WebSocket
8. Maintain SessionStore with transcript buffer
9. Broadcast to all connected students

**Output Data Format**:
```json
{
  "type": "final" | "partial",
  "text": "transcribed text segment",
  "session_id": "abc123...",
  "start": 45.3,          // seconds from session start
  "duration": 2.1,        // seconds
  "confidence": 0.95,
  "context": {
    "teaching_material": "Slide 5",
    "screen_active": true
  }
}
```

**Rate & Latency**:
- Frames received: ~50-100 per second
- Segment completion: every 2-4 seconds
- End-to-end latency (audio → broadcast): < 1 second

---

#### Process 3: Text Vectorization & RAG Retrieval (Vector Store)
**Location**: `backend/utils/vector_store.py`  
**Technology Stack**:
- Vector DB: Qdrant (embedded mode)
- Embedding Model: `all-MiniLM-L6-v2` (384-dimensional vectors)
- Storage: `backend/storage/qdrant_db/` (local filesystem)

**Responsibilities**:
- Singleton instance manages Qdrant client
- On session end: chunk transcript into 500-character segments with 100-char overlap
- On PDF upload: extract text page-by-page, chunk into 300-char segments
- Generate embeddings for all chunks using Sentence-Transformers
- Store vectors in Qdrant `classroom_knowledge` collection
- Perform filtered semantic search by session_id
- Return top-K relevant chunks for RAG context

**Input Data Flows**:
- HTTP POST `/sessions/{id}/end` → trigger indexing
- Transcript text: full session concatenation
- PDF text: extracted via PyPDF
- Q&A query: student question text
- Grading request: student answer text

**Processing Details**:
```
Chunking Strategy:
- Transcript: 500 chars, 100 char overlap
- Materials: 300 chars, 50 char overlap
- Purpose: balance context size vs. search precision

Embedding Generation:
- Model: all-MiniLM-L6-v2 (sentence-transformers)
- Input: chunk text
- Output: 384-dimensional float vector
- Time: ~10-50ms per chunk

Storage in Qdrant:
{
  "id": "uuid",
  "vector": [384-dim float array],
  "payload": {
    "text": "chunk text",
    "session_id": "abc123",
    "type": "transcript" | "material",
    "chunk_index": 5,
    "page": 1,
    "title": "material name"
  }
}

Search Query:
1. Embed query: question or answer text → 384-dim vector
2. Search Qdrant with filters: {session_id: target}
3. Return top-3 to top-5 most similar chunks
4. Pass to LLM as "context" for grading/generation
```

**Output Data Format**:
```json
{
  "results": [
    {
      "text": "relevant chunk from lecture",
      "similarity_score": 0.87,
      "source": "transcript" | "material",
      "session_id": "abc123"
    }
  ]
}
```

**Rate & Latency**:
- Indexing per session: 5-30 seconds (depends on transcript length)
- Search query: 50-200ms
- Throughput: up to 1000 queries/second (typical load ~10/sec)

---

#### Process 4: LLM Orchestration & AI Artifact Generation
**Location**: `backend/utils/summarizer.py`, `backend/utils/assessment_engine.py`  
**Technology Stack**:
- LLM Provider: Groq API
- Models: Llama 3.3 70B (default), Llama 3.1 8B (fallback)
- Protocol: HTTPS REST (groq-sdk library)

**Responsibilities**:

**Sub-Process 4a: Summarization Pipeline** (`generate_summary`, `extract_concepts`, `analyze_session`)
- Input: Full session transcript
- Prompts (via system role):
  1. Executive summary: "Summarize this lecture in 3-4 paragraphs..."
  2. Key concepts: "Extract 5-8 key academic concepts..."
  3. Session classification: "Classify this as Lecture/Lab/Workshop/Seminar..."
  4. Difficulty estimation: "Estimate the academic level (Beginner/Intermediate/Advanced)..."
- Output: Structured JSON with `{summary, concepts[], session_type, difficulty_level}`
- Rate: 1 summarization per session end event
- Latency: 3-8 seconds per session
- Cost: ~0.002-0.005 USD per session

**Sub-Process 4b: Quiz Generation** (`generate_rag_quiz`)
- Input: Selected session IDs + RAG-retrieved context chunks
- Retrieval: Vector search returns top chunks by relevance
- LLM Prompt: "Generate 5 quiz questions from this context. Format as JSON with type (mcq/short_answer), question, options (for MCQ), and correct_index..."
- Output:
```json
{
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "What is...",
      "options": ["A", "B", "C", "D"],
      "correct_index": 2,
      "max_points": 2,
      "source_evidence": "chunk text"
    },
    {
      "id": "q2",
      "type": "short_answer",
      "question": "Explain...",
      "max_points": 5,
      "model_answer": "Expected answer from LLM..."
    }
  ]
}
```
- Rate: On-demand from teacher UI (Assessment Hub)
- Latency: 2-5 seconds per quiz
- Cost: ~0.001-0.003 USD per quiz

**Sub-Process 4c: Answer Grading** (`grade_student_answer_rag`)
- Input: Student answer text + RAG context chunks
- Context: Vector search returns top-3 chunks relevant to the question
- LLM Prompt: "Grade this student answer against the model answer and context. Provide score (0-max_points), grade (A/B/C/D/F), concise feedback, and a teacher quote from the context..."
- Output:
```json
{
  "score": 4,
  "max_points": 5,
  "grade": "A",
  "feedback": "Excellent understanding of the concept...",
  "teacher_quote": "As mentioned in the lecture: ...",
  "context_used": ["chunk1", "chunk2"]
}
```
- Rate: Per student submission (MCQ auto-graded, short-answer via LLM)
- Latency: 1-3 seconds per answer
- Cost: ~0.0005 USD per answer

**Rate & Latency Summary**:
- All LLM calls are asynchronous (non-blocking)
- Batch operations: up to 10 concurrent requests
- Fallback: if Groq unavailable, use cached results or simple heuristics

---

#### Process 5: Report & Audio Summary Generation
**Location**: `backend/utils/tts_generator.py`  
**Technology Stack**:
- PDF: FPDF2 library
- TTS: Microsoft Edge TTS (`edge-tts` library)

**Responsibilities**:

**Sub-Process 5a: PDF Report Generation**
- Input: Session document from MongoDB (summary, concepts, questions, transcripts)
- Tool: FPDF2 (pure Python, no external dependencies)
- Content Generated:
  1. Header: Session title, date, instructor, subject
  2. Executive summary (3-4 paragraphs)
  3. Key concepts (bullet list)
  4. Difficulty & session type badges
  5. Generated questions (if available)
  6. Footer: page numbers, timestamp, QR code (optional)
- Output: PDF file saved to `backend/storage/reports/{session_id}.pdf`
- File size: 50-200 KB
- Generation time: 2-5 seconds
- Latency: Post-session, asynchronous

**Sub-Process 5b: Audio Summary Generation via TTS**
- Input: LLM-generated podcast-style script (synthesized narrative from summary)
- Tool: edge-tts (cloud-based TTS)
- Configuration:
  - Language: en-IN (Indian English)
  - Voice: Female (e.g., "en-IN-NeerjaNeural")
  - Speed: 0.95 (slightly slower for clarity)
  - Pitch: 1.0 (neutral)
- Script Format: Conversational narrative (e.g., "Welcome to the podcast summary of today's lecture on Machine Learning...")
- Output: MP3 file saved to `backend/storage/audio/{session_id}.mp3`
- File size: 1-3 MB (typical 5-10 minute audio)
- Generation time: 10-20 seconds
- Latency: Post-session, asynchronous

**Rate & Latency**:
- Both processes trigger on session end event
- Executed in background tasks (non-blocking)
- Completion notification via WebSocket to teacher dashboard

---

### Data Stores

#### Data Store 1: MongoDB Primary Database
**Technology**: MongoDB 7.0+ (Atlas or self-hosted)  
**Database Name**: `smart_classroom`  
**Access Method**: Motor (async Python driver)  
**Location**: Deployed on MongoDB Atlas (cloud)

**Collections & Schema** (relevant to data flows):

**Collection: `sessions`**
```
{
  "_id": ObjectId,
  "session_id": "abc123...",
  "subject_id": ObjectId,
  "teacher_id": ObjectId,
  "title": "Introduction to ML",
  "started_at": ISODate("2025-04-13T10:00:00Z"),
  "ended_at": ISODate("2025-04-13T11:30:00Z"),
  "status": "active" | "processing" | "finished",
  "transcripts": [
    {
      "text": "Welcome to today's lecture",
      "start": 0.5,
      "duration": 2.1,
      "timestamp": ISODate("2025-04-13T10:00:00.5Z")
    },
    // ... more segments
  ],
  "teaching_materials": [
    {
      "id": "uuid",
      "title": "Slide 1",
      "url": "/storage/materials/xyz.pdf",
      "type": "pdf"
    }
  ],
  "summary": "Executive summary paragraph...",
  "key_concepts": ["Machine Learning", "Supervised Learning", "Decision Trees"],
  "session_type": "Lecture",
  "difficulty_level": "Intermediate",
  "audio_summary_url": "/storage/audio/abc123.mp3",
  "pdf_report_url": "/storage/reports/abc123.pdf",
  "is_indexed": true
}
```

**Collection: `quizzes`**
```
{
  "_id": ObjectId,
  "quiz_id": "uuid",
  "quiz_title": "Unit 3 Assessment",
  "subject_id": ObjectId,
  "teacher_id": ObjectId,
  "source_session_ids": [ObjectId, ObjectId],
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "What is...",
      "options": ["A", "B", "C", "D"],
      "correct_index": 2,
      "max_points": 2,
      "source_evidence": "chunk from transcript"
    }
  ],
  "is_published": true,
  "created_at": ISODate("2025-04-13T11:35:00Z")
}
```

**Collection: `quiz_submissions`**
```
{
  "_id": ObjectId,
  "assessment_id": ObjectId,
  "student_id": ObjectId,
  "subject_id": ObjectId,
  "answers": [
    {
      "question_id": "q1",
      "answer": 2  // option index for MCQ
    },
    {
      "question_id": "q2",
      "answer": "Student's written response"
    }
  ],
  "grading_results": [
    {
      "question_id": "q1",
      "score": 2,
      "grade": "A",
      "feedback": "Correct!"
    },
    {
      "question_id": "q2",
      "score": 4,
      "max_points": 5,
      "grade": "A",
      "feedback": "Excellent explanation...",
      "teacher_quote": "As the lecture mentioned..."
    }
  ],
  "total_score": 6,
  "max_possible_score": 7,
  "percentage": 85.7,
  "status": "graded",
  "submitted_at": ISODate("2025-04-13T12:00:00Z"),
  "graded_at": ISODate("2025-04-13T12:01:30Z")
}
```

**Write Patterns**:
- `transcripts` array: `$push` operation every 2-4 seconds (real-time streaming)
- `status` field: updated on session lifecycle events
- Full document updates: post-session processing (summary, concepts, audio_url, etc.)

**Read Patterns**:
- Teacher dashboard: full session document (for context and analysis)
- Student history: filtered query for enrolled subjects only
- Quiz retrieval: full document on quiz attempt
- Transcript polling: `transcripts` array projection

**Indexes**:
- `session_id` (unique)
- `teacher_id` (for teacher dashboard)
- `subject_id` (for filtering by course)
- `status` (for filtering active vs. finished)

---

#### Data Store 2: Qdrant Vector Database
**Technology**: Qdrant (embedded mode)  
**Storage Location**: `backend/storage/qdrant_db/` (local filesystem)  
**Collection Name**: `classroom_knowledge`

**Schema**:
```
{
  "id": "uuid-generated",
  "vector": [384-dimensional float array],
  "payload": {
    "text": "chunk of transcript or material",
    "session_id": "abc123",
    "type": "transcript" | "material",
    "chunk_index": 5,
    "page": 1,  // for PDFs
    "title": "material name",
    "confidence": 0.95  // Whisper confidence
  }
}
```

**Indexes**:
- `session_id` (keyword index for filtering)
- `type` (keyword index)

**Operations**:
- **Insert**: After session indexing (bulk upsert of 100-500 vectors)
- **Search**: ANN (approximate nearest neighbor) cosine similarity filtered by session_id
- **Delete**: Manual or TTL-based (optional)

**Capacity**:
- Vector dimension: 384
- Distance metric: cosine similarity
- Typical dataset: 10,000-50,000 vectors for a semester

---

#### Data Store 3: File Storage System
**Location**: `backend/storage/` (local filesystem + HTTP serving)

**Subdirectories**:

**`materials/`**:
- Uploaded teaching PDFs and images
- Naming: `{material_id}.{ext}` or `{session_id}_{index}.pdf`
- Size: 1-50 MB per file
- Served via: FastAPI `StaticFiles` middleware at `/storage/materials/`

**`reports/`**:
- Generated PDF session reports
- Naming: `{session_id}.pdf`
- Size: 50-200 KB per report
- Generated by: FPDF2
- Served via: HTTP GET `/storage/reports/{session_id}.pdf`

**`audio/`**:
- Generated audio summaries (MP3)
- Naming: `{session_id}.mp3`
- Size: 1-3 MB per file
- Generated by: edge-tts
- Served via: HTTP GET `/storage/audio/{session_id}.mp3` (browser audio player)

**`qdrant_db/`**:
- Qdrant embedded vector store data
- Format: Binary RocksDB snapshots
- Not directly served; accessed only via Qdrant client API
- Backup: snapshot files included in deployment

---

### Data Flow Paths (Sequencing)

#### Flow 1: Live Transcription (Real-Time, Every 2-4 Seconds)
```
Teacher Browser
  ↓ (WebSocket: raw PCM frames @ ~50/sec)
Audio Service [Whisper inference]
  ↓ (WebSocket: transcript event JSON)
FastAPI Backend [Session Management]
  ↓ (MongoDB: $push to transcripts array)
MongoDB [sessions collection]
  ↓ (reload from DB)
FastAPI Backend
  ↓ (WebSocket broadcast)
Student Browser [transcript viewer]
  ✓ Display "Welcome to today's lecture" at T+0.5s
```

**Latency Budget**:
- Teacher speech → browser capture: 20ms
- Browser → Audio Service: 50ms
- Audio Service [VAD + Whisper]: 300-500ms
- Whisper output → FastAPI: 10ms
- FastAPI → MongoDB write: 50ms
- MongoDB → student broadcast: 50ms
- **Total**: ~500-700ms (acceptable for educational context)

---

#### Flow 2: Post-Session Processing (Asynchronous, After Session End)
```
Teacher clicks "End Session"
  ↓ (HTTP POST /sessions/{id}/end)
FastAPI Backend
  ↓ (update status → "processing")
MongoDB [sessions collection]
  ↓ (trigger background task)
FastAPI [Orchestrator] → Parallel tasks:
  ├─→ Vector Indexing
  │    ↓ (chunk transcript)
  │    ↓ (embed with Sentence-Transformers)
  │    ↓ (upsert into Qdrant)
  │    ✓ Session marked "is_indexed: true"
  │
  ├─→ Summarization Pipeline
  │    ↓ (send full transcript to Groq LLM)
  │    ↓ (receive summary, concepts, type, difficulty)
  │    ↓ (MongoDB update: summary + key_concepts + session_type + difficulty_level)
  │    ✓ Session enriched with metadata
  │
  ├─→ Podcast Script & Audio Generation
  │    ↓ (Groq LLM: "Write a podcast-style narrative...")
  │    ↓ (edge-tts: synthesize script to MP3)
  │    ↓ (save to backend/storage/audio/)
  │    ↓ (update MongoDB: audio_summary_url)
  │    ✓ Audio accessible to students
  │
  └─→ PDF Report Generation
       ↓ (FPDF2: build PDF from summary, concepts, questions)
       ↓ (save to backend/storage/reports/)
       ↓ (update MongoDB: pdf_report_url)
       ✓ Report accessible for download

After all tasks complete:
  ↓ (update status → "finished")
MongoDB [sessions collection]
  ↓ (WebSocket notification to all connected clients)
Teacher Dashboard & Student Dashboard
  ✓ "Analysis available" notification
```

**Duration**: 10-30 seconds (longest: large transcript indexing + LLM)  
**Parallelization**: All 4 tasks run concurrently (non-blocking)

---

#### Flow 3: Quiz Generation (On-Demand)
```
Teacher navigates Assessment Hub → "Generate Quiz"
  ↓ (select source sessions + question count)
  ↓ (HTTP POST /assessments/generate)
FastAPI Backend [RAG Assessment Engine]
  ↓ (for each source session: vector search via Qdrant)
Qdrant Vector Store
  ↓ (retrieve top-10 chunks per session)
Qdrant → FastAPI
  ↓ (concatenate chunks as "context")
  ↓ (send to Groq LLM)
Groq LLM [Llama 3.3 70B]
  ↓ (generate quiz JSON: questions[] with options, correct indices, evidence)
Groq → FastAPI
  ↓ (save to MongoDB: quizzes collection)
MongoDB [quizzes collection]
  ↓ (HTTP 200 with quiz_id)
Teacher Dashboard [Assessment Hub]
  ✓ Display generated questions for review/edit
```

**Duration**: 3-8 seconds  
**Throughput**: Up to 5 concurrent quiz generations

---

#### Flow 4: Student Quiz Submission & Grading (On-Demand)
```
Student views published quiz → answers all questions
  ↓ (HTTP POST /assessments/{quiz_id}/submit)
FastAPI Backend [Assessment Grading Engine]
  ├─→ For each MCQ:
  │    ↓ (check answer against correct_index)
  │    ✓ Auto-grade: score = correct ? max_points : 0
  │
  └─→ For each short-answer:
       ↓ (vector search: retrieve context chunks relevant to question)
Qdrant Vector Store
  ↓ (return top-3 chunks)
Qdrant → FastAPI
  ↓ (send to Groq LLM: student_answer + model_answer + context)
Groq LLM [Llama 3.3 70B]
  ↓ (grade with rubric: score, feedback, teacher_quote)
Groq → FastAPI
  ↓ (save grading_results to MongoDB: quiz_submissions collection)
MongoDB [quiz_submissions collection]
  ↓ (compute total_score, percentage, grade letter)
  ↓ (HTTP 200 with results)
Student Dashboard
  ✓ Display score, percentage, grade, feedback, teacher quote
```

**Duration**: 1-3 seconds per answer (short-answer grading is LLM-dependent)  
**Parallelization**: Grade all short-answers concurrently (one LLM call per answer)

---

#### Flow 5: Resource Discovery (Post-Session, Background)
```
Session finalized
  ↓ (async task: resource discovery)
FastAPI Backend
  ↓ (retrieve key_concepts[] from session document)
MongoDB [sessions collection]
  ↓ (for each concept: YouTube search)
YouTube Data API / Web Search
  ↓ (retrieve video metadata: title, channel, URL, thumbnail)
YouTube → FastAPI
  ↓ (rank by relevance + view count)
  ↓ (save to MongoDB: concept_resources collection)
MongoDB [concept_resources collection]
  ↓ (WebSocket notification to students: "New resources available")
Student Dashboard [Resources Tab]
  ✓ Display curated video links per concept
```

**Duration**: 5-15 seconds  
**Rate**: 1 per session end

---

## DFD Level 1 Diagram Drawing Instructions

### Canvas & Layout

1. **Draw system boundary** (large rectangle) with label "Smart Classroom Assistant"

2. **Draw 5 major process nodes** (circles or rounded rectangles):
   - **P1: Session Management** (center-left)
   - **P2: Audio Transcription** (top-left)
   - **P3: RAG Retrieval** (center)
   - **P4: LLM Orchestration** (top-right)
   - **P5: Report Generation** (bottom-right)

3. **Draw 3 data stores** (two parallel lines or cylinders):
   - **DS1: MongoDB** (center-bottom)
   - **DS2: Qdrant** (right-bottom)
   - **DS3: File Storage** (bottom)

4. **Draw data flows** (labeled arrows):

| From | To | Label | Data Type |
|:---|:---|:---|:---|
| P2 | P1 | Transcript events | JSON {text, start, duration} |
| P1 | DS1 | Write transcripts | $push to sessions.transcripts |
| P1 | DS3 | Serve materials | HTTP GET /storage/ |
| P3 | DS2 | Chunk & embed | Upsert vectors |
| P3 | DS2 | Search context | Query by session_id |
| DS2 | P3 | Relevant chunks | [{text, similarity_score}] |
| P4 | P3 | Retrieval requests | {session_id, query} |
| P4 | DS1 | Update summaries | Write to sessions doc |
| P4 | DS3 | Save audio/PDF | Binary files |
| DS1 | P1 | Poll session data | Full session document |
| DS1 | P4 | Transcript input | sessions.transcripts |

5. **Add external systems** (outside system boundary):
   - **Groq LLM** (connected to P4)
   - **YouTube API** (connected to P5)
   - **Edge-TTS** (connected to P5)

---

# PART 3: TEACHER FLOW DIAGRAM

## Overview
This diagram traces a complete teacher lifecycle: session initiation → live teaching → real-time monitoring → session conclusion → post-session analysis.

## Phase 1: Pre-Session Setup

### 1.1 Authentication & Login
**Actor**: Teacher  
**Interaction**:
- Opens React SPA at `frontend/` (Vite development server or production build)
- Clicks "Sign In" button
- Enters email and password

**Technical Flow**:
```
Teacher Browser
  ↓ (HTTPS POST /auth/login)
FastAPI Backend [backend/auth.py]
  ↓ (verify email exists in users collection)
MongoDB [users collection]
  ↓ (check password_hash using bcrypt)
  ↓ (JWT generation: header.payload.signature)
FastAPI [create_access_token()]
  ↓ (token stored in localStorage: key="access_token")
  ↓ (JWT decoded: {sub: email, role: teacher, exp: timestamp})
Teacher Dashboard
  ✓ Display "Welcome, Teacher Name"
```

**JWT Structure**:
```
Header: {alg: "HS256", typ: "JWT"}
Payload: {sub: "teacher@school.com", role: "teacher", exp: 1713009600}
Signature: HMACSHA256(header.payload, SECRET_KEY)
```

**Storage**:
- Token stored in browser localStorage
- Attached to all subsequent API requests as `Authorization: Bearer <token>`
- Used for WebSocket authentication (token passed in query string)

---

### 1.2 Subject & Session Selection
**Actor**: Teacher  
**Interface**: Teacher Dashboard → "New Session"  
**Form Fields**:
- Session Title (text input): "Introduction to Machine Learning - Lecture 5"
- Subject Selection (dropdown): from `subjects` collection filtered by `faculty_id == teacher_id`
- Optional: Initial slide deck upload (file input, type: PDF)

**Technical Flow**:
```
Teacher clicks "Create Session"
  ↓ (form validation: title > 3 chars, subject_id selected)
  ↓ (HTTPS POST /sessions/create)
Payload: {
  "title": "Introduction to Machine Learning - Lecture 5",
  "subject_id": "507f1f77bcf86cd799439011",
  "optional_materials": [File object] (if uploaded)
}

FastAPI Backend [app.py: POST /sessions/create]
  ↓ (authenticate teacher via JWT)
  ↓ (generate session_id = UUID)
  ↓ (create document in sessions collection)
MongoDB [sessions collection]
  ↓ (insert {session_id, teacher_id, subject_id, title, status: "active", transcripts: []})
  ↓ (if materials uploaded: extract text, chunk, embed, upsert to Qdrant)
Qdrant [classroom_knowledge collection]
  ↓ (HTTP 201 with session_id)
Teacher Browser
  ↓ (navigate to TeacherSessionViewPage with session_id)
React Router: /teacher/session/{session_id}
  ↓ (page rendered with session controls)
Teacher Dashboard [Live Session View]
  ✓ Display session title, timer, transcript area, participant list
```

**Session Document Created**:
```json
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "session_id": "abc123-def456-ghi789",
  "subject_id": ObjectId("507f1f77bcf86cd799439011"),
  "teacher_id": ObjectId("507f1f77bcf86cd799439010"),
  "title": "Introduction to Machine Learning - Lecture 5",
  "started_at": ISODate("2025-04-13T10:00:00Z"),
  "status": "active",
  "transcripts": [],
  "teaching_materials": []
}
```

---

## Phase 2: Live Session Execution

### 2.1 WebSocket Connection & Audio Capture Startup
**Actor**: Teacher  
**Interface**: "Start Recording" button  
**Prerequisites**: Microphone permission granted

**Technical Flow**:
```
Teacher clicks "Start Recording"
  ↓ (setIsActive(true) in React state)
useEffect triggered [TeacherSessionViewPage.jsx:883]
  ↓ (check: sessionStatus === "active" && isWsConnected === true)
  ↓ (call navigator.mediaDevices.getUserMedia({audio: true}))
Browser Permission Dialog
  ✓ (user allows microphone access)
MediaStream received
  ↓ (create AudioContext @ 16kHz sample rate)
  ↓ (create ScriptProcessor with 4096-sample buffer)
  ↓ (attach onaudioprocess callback)
Audio Capture Loop
  ✓ (every ~86ms, processor fires with 4096 samples)
  ↓ (convert Float32 inputData → Int16 PCM)
  ↓ (send via WebSocket to Audio Service)
  ↓ (repeat until "Stop Recording" clicked)
```

**WebSocket Initialization** (Effect 1: [id, sessionStatus]):
```
TeacherSessionViewPage.jsx:664
  ↓ (new WebSocket(ws://localhost:8765))
  ↓ (set binaryType = "arraybuffer" for audio frames)
ws.onopen()
  ↓ (send {type: "subscribe", session_id: id})
  ↓ (send {type: "join", session_id, role: "teacher", name, email})
  ↓ (send {type: "p_init", session_id})  // Producer initialization
Audio Service [server.py:handle_client]
  ✓ Register teacher as producer
  ✓ Start transcription inference pipeline
  ✓ Ready to receive audio frames
```

**Audio Capture Process** (Effect 2: [isActive, wsRef, sessionStatus]):
```
TeacherSessionViewPage.jsx:883
  ↓ (check: isActive && wsRef.readyState === OPEN)
navigator.mediaDevices.getUserMedia({audio: true})
  ↓ (receive MediaStream with audio track)
  ↓ (create AudioContext {sampleRate: 16000})
  ↓ (create MediaStreamSource from stream)
  ↓ (create ScriptProcessor(bufferSize=4096, inputChannels=1, outputChannels=1))
  ↓ (attach to source node)
processor.onaudioprocess = (e) => {
  const inputData = e.inputBuffer.getChannelData(0);  // Float32Array[4096]
  const pcmData = new Int16Array(inputData.length);
  for (i = 0; i < inputData.length; i++) {
    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
  }
  if (wsRef.current?.readyState === OPEN && !isMuted) {
    wsRef.current.send(pcmData.buffer);  // Binary WebSocket frame
  }
}
source.connect(processor);
processor.connect(audioContext.destination);
```

**Audio Frame Details**:
- Frequency: 4096 samples @ 16kHz = ~256ms per frame = 1 frame every 256ms
- Size: 4096 samples × 2 bytes (Int16) = 8192 bytes per frame
- Bandwidth: 8192 bytes × 4 frames/sec = ~32 kB/sec
- Transmission: WebSocket binary frame (RFC 6455)

---

### 2.2 Live Transcription & Broadcast
**Trigger**: Audio frames arriving at Audio Service  
**Frequency**: Every 2-4 seconds (speech segmentation)

**Technical Flow**:
```
Audio Service [server.py:handle_client]
Receives WebSocket binary frame
  ↓ (read ArrayBuffer: Int16Array of audio samples)
  ↓ (append to AudioSession.remainder_buffer)
Accumulate until chunk ≥ 3200 samples (~200ms):
  ↓ (convert Int16 → float32 [-1, 1])
  ↓ (resample if needed to 16kHz)
VADProcessor.process(audio_chunk)
  ↓ (WebRTC VAD @ aggressiveness=1)
  ✓ if confidence > 0.5: mark frame as speech
  ✗ if silence: discard
SpeechSegmenter.add_audio(speech_frames)
  ↓ (accumulate speech frames)
  ↓ (detect 450ms silence boundary)
Trigger Whisper inference:
  ↓ (loop.run_in_executor(inference_executor, whisper_instance.transcribe, audio_buffer))
WhisperStream.transcribe(audio_buffer)
  ↓ (load model if not loaded: faster-whisper "small.en")
  ↓ (feed 30-second buffer to model)
  ↓ (inference @ FP16 on GPU: 300-500ms)
  ↓ (receive: text, confidence, start_time, duration)
Whisper Output:
{
  "text": "Welcome to today's lecture on machine learning",
  "confidence": 0.95,
  "start": 0.5,  // seconds from session start
  "duration": 2.1
}

Forward to FastAPI via internal WebSocket:
  ↓ (send JSON event)
FastAPI Backend [app.py:broadcast_transcript]
  ↓ (append transcript segment to SessionStore)
  ↓ (execute MongoDB update: $push to sessions.transcripts)
MongoDB [sessions collection]
  ↓ (write latency: ~50ms)
  ✓ Document now contains: {transcripts: [..., {text, start, duration, timestamp}]}

Broadcast to students:
  ↓ (for each student WebSocket in session room)
  ↓ (send JSON: {type: "final", text, start, duration, session_id})
Student Browser [SessionViewPage.jsx]
  ✓ ws.onmessage → setTranscripts() → re-render
  ✓ Transcript text appears in live viewer
```

**Partial Transcription** (Non-final intermediate results):
```
While VAD detects speech (< 450ms silence):
  ↓ (send partial results to browser every ~1 second)
  ↓ (useful for teacher to see "live" transcription as they speak)
Teacher Browser
  ✓ setPartialText() → display in faded color
  ✓ Update every 1 second with latest partial
```

**Latency Analysis**:
| Stage | Latency |
|:---|---:|
| Teacher speech → browser capture | 20ms (hardware) |
| Browser → Audio Service (WebSocket) | 50ms (network) |
| Audio Service accumulation | 200ms (speech segmentation) |
| Whisper inference | 400ms (GPU) |
| FastAPI processing | 20ms |
| FastAPI → MongoDB write | 50ms |
| FastAPI → Student broadcast | 30ms |
| **Total** | **~770ms** |

---

### 2.3 Material Upload & Context Sync
**Trigger**: Teacher clicks "Upload Materials" button  
**Prerequisites**: Session active

**Technical Flow**:
```
Teacher selects PDF file from local disk
  ↓ (file size validation: < 100 MB)
  ↓ (type validation: .pdf, .png, .jpg only)
  ↓ (HTTPS POST /materials/upload with FormData)
FormData Payload:
{
  "file": File object (PDF blob),
  "session_id": "abc123...",
  "title": "Slide Deck - Week 5"
}

FastAPI Backend [app.py: POST /materials/upload]
  ↓ (authenticate teacher via JWT)
  ↓ (save file to backend/storage/materials/{uuid}.pdf)
  ↓ (extract text using PyPDF)
  ↓ (chunk text into 300-char segments)
  ↓ (generate embeddings using Sentence-Transformers)
  ↓ (upsert vectors to Qdrant with payload: {session_id, type: "material", page, title})
Qdrant [classroom_knowledge collection]
  ↓ (update sessions collection: add to teaching_materials[])
MongoDB [sessions collection]
  ↓ (HTTP 200 with material_id)
Teacher Browser
  ✓ Display "Material uploaded" notification

Broadcast context update:
  ↓ (send WebSocket message: {type: "context_update", context: {type: "pdf", url, page: 1}})
Student Browser [SessionViewPage.jsx]
  ↓ (ws.onmessage → setCurrentContext)
  ✓ Display PDF in synchronized material viewer
  ✓ Auto-scroll to match teacher's page navigation
```

**PDF Extraction & Processing**:
```
PyPDF.PdfReader(file_path)
  ↓ (extract page count)
  ↓ (iterate pages: for page in reader.pages)
  ↓ (text = page.extract_text())
Text chunking (per page):
  ↓ (split into 300-char segments with 50-char overlap)
  ↓ [chunk_0: chars 0-300, chunk_1: chars 250-550, ...]
Embedding:
  ↓ (model = SentenceTransformer("all-MiniLM-L6-v2"))
  ↓ (for each chunk: embedding = model.encode(chunk))
  ↓ (embedding: 384-dimensional float vector)
Qdrant upsert:
  ↓ (for each chunk: client.upsert(...))
  ↓ (payload: {text, session_id, type: "material", page, title})
```

**File Storage**:
- Path: `backend/storage/materials/{material_id}.pdf`
- Served via: `app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")`
- URL: `/storage/materials/{material_id}.pdf` (accessible to students via HTTP GET)

---

### 2.4 Pop Quiz Launch (In-Session Assessment)
**Trigger**: Teacher clicks "Launch Pop Quiz" during active session  
**Frequency**: Optional, on-demand

**Technical Flow**:
```
Teacher clicks "Launch Pop Quiz"
  ↓ (form: select duration = 60 seconds)
  ↓ (system auto-generates 3-5 questions from current transcript context)
  ↓ (HTTPS POST /pop-quiz/generate)
Payload:
{
  "session_id": "abc123...",
  "duration": 60,
  "num_questions": 4,
  "context": "recent_transcript"
}

FastAPI Backend [assessment_engine.py:generate_rag_quiz]
  ↓ (retrieve recent session transcripts from MongoDB)
  ↓ (vector search: Qdrant search for top-10 relevant chunks)
Qdrant [classroom_knowledge collection]
  ↓ (retrieve chunks: [{text, similarity_score}, ...])
  ↓ (pass to Groq LLM with prompt: "Generate 4 MCQ questions from this context...")
Groq LLM API [groq-sdk]
  ↓ (Llama 3.3 70B endpoint)
  ↓ (inference latency: 1-3 seconds)
Groq Response:
{
  "questions": [
    {
      "type": "mcq",
      "question": "What is the primary advantage of ...",
      "options": ["A", "B", "C", "D"],
      "correct_index": 2
    },
    // ... 3 more questions
  ]
}

FastAPI
  ↓ (HTTP 200 with questions)
Teacher Browser
  ✓ Display quiz questions (optional: teacher can review/edit before broadcasting)
  ✓ Click "Broadcast"
  ↓ (HTTPS POST /pop-quiz/broadcast)
FastAPI Backend
  ↓ (for each student WebSocket in session room:)
  ↓ (send {type: "pop_quiz", questions: [...], duration: 60})
Student Browser [SessionViewPage.jsx]
  ↓ (ws.onmessage: data.type === "pop_quiz")
  ↓ (setActiveQuiz(quiz), setQuizMode(true))
  ✓ Modal appears on screen: "Pop Quiz - 60 seconds remaining"
  ✓ Display all questions with input fields
```

**Student Answer Submission** (runs parallel to quiz modal):
```
Student selects answers and clicks "Submit"
  ↓ (HTTPS POST /pop-quiz/{session_id}/submit)
Payload:
{
  "session_id": "abc123...",
  "answers": [
    {question_id: "q1", answer: 2},  // MCQ option index
    {question_id: "q2", answer: 1},
    // ...
  ]
}

FastAPI Backend [assessment_engine.py:grade_pop_quiz]
  ├─→ For each MCQ: immediate auto-grade
  │    ↓ (answer === correct_index ? points : 0)
  │    ✓ score += points
  │
  └─→ (HTTP 200 with score, percentage, grade letter)
Student Browser
  ✓ Display "You scored 3/4 (75%)" with immediate feedback

Teacher Dashboard [Pop Quiz Responses]
  ✓ Display all student responses in real-time
  ✓ Show: student_name, score, percentage, grade
  ✓ Allows teacher to see class comprehension level
```

---

### 2.5 Session Control & Monitoring
**Continuous During Live Session**

**Transcript Monitoring**:
```
Teacher Dashboard [Live Transcripts Panel]
  ↓ (scrollable list of transcript segments)
  ↓ (updates every 2-4 seconds as Whisper outputs new segments)
  ↓ (segment format: {text, timestamp, start, duration})
  ✓ Partial transcriptions (faded color) appear immediately
  ✓ Final transcriptions (bold) commit after VAD silence detection
```

**Participant Tracking**:
```
Teacher Dashboard [Participants Panel]
  ↓ (WebSocket message: {type: "participant_count"})
  ↓ (Audio Service broadcasts participant_count every 30 seconds)
  ↓ (session_stores[session_id].participants dict maintains active connections)
Audio Service [server.py:broadcast_participant_count]
  asyncio every 30 seconds:
    ↓ (count = len(session_stores[session_id].participants))
    ↓ (participants = list of {name, role})
    ↓ (send {type: "participant_count", count, participants} to all clients)
Teacher Browser
  ✓ Display "15 students connected"
  ✓ Update participant list with names
```

**Session Pause/Resume** (optional):
```
Teacher clicks "Pause Transcription"
  ↓ (send WebSocket: {type: "pause", session_id})
Audio Service
  ↓ (set AudioSession.running = False)
  ↓ (stop accepting new audio frames)
  ↓ (transcription paused, but session stays "active")
Teacher clicks "Resume"
  ↓ (send WebSocket: {type: "resume", session_id})
Audio Service
  ↓ (set AudioSession.running = True)
  ↓ (resume accepting frames)
```

---

## Phase 3: Post-Session Processing

### 3.1 Session Termination
**Trigger**: Teacher clicks "End Session"  
**Prerequisites**: Session status === "active"

**Technical Flow**:
```
Teacher clicks "End Session"
  ↓ (confirmation dialog: "Are you sure?")
  ✓ (HTTPS POST /sessions/{session_id}/end)
Payload:
{
  "session_id": "abc123...",
  "final_notes": "Covered chapters 1-3, students seemed engaged"  // optional
}

FastAPI Backend [app.py: POST /sessions/{id}/end]
  ↓ (retrieve full session document from MongoDB)
  ↓ (update status: "active" → "processing")
MongoDB [sessions collection]
  ↓ (set ended_at = now())
  ↓ (HTTP 202 Accepted - processing will continue asynchronously)
Teacher Browser
  ✓ Display "Session is finalizing. Analysis will be ready in 30 seconds..."

Trigger Background Processing Tasks [background_tasks / asyncio]:
  ├─→ Task 1: Transcript Indexing
  │    ↓ (retrieve full transcripts[] array from session doc)
  │    ↓ (concatenate all text segments)
  │    ↓ (chunk into 500-char segments with 100-char overlap)
  │    ↓ (generate embeddings using Sentence-Transformers)
  │    ↓ (upsert to Qdrant with payload: {session_id, type: "transcript", chunk_index})
  │    ↓ (update MongoDB: is_indexed = true)
  │    ✓ Completes in 5-15 seconds
  │
  ├─→ Task 2: Summarization Pipeline [generate_summary, extract_concepts, analyze_session]
  │    ↓ (concat all transcript text → ~5000 characters)
  │    ↓ (send to Groq LLM with prompts:)
  │    ├─ Prompt 1: "Summarize this lecture in 3-4 comprehensive paragraphs"
  │    ├─ Prompt 2: "Extract 5-8 key academic concepts as a JSON array"
  │    ├─ Prompt 3: "Classify as: Lecture, Lab, Workshop, Seminar"
  │    └─ Prompt 4: "Estimate difficulty: Beginner, Intermediate, Advanced"
  │    ↓ (Groq LLM inference: 3-8 seconds)
  │    ↓ (parse responses: {summary, concepts[], session_type, difficulty})
  │    ↓ (update MongoDB: summary, key_concepts, session_type, difficulty_level)
  │    ✓ Completes in 8-10 seconds
  │
  ├─→ Task 3: Podcast Audio Generation [tts_generator.py]
  │    ↓ (send summary text to Groq LLM: "Write a podcast-style narrative (~500 words) about this lecture")
  │    ↓ (Groq generates conversational script, e.g., "Welcome back to ClassPodcast. Today we explored...")
  │    ↓ (send script to edge-tts: language=en-IN, voice=female, speed=0.95)
  │    ↓ (edge-tts synthesizes to MP3: 10-20 seconds)
  │    ↓ (save to backend/storage/audio/{session_id}.mp3)
  │    ↓ (update MongoDB: audio_summary_url = "/storage/audio/{session_id}.mp3")
  │    ✓ Completes in 15-25 seconds
  │
  ├─→ Task 4: PDF Report Generation [tts_generator.py: generate_pdf_report]
  │    ↓ (create FPDF instance)
  │    ↓ (add_page() → add header: title, date, instructor, subject)
  │    ↓ (add_page() → add summary text in justified format)
  │    ↓ (add_page() → add key concepts as bullet list)
  │    ↓ (add badges: session_type, difficulty_level)
  │    ↓ (if questions available: add them as Q&A section)
  │    ↓ (add footer: page numbers, timestamp)
  │    ↓ (output to backend/storage/reports/{session_id}.pdf)
  │    ↓ (update MongoDB: pdf_report_url = "/storage/reports/{session_id}.pdf")
  │    ✓ Completes in 3-5 seconds
  │
  └─→ Task 5: Resource Discovery [youtube_service.py]
       ↓ (retrieve key_concepts[] from updated session doc)
       ↓ (for each concept: search YouTube / web for educational videos)
       ↓ (retrieve metadata: title, channel, URL, thumbnail)
       ↓ (filter by relevance + view count)
       ↓ (save to MongoDB: concept_resources collection)
       ✓ Completes in 5-15 seconds

Wait for all background tasks:
  ↓ (asyncio.gather(task1, task2, task3, task4, task5))
After all complete:
  ↓ (update MongoDB: status = "finished")
  ↓ (broadcast WebSocket: {type: "session_finalized", session_id})
Teacher Dashboard
  ✓ Notification: "Session finalized! View analysis below."
  ✓ Display generated artifacts:
    - Executive summary
    - Key concepts list
    - Session type + difficulty badges
    - Audio podcast player
    - PDF report download button
    - Related resources (videos)
```

**Duration Summary**:
- Task 1 (Indexing): 5-15 seconds
- Task 2 (Summarization): 8-10 seconds
- Task 3 (Audio): 15-25 seconds
- Task 4 (PDF): 3-5 seconds
- Task 5 (Resources): 5-15 seconds
- **Total (parallel)**: Max(25s) = 25-30 seconds

---

### 3.2 Teacher Dashboard: Session History & Analytics
**Trigger**: Teacher navigates "Session History" tab  
**Endpoint**: `GET /teachers/sessions`

**Technical Flow**:
```
Teacher clicks "Session History"
  ↓ (HTTPS GET /teachers/sessions)
Query Parameters:
{
  "subject_id": "507f1f77bcf86cd799439011",  // optional filter
  "limit": 20,
  "offset": 0
}

FastAPI Backend [app.py: GET /teachers/sessions]
  ↓ (authenticate teacher via JWT)
  ↓ (query MongoDB: {teacher_id: current_user_id, status: "finished"})
MongoDB [sessions collection]
  ↓ (return last 20 sessions sorted by started_at descending)
  ↓ (projection: {title, subject_id, started_at, ended_at, summary, key_concepts, audio_summary_url, pdf_report_url, student_count})
  ↓ (HTTP 200 with sessions[])
Teacher Browser [Session History Page]
  ✓ Display table:
    | Session Title | Date | Duration | Students | Summary Preview | Actions |
    |---|---|---|---|---|---|
    | Intro to ML - Week 5 | Apr 13, 2025 | 1h 30m | 25 | The session covered... | View Analysis |
    | Linear Regression | Apr 10, 2025 | 1h 15m | 24 | Students learned about... | View Analysis |

Click "View Analysis" for a session:
  ↓ (navigate to /teacher/session/{session_id}/analysis)
  ↓ (HTTPS GET /sessions/{session_id})
FastAPI Backend
  ↓ (retrieve full session document)
MongoDB [sessions collection]
  ↓ (HTTP 200 with full document)
Teacher Browser [Session Analysis Page]
  ✓ Display:
    - Executive Summary (text)
    - Key Concepts (bullet list)
    - Session Type & Difficulty badges
    - Transcript (scrollable, full text)
    - Audio Summary (HTML5 player)
    - PDF Report (download button)
    - Related Resources (video links)
    - Student Performance (if quizzes taken):
      - Graph: score distribution
      - List: student_name, score, percentage, grade
      - Questions with % correct (for MCQ only)
```

---

### 3.3 Assessment Hub: Quiz Management
**Interface**: Teacher Dashboard → "Assessment Hub"  
**Purpose**: Create, publish, review, manage all assessments

**Create Assessment Flow**:
```
Teacher clicks "Create Assessment"
  ↓ (modal: Subject selection, Question count)
  ↓ (HTTPS POST /assessments/generate)
Payload:
{
  "subject_id": "507f1f77bcf86cd799439011",
  "source_session_ids": ["abc123", "def456", "ghi789"],
  "num_questions": 10,
  "question_types": {mcq: 7, short_answer: 3}
}

FastAPI Backend [assessment_engine.py:generate_rag_quiz]
  ↓ (for each source session: vector search in Qdrant)
Qdrant [classroom_knowledge collection]
  ↓ (retrieve top-10 chunks per session)
Qdrant → FastAPI
  ↓ (concatenate chunks with sources labeled)
  ↓ (send to Groq LLM with detailed prompt:)
    "Generate an assessment with 7 MCQs and 3 short-answer questions.
     For MCQs: {question, options[A,B,C,D], correct_index}.
     For short-answer: {question, difficulty (easy/medium/hard)}.
     Base questions on this context: [context_chunks].
     Each question should be grounded in the lecture content."
Groq LLM API [groq-sdk]
  ↓ (inference: 2-5 seconds)
Groq Response (JSON):
{
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "Which of the following is...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 1,
      "max_points": 2,
      "source_evidence": "As explained in the lecture: ..."
    },
    // ... more questions
  ]
}

FastAPI
  ↓ (save to MongoDB: quizzes collection)
MongoDB [quizzes collection]
  ↓ (insert {quiz_id, quiz_title, subject_id, teacher_id, questions[], is_published: false})
  ↓ (HTTP 200 with quiz_id)
Teacher Browser [Assessment Hub]
  ✓ Display "Assessment created!"
  ✓ Show all questions with options, correct answers hidden
  ✓ Buttons: "Edit", "Publish", "Preview", "Delete"
```

**Publish Assessment**:
```
Teacher clicks "Publish"
  ↓ (HTTPS PATCH /assessments/{quiz_id}/publish)
FastAPI Backend
  ↓ (update MongoDB: is_published = true, published_at = now())
MongoDB [quizzes collection]
  ✓ Update document
  ↓ (HTTP 200)
Teacher Browser
  ✓ Notification: "Assessment published! Students can now access it."
  ✓ Assessment now visible in student dashboard
```

**View Student Submissions**:
```
Teacher clicks "View Results" on published assessment
  ↓ (HTTPS GET /assessments/{quiz_id}/results)
FastAPI Backend
  ↓ (query MongoDB: {assessment_id: quiz_id})
MongoDB [quiz_submissions collection]
  ↓ (retrieve all submissions for this assessment)
  ↓ (aggregate: count, average_score, grade_distribution)
  ↓ (HTTP 200 with submissions[])
Teacher Browser [Results Dashboard]
  ✓ Display:
    - Class Statistics: avg score, median, std dev
    - Grade Distribution: pie chart
    - Student List:
      | Student Name | Score | Percentage | Grade | Submitted At | View Details |
    - Per-Question Statistics:
      | Question | % Correct (MCQ) | Avg Score (Short-Ans) | Common Mistakes |
```

---

## Teacher Flow Diagram Drawing Instructions

### Canvas & Layout

1. **Divide canvas into 3 columns** (left to right):
   - **Column 1: Pre-Session** (authentication, setup)
   - **Column 2: Live Session** (teaching, interaction)
   - **Column 3: Post-Session** (analysis, assessment)

2. **Draw actor**: "Teacher" on far left (outside system)

3. **Draw major screens/components**:
   - **Login Page** (top-left)
   - **Dashboard / Subject Selection** (left-middle)
   - **Live Session View** (center, largest)
   - **Session History** (bottom-left)
   - **Analysis & Assessment** (right side)

4. **Draw data flows** (arrows with labels):

| Step | From | To | Data |
|:---|:---|:---|:---|
| 1 | Teacher | Login | email, password |
| 2 | Login | Backend | POST /auth/login |
| 3 | Backend | Database | verify credentials |
| 4 | Database | Backend | JWT token |
| 5 | Backend | Login | auth success |
| 6 | Teacher | Dashboard | session creation form |
| 7 | Dashboard | Backend | POST /sessions/create |
| 8 | Backend | Database | session doc created |
| 9 | Database | Backend | session_id |
| 10 | Backend | Teacher | redirect to live session |
| 11 | Teacher | Microphone | "Start Recording" |
| 12 | Microphone | Browser | MediaStream (audio) |
| 13 | Browser | Audio Service | WebSocket: PCM frames |
| 14 | Audio Service | Whisper | inference |
| 15 | Whisper | Audio Service | transcribed text |
| 16 | Audio Service | Backend | transcript event |
| 17 | Backend | Database | persist transcript |
| 18 | Database | Backend | OK |
| 19 | Backend | Audio Service | broadcast |
| 20 | Audio Service | Teacher | display transcript |
| 21 | Teacher | Upload | PDF file selection |
| 22 | Upload | Backend | POST /materials/upload |
| 23 | Backend | Qdrant | embed & index |
| 24 | Qdrant | Backend | OK |
| 25 | Backend | Database | material metadata |
| 26 | Backend | Teacher | context broadcast |
| 27 | Teacher | Backend | POST /sessions/{id}/end |
| 28 | Backend | Background Tasks | trigger processing |
| 29 | Background Tasks | LLM | summarize, extract, generate |
| 30 | LLM | Backend | artifacts (summary, concepts, etc) |
| 31 | Backend | Database | update session |
| 32 | Backend | Teacher | analysis ready notification |
| 33 | Teacher | Analysis Page | view session analytics |
| 34 | Analysis Page | Backend | GET /sessions/{id} |
| 35 | Backend | Database | full session doc |
| 36 | Database | Backend | session data |
| 37 | Backend | Teacher | display analysis |

5. **Add data store symbols** (cylinder shapes):
   - MongoDB (center-bottom)
   - Qdrant (right-bottom)
   - File Storage (right-bottom)

6. **Add external services** (outside system):
   - Groq LLM (top-right, connected to background tasks)
   - Audio Service (top-center)
   - YouTube API (right, connected to resource discovery)
   - Edge-TTS (right, connected to audio generation)

---

# PART 4: STUDENT FLOW DIAGRAM

## Overview
This diagram traces a complete student lifecycle: session enrollment → live attendance → transcript viewing → assessment participation → result review → content exploration.

## Phase 1: Session Discovery & Enrollment

### 1.1 Student Login & Dashboard
**Same as Teacher**: See "Teacher Flow Diagram - Phase 1.1"

**Additional Step**: Student Cohort Assignment  
**Stored in**: `student_timetables` collection
```json
{
  "department": "Computer Science",
  "year": "2",
  "section": "A",
  "academic_year": "2025-2026",
  "enrolled_subjects": [
    {
      "subject_id": ObjectId("507f1f77bcf86cd799439011"),
      "subject_name": "Machine Learning Basics",
      "faculty_name": "Dr. Sharma"
    }
  ]
}
```

### 1.2 Session Discovery & Live Attendance
**Trigger**: Session starts and becomes "active" in MongoDB  
**Student sees**: "Live Sessions Available"

**Technical Flow**:
```
Teacher initiates session (POST /sessions/create)
  ↓ (MongoDB: status = "active")
  ↓ (fastAPI broadcasts to all subject-enrolled students)
Student Dashboard [SessionViewPage.jsx]
  ↓ (polling interval: GET /live-sessions every 5 seconds)
  ↓ (filters: subject_id in enrolled_subjects)
Payload:
GET /live-sessions?subject_id=507f1f77bcf86cd799439011

FastAPI Backend [app.py]
  ↓ (query MongoDB: {subject_id, status: "active"})
MongoDB [sessions collection]
  ↓ (return active sessions for subject)
  ↓ (HTTP 200 with [{session_id, title, teacher_name, participant_count}])
Student Browser
  ✓ Display notification: "New live session: 'Intro to ML - Week 5' (24 students)"
  ✓ "Join" button visible

Student clicks "Join"
  ↓ (navigate to /student/session/{session_id})
  ↓ (HTTPS POST /sessions/{session_id}/join)
FastAPI Backend
  ↓ (add student to session: update participants list)
  ↓ (HTTP 200)
Student Browser [SessionViewPage.jsx]
  ✓ Initialize WebSocket connection
  ↓ (WebSocket ws://localhost:8765)
  ↓ (send {type: "subscribe", session_id})
  ↓ (send {type: "join", session_id, role: "student", name, email})
Audio Service [server.py]
  ↓ (register student in active_viewers[session_id])
  ↓ (increment participant_count)
  ↓ (broadcast {type: "participant_count", count} to all)
```

---

## Phase 2: Live Session Attendance

### 2.1 Real-Time Transcript Reception
**Frequency**: Every 2-4 seconds (speech segmentation)

**Technical Flow**:
```
Audio Service broadcasts transcript event:
  ↓ (WebSocket: {type: "final", text, start, duration, session_id})
Student Browser [SessionViewPage.jsx: ws.onmessage]
  ↓ (parse JSON message)
  ↓ (if data.type === "final"):
    ├─ setPartialText("")  // Clear partial
    ├─ setTranscripts(prev => [...prev, data])
    └─ re-render TranscriptViewer
  ✓ Student sees: "Welcome to today's lecture on machine learning"
  ✓ Transcript auto-scrolls to latest segment

Partial transcript (optional):
  ↓ (WebSocket: {type: "partial", text})
  ↓ (setPartialText(data.text))
  ✓ Display in faded color as placeholder until final
```

**Transcript Viewer Component**:
```
<TranscriptViewer transcripts={transcripts} partialText={partialText} />
  ↓ (render list of transcript segments)
  ↓ (each segment: {text, start, duration, timestamp})
  ↓ (auto-scroll to most recent)
  ✓ Display format:
    [10:00:05] Welcome to today's lecture on machine learning
    [10:00:08] We will cover supervised and unsupervised learning
    [10:00:12] <fading> Let me start with the basic...  (partial)
```

---

### 2.2 Material Synchronization (Context Sync)
**Frequency**: Real-time when teacher updates  
**Data Type**: PDF pages, slides, screen sharing

**Technical Flow**:
```
Teacher uploads material or navigates to next page:
  ↓ (send WebSocket: {type: "context_update", context: {type: "pdf", url, page: 1, title}})
Audio Service
  ↓ (broadcast to all students in session)
Student Browser [SessionViewPage.jsx: ws.onmessage]
  ↓ (if data.type === "context_update"):
    ├─ setCurrentContext(data.context)
    ├─ setActiveTab("material")  // Switch to material viewer
    └─ re-render MaterialViewer
  ✓ Display synchronized material in viewport
  ✓ Show current page number and total pages

Student can scroll through material:
  ↓ (but always syncs back to teacher's current page)
  ↓ (if teacher updates page: auto-scroll to match)
```

**Context Types**:
1. **PDF Material**: `{type: "pdf", url: "/storage/materials/xyz.pdf", page: 1, title: "Slide Deck"}`
2. **Screen Sharing**: `{type: "screen", url: "data:image/jpeg;base64,...", frame_number: 123}`
3. **Webcam**: `{type: "webcam", url: "data:image/jpeg;base64,...", timestamp}`
4. **None**: `{type: "none"}` (material cleared)

---

### 2.3 Pop Quiz Reception & Participation
**Trigger**: Teacher broadcasts pop quiz  
**Frequency**: On-demand (0-5 quizzes per session)

**Technical Flow**:
```
Teacher clicks "Launch Pop Quiz" (see Teacher Flow Diagram - Section 2.4)
  ↓ (FastAPI broadcasts: {type: "pop_quiz", questions, duration})
Student Browser [SessionViewPage.jsx: ws.onmessage]
  ↓ (if data.type === "pop_quiz"):
    ├─ setActiveQuiz(data)
    ├─ setQuizMode(true)
    ├─ setQuizCountdown(data.duration)  // 60 seconds
    └─ trigger auto-TTS: "Pop quiz starting now: ..."

  ✓ Modal overlay appears:
    ┌─────────────────────────────┐
    │ POP QUIZ - 59 seconds       │
    ├─────────────────────────────┤
    │ Q1. What is the definition..│
    │  ○ Option A                 │
    │  ◉ Option B (selected)      │
    │  ○ Option C                 │
    │  ○ Option D                 │
    ├─────────────────────────────┤
    │ [Submit Answer]  [Skip]     │
    └─────────────────────────────┘

Student selects answer and clicks "Submit":
  ↓ (HTTP POST /pop-quiz/{session_id}/submit)
Payload:
{
  "session_id": "abc123...",
  "answers": [
    {question_id: "q1", answer: 1},  // selected option index
    // ... other answers
  ]
}

FastAPI Backend [assessment_engine.py:grade_pop_quiz]
  ├─→ For MCQs: immediate auto-grade
  │    ↓ (check answer against correct_index)
  │    ✓ score = answer === correct_index ? points : 0
  │
  ├─→ Result: {score, max_score, percentage, grade_letter}
  │
  └─→ (HTTP 200 with results)

Student Browser
  ✓ Display: "Quiz Results: 3/4 (75%) - B Grade"
  ✓ Show per-question feedback:
    Q1: ✓ Correct! "Option B demonstrates..."
    Q2: ✗ Incorrect. "The correct answer is Option C because..."
```

**Countdown Timer**:
```
useEffect(() => {
  const interval = setInterval(() => {
    setQuizCountdown(prev => {
      if (prev <= 1) {
        clearInterval(interval);
        setQuizMode(false);  // Close quiz
        // Auto-submit if not already submitted
      }
      return prev - 1;
    });
  }, 1000);
}, []);
```

---

### 2.4 Engagement Features (Optional)
**Purpose**: Foster interaction during session

**Raise Hand**:
```
Student clicks "Raise Hand" button
  ↓ (WebSocket: {type: "raise_hand", session_id, student_id, name})
Audio Service
  ↓ (broadcast to teacher and all students)
Teacher Dashboard
  ✓ Display: "Student: John raised their hand"
Student Dashboard
  ✓ Display: "✋ You raised your hand" (status)
```

**Emoji Reactions**:
```
Student clicks emoji picker → selects 😊
  ↓ (WebSocket: {type: "reaction", emoji: "😊", student_id})
Audio Service
  ↓ (broadcast to all)
All Dashboards
  ✓ Floating emoji animation on screen (3-second lifetime)
```

**Post Doubt / Question**:
```
Student types doubt in chat
  ↓ (WebSocket: {type: "new_doubt", text, student_id, name})
Audio Service
  ↓ (broadcast to all)
All Dashboards [Doubts Panel]
  ✓ Display: "[Student Name]: What about edge cases in binary search?"
  ✓ Timestamp: "10:05 AM"
```

---

## Phase 3: Post-Session Content Access

### 3.1 Session History & Analysis
**Trigger**: Student navigates "History" tab  
**Endpoint**: `GET /students/sessions`

**Technical Flow**:
```
Student clicks "History"
  ↓ (HTTPS GET /students/sessions)
Query Parameters:
{
  "subject_id": "507f1f77bcf86cd799439011",  // optional
  "limit": 20,
  "offset": 0
}

FastAPI Backend [app.py]
  ↓ (authenticate student via JWT)
  ↓ (get student cohort from JWT or student_timetables)
  ↓ (query MongoDB: {subject_id in enrolled_subjects, status: "finished"})
MongoDB [sessions collection]
  ↓ (return last 20 sessions, sorted by started_at DESC)
  ↓ (projection: {title, summary_preview, started_at, participant_count, audio_summary_url, pdf_report_url})
  ↓ (HTTP 200)
Student Browser [Session History]
  ✓ Display table:
    | Session | Date | Summary Preview | Artifacts |
    |---|---|---|---|
    | Intro to ML - Week 5 | Apr 13 | This session covered the fundamentals of... | 🎙️ 📄 |
    | Linear Regression | Apr 10 | Students learned how to... | 🎙️ 📄 |

Student clicks on session → "View Analysis"
  ↓ (navigate to /student/session/{session_id}/analysis)
  ↓ (HTTPS GET /sessions/{session_id})
FastAPI Backend
  ↓ (retrieve full session document)
MongoDB [sessions collection]
  ↓ (HTTP 200)
Student Browser [Session Analysis Page]
  ✓ Display sections:
    1. Executive Summary (text)
    2. Key Concepts (bullet list) → clickable for Q&A
    3. Session Difficulty & Type badges
    4. Full Transcript (searchable, timestamped)
    5. Audio Podcast Player (HTML5):
       <audio controls>
         <source src="/storage/audio/{session_id}.mp3" type="audio/mpeg">
       </audio>
    6. PDF Report (download button)
    7. Related Resources (video cards):
       ┌──────────────────────┐
       │ [Thumbnail Image]    │
       │ Video Title          │
       │ Channel Name         │
       │ Duration: 12 min     │
       │ [Watch on YouTube]   │
       └──────────────────────┘
```

---

### 3.2 AI Classroom Assistant (RAG Q&A)
**Purpose**: Semantic search over indexed lecture content  
**Trigger**: Student clicks on a concept or types a question

**Technical Flow**:
```
Student reads "Machine Learning" concept in session analysis
  ↓ (clicks concept name)
  ↓ OR (student types in Q&A search box: "What is feature scaling?")
  ↓ (HTTPS POST /qa/ask)
Payload:
{
  "question": "What is feature scaling and why is it important?",
  "session_id": "abc123...",
  "context_limit": 3  // top-3 chunks
}

FastAPI Backend [assessment_engine.py or qa_handler]
  ↓ (embed question using Sentence-Transformers)
  ↓ (vector = model.encode(question))
Qdrant Vector Store
  ↓ (search: query_vector, filter: {session_id}, limit: 3)
  ↓ (return: [{text, similarity_score}, {text, similarity_score}, ...])
Qdrant → FastAPI
  ↓ (concat retrieved chunks as "context")
  ↓ (send to Groq LLM with system prompt: "Answer the following question based on the provided context from the lecture...")
Groq LLM API
  ↓ (inference: 1-3 seconds)
Groq Response:
{
  "answer": "Feature scaling is the process of normalizing or standardizing the range of independent variables or features of a data set. As mentioned in the lecture: 'Machines learning algorithms are sensitive to the scale of features...' It's important because many ML algorithms (e.g., KNN, SVM) rely on distance metrics.",
  "citations": [
    {text: "original chunk from lecture", similarity: 0.92},
    {text: "related concept from lecture", similarity: 0.85}
  ]
}

FastAPI
  ↓ (HTTP 200)
Student Browser [Q&A Results]
  ✓ Display answer with in-line citations:
    "Feature scaling is the process of normalizing... As mentioned in the lecture: 
     'Machines learning algorithms are sensitive to the scale of features...'
     It's important because many ML algorithms rely on distance metrics."
  ✓ Show source chunks with links to transcript timestamps
  ✓ Button: "Show in Transcript" (jump to relevant segment)
```

**Conversation History** (optional):
```
Student asks multiple questions in same session
  ↓ (maintain conversation array: [{question, answer, timestamp}, ...])
  ↓ (each question is independent; no chat history sent to LLM)
  ✓ Display as collapsible Q&A list
```

---

### 3.3 Assessment Participation
**Purpose**: Complete published quizzes, get AI-graded feedback

**Discovery & Access**:
```
Student navigates "Assessments" tab
  ↓ (HTTPS GET /assessments)
Query:
{
  "subject_id": "507f1f77bcf86cd799439011",
  "status": "published",
  "limit": 10
}

FastAPI Backend [app.py]
  ↓ (query MongoDB: {subject_id, is_published: true})
MongoDB [quizzes collection]
  ↓ (return list of published assessments)
  ↓ (HTTP 200)
Student Browser [Assessments Page]
  ✓ Display cards:
    ┌─────────────────────────────┐
    │ Unit 3 Assessment           │
    │ 10 Questions | 15 minutes   │
    │ Based on: 3 sessions        │
    │ [Attempt] [View Results]    │
    └─────────────────────────────┘
```

**Quiz Attempt**:
```
Student clicks "Attempt"
  ↓ (navigate to /assessments/{quiz_id}/attempt)
  ↓ (HTTPS GET /assessments/{quiz_id})
FastAPI Backend
  ↓ (retrieve quiz document)
MongoDB [quizzes collection]
  ↓ (return: {questions[], title, time_limit_minutes})
  ↓ (HTTP 200)
Student Browser [Quiz Interface]
  ✓ Display:
    - Question counter: "Question 1 of 10"
    - Timer: 15 minutes remaining (countdown)
    - Question text + type (MCQ or short-answer)
    - Input/selection area
    - Navigation: [Previous] [Next] [Submit]
  
  ✓ For MCQ:
    ○ Option A
    ◉ Option B (selected)
    ○ Option C
    ○ Option D
    
  ✓ For short-answer:
    [Text area for response]
    
Student completes all questions and clicks "Submit":
  ↓ (HTTPS POST /assessments/{quiz_id}/submit)
Payload:
{
  "quiz_id": "507f1f77bcf86cd799439011",
  "answers": [
    {question_id: "q1", answer: 2},  // MCQ: option index
    {question_id: "q2", answer: "Student's typed response..."},  // short-answer
    // ... more answers
  ]
}

FastAPI Backend [assessment_engine.py:grade_student_submission]
  ├─→ For each MCQ:
  │    ↓ (check answer === correct_index)
  │    ✓ score = points if correct, else 0
  │
  └─→ For each short-answer:
       ↓ (vector search: retrieve top-3 chunks relevant to question)
Qdrant
  ↓ (return relevant context chunks)
       ↓ (send to Groq LLM: student_answer + model_answer + context + rubric)
Groq LLM
  ↓ (grade with reasoning)
Groq Response:
{
  "score": 4,
  "max_points": 5,
  "grade_letter": "A",
  "feedback": "Excellent explanation of the concept...",
  "teacher_quote": "As the lecture mentioned: 'Feature scaling is important because...'"
}

FastAPI
  ↓ (save to MongoDB: quiz_submissions collection)
MongoDB [quiz_submissions collection]
  ↓ (insert {assessment_id, student_id, answers[], grading_results[], total_score, percentage, status: "graded"})
  ↓ (HTTP 200 with results)
Student Browser [Quiz Results Page]
  ✓ Display:
    - "Quiz Submitted Successfully!"
    - Overall Score: 45/50 (90%)
    - Grade: A
    - Timestamp: "Apr 13, 2025 10:30 AM"
    
  ✓ Per-question breakdown:
    Q1: ✓ Correct [2/2 points]
        "Option B is correct because..."
        
    Q2: ✓ Correct [5/5 points]
        "Excellent explanation! As the lecture mentioned: 'Feature scaling is important because...'"
        
    Q3: ✗ Incorrect [0/3 points]
        "Your answer: 'Overfitting is when...'
         Expected: 'Overfitting occurs when a model memorizes training data...'"
    
    Q4: Partial [4/5 points]
        "Good attempt! You covered the main concepts but missed one key detail: ..."
  
  ✓ Button: "Review Material" (jump to session analysis)
```

**View All Results**:
```
Student clicks "View Results" on assessment card
  ↓ (navigate to /assessments/{quiz_id}/results)
  ↓ (HTTPS GET /assessments/{quiz_id}/results)
FastAPI Backend
  ↓ (query MongoDB: {assessment_id: quiz_id, student_id: current_student})
MongoDB [quiz_submissions collection]
  ↓ (retrieve all submissions by this student for this quiz)
  ↓ (HTTP 200)
Student Browser [Results History]
  ✓ Display:
    | Attempt | Date | Score | Grade | Status |
    |---|---|---|---|---|
    | 1st Attempt | Apr 13, 10:30 AM | 45/50 (90%) | A | Graded |
    | 2nd Attempt | Apr 14, 2:15 PM | 48/50 (96%) | A+ | Graded |
    
  ✓ Click any attempt to review details
```

---

### 3.4 Performance Analytics & Insights
**Purpose**: Student self-assessment and learning tracking

**Technical Flow** (Optional Feature):
```
Student navigates "Analytics" tab
  ↓ (HTTPS GET /students/analytics)
Query:
{
  "subject_id": "507f1f77bcf86cd799439011"
}

FastAPI Backend
  ↓ (aggregate student quiz submissions by subject)
  ↓ (compute: total quizzes, average score, grade distribution, concept strengths/weaknesses)
MongoDB [quiz_submissions collection]
  ↓ (groupBy: {student_id, subject_id})
  ↓ (pipeline aggregation: $avg, $sum, $group)
  ↓ (HTTP 200)
Student Browser [Analytics Dashboard]
  ✓ Display:
    - Overall Score Trend (line chart): 70% → 75% → 82% → 90%
    - Grade Distribution (pie chart): A: 30%, B: 50%, C: 20%
    - Concept Mastery (heat map):
      Machine Learning: ████████ 85%
      Linear Regression: ██████ 70%
      Overfitting: ███████████ 95%
      Regularization: ████ 50%
    - Study Time: "5 hours this week"
    - Recommendations: "Review: Regularization concepts"
```

---

## Student Flow Diagram Drawing Instructions

### Canvas & Layout

1. **Divide canvas into 3 columns** (left to right):
   - **Column 1: Discovery & Live** (find session, attend)
   - **Column 2: Live Session** (transcript, materials, quiz)
   - **Column 3: Post-Session** (history, assessment, Q&A)

2. **Draw actor**: "Student" on far left (outside system)

3. **Draw major screens/components**:
   - **Login Page** (top-left, shared with teacher)
   - **Dashboard / Live Sessions** (left-middle)
   - **Live Session View** (center, largest):
     - Transcript viewer (top)
     - Material sync (middle)
     - Engagement buttons (bottom)
   - **Session History** (bottom-left)
   - **Assessment Hub** (bottom-right)
   - **Q&A Interface** (right-top)
   - **Results & Analytics** (right-middle)

4. **Draw data flows** (arrows with labels):

| Step | From | To | Data | Frequency |
|:---|:---|:---|:---|:---|
| 1 | Student | Login | credentials | one-time |
| 2 | Backend | Student | JWT token | one-time |
| 3 | Student | Dashboard | click "Join Session" | on-demand |
| 4 | Dashboard | WebSocket | {type: "subscribe"} | once per session |
| 5 | Audio Service | Student | {type: "final", text} | every 2-4 sec |
| 6 | Student | Transcript Viewer | display text | real-time |
| 7 | Teacher | Audio Service | context update | on material change |
| 8 | Audio Service | Student | {type: "context_update"} | real-time |
| 9 | Student | Material Viewer | display PDF/screen | real-time |
| 10 | Teacher | Audio Service | pop quiz broadcast | on-demand |
| 11 | Audio Service | Student | {type: "pop_quiz", questions} | on-demand |
| 12 | Student | Backend | POST quiz answers | on-demand |
| 13 | Backend | Qdrant | embed question | on-demand |
| 14 | Qdrant | Backend | retrieve context | on-demand |
| 15 | Backend | LLM | grade request | on-demand |
| 16 | LLM | Backend | grade result | 1-3 sec |
| 17 | Backend | Student | quiz results | instant |
| 18 | Student | Backend | GET /sessions (history) | on-demand |
| 19 | Backend | Database | query sessions | on-demand |
| 20 | Database | Backend | sessions list | on-demand |
| 21 | Backend | Student | display history | instant |
| 22 | Student | Backend | POST /qa/ask | on-demand |
| 23 | Backend | Qdrant | search | <1 sec |
| 24 | Qdrant | Backend | chunks | <1 sec |
| 25 | Backend | LLM | answer request | 1-3 sec |
| 26 | LLM | Backend | answer | 1-3 sec |
| 27 | Backend | Student | display answer | instant |
| 28 | Student | Backend | GET /assessments | on-demand |
| 29 | Backend | Database | published quizzes | on-demand |
| 30 | Database | Backend | quiz list | on-demand |
| 31 | Backend | Student | display assessments | instant |
| 32 | Student | Backend | POST /assessments/{id}/submit | on-demand |
| 33 | Backend | Qdrant | retrieve context (short-ans) | on-demand |
| 34 | Qdrant | Backend | context chunks | <1 sec |
| 35 | Backend | LLM | grade short-answer | per answer |
| 36 | LLM | Backend | grade result | 1-3 sec |
| 37 | Backend | Database | save submission | instant |
| 38 | Backend | Student | display results | instant |

---

# PART 5: OVERALL SYSTEM FLOW DIAGRAM

## Complete Classroom Lifecycle (Integrated View)

### Temporal Sequence: Before, During, After

```
┌─────────────────────────────────────────────────────────────────┐
│ BEFORE SESSION (Planning & Preparation)                         │
├─────────────────────────────────────────────────────────────────┤
│ Teacher:                                                        │
│  1. Logs in → JWT token issued                                │
│  2. Selects subject & creates session                          │
│  3. Session document created in MongoDB (status: "active")     │
│  4. [Optional] Uploads initial materials → indexed to Qdrant   │
│                                                                 │
│ Students:                                                       │
│  1. Enrolled students notified: "Live session available"       │
│  2. Can view session title & teacher name                      │
│  3. Waiting for teacher to start audio capture                 │
└─────────────────────────────────────────────────────────────────┘
         ↓ (Teacher clicks "Start Recording")
┌─────────────────────────────────────────────────────────────────┐
│ DURING SESSION (Live Interaction)                               │
├─────────────────────────────────────────────────────────────────┤
│ Parallel Processes (every 100-500ms):                           │
│                                                                 │
│ [AUDIO PIPELINE]                                                │
│  Teacher speaks → Microphone → Browser MediaStream             │
│    → ScriptProcessor → PCM frames @ 16kHz                      │
│    → WebSocket to Audio Service                                │
│    → VAD + SpeechSegmenter                                      │
│    → Whisper inference (small.en)                              │
│    → Transcript event JSON                                      │
│    → FastAPI → MongoDB ($push)                                 │
│    → WebSocket broadcast to Students                           │
│    → Student displays transcript                                │
│                                                                 │
│ [REAL-TIME CONTEXT SYNC]                                        │
│  Teacher shares material → Upload to Backend                    │
│    → Extract & embed (Qdrant)                                   │
│    → WebSocket context_update to Students                       │
│    → Students see synchronized material                         │
│                                                                 │
│ [STUDENT ENGAGEMENT]                                            │
│  Students can:                                                  │
│    - View live transcript (read-only)                           │
│    - See synchronized materials                                 │
│    - Respond to pop quizzes (if teacher launches)               │
│    - Raise hands / react with emoji                             │
│    - Post doubts/questions                                      │
│                                                                 │
│ [TEACHER MONITORING]                                            │
│  Teacher dashboard shows:                                       │
│    - Live transcripts (formatted)                               │
│    - Participant count & names                                  │
│    - Student reactions / doubts                                 │
│    - Quiz response summary (if pop quiz active)                 │
└─────────────────────────────────────────────────────────────────┘
         ↓ (Teacher clicks "End Session")
┌─────────────────────────────────────────────────────────────────┐
│ POST-SESSION (Async Processing & Content Distribution)          │
├─────────────────────────────────────────────────────────────────┤
│ Background Tasks (run in parallel, 20-30 seconds total):         │
│                                                                 │
│ Task 1: Transcript Indexing (5-15 sec)                          │
│  - Chunk transcript: 500-char segments, 100-char overlap        │
│  - Embed: Sentence-Transformers (384-dim vectors)              │
│  - Upsert to Qdrant (classroom_knowledge collection)            │
│  - Mark: is_indexed = true in MongoDB                           │
│                                                                 │
│ Task 2: Summarization (8-10 sec)                                │
│  - Send transcript to Groq LLM (4 parallel prompts)             │
│  - Receive: summary, concepts, type, difficulty                │
│  - Update MongoDB: summary, key_concepts, session_type,         │
│    difficulty_level                                             │
│                                                                 │
│ Task 3: Podcast Audio Generation (15-25 sec)                    │
│  - Generate podcast script from summary (Groq LLM)              │
│  - Synthesize to MP3 (edge-tts, Indian English female)          │
│  - Save to: backend/storage/audio/{session_id}.mp3              │
│  - Update MongoDB: audio_summary_url                            │
│                                                                 │
│ Task 4: PDF Report Generation (3-5 sec)                         │
│  - Build PDF from summary, concepts, questions (FPDF2)          │
│  - Save to: backend/storage/reports/{session_id}.pdf            │
│  - Update MongoDB: pdf_report_url                               │
│                                                                 │
│ Task 5: Resource Discovery (5-15 sec)                           │
│  - Query YouTube/web for videos related to extracted concepts   │
│  - Save to MongoDB: concept_resources collection                │
│                                                                 │
│ Final: Update MongoDB status: "active" → "finished"             │
│        Broadcast WebSocket to all: "session_finalized"          │
│        Notify Teacher: "Analysis ready"                         │
└─────────────────────────────────────────────────────────────────┘
         ↓ (Teacher navigates to "Session Analysis" page)
┌─────────────────────────────────────────────────────────────────┐
│ CONTENT CONSUMPTION PHASE (Days/Weeks After Session)            │
├─────────────────────────────────────────────────────────────────┤
│ Students:                                                       │
│  1. Browse session history → click session                      │
│  2. View analysis page:                                         │
│     - Executive summary (text)                                  │
│     - Key concepts (list) → clickable                           │
│     - Full transcript (searchable)                              │
│     - Audio podcast player                                      │
│     - PDF report download                                       │
│     - Related resources (videos)                                │
│  3. Ask questions via RAG Q&A:                                  │
│     - Type question → embed → Qdrant search                     │
│     - Groq LLM answer (with citations)                          │
│  4. Attempt published assessments:                              │
│     - Teacher publishes quiz in "Assessment Hub"                │
│     - Student submits answers                                   │
│     - Auto-grade MCQ, LLM-grade short-answer                    │
│     - View detailed feedback + teacher quotes                   │
│                                                                 │
│ Teacher:                                                        │
│  1. View session in "Session History"                           │
│  2. Download PDF report                                         │
│  3. Review student quiz submissions                             │
│  4. Create new assessments from session content                 │
│  5. Curate & publish resources                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cross-Cutting Concerns (System-Wide)

### 1. Authentication & Authorization (JWT-based RBAC)
```
Every Request:
  ↓ (browser attaches Authorization: Bearer <JWT_token>)
  ↓ (FastAPI dependency: get_current_user)
  ↓ (decode JWT → extract {sub: email, role, exp})
  ↓ (verify exp not expired)
  ↓ (query MongoDB users: find by email)
  ↓ (return User object with role field)
  ↓ (FastAPI route decorator: @require_role("teacher"|"student"))
  ✓ Grant or deny access based on role
```

**Endpoints by Role**:
- **Teacher Only**: `/sessions/create`, `/materials/upload`, `/assessments/generate`, `/pop-quiz/broadcast`, `/sessions/{id}/end`
- **Student Only**: `/assessments/{id}/attempt`, `/qa/ask`
- **Both**: `/sessions/{id}` (view), `/sessions/{id}/join`, WebSocket connections

---

### 2. WebSocket Real-Time Communication
```
Connections:
  - Teacher Browser → Audio Service (ws://host:8765)
  - Students → Audio Service (ws://host:8765)
  - Teacher Dashboard → Audio Service (optional, for monitoring)

Message Types (JSON):
  - Subscription: {type: "subscribe", session_id}
  - Join/Leave: {type: "join"|"leave", session_id, role, name}
  - Transcripts: {type: "partial"|"final", text, start, duration}
  - Context: {type: "context_update", context: {...}}
  - Quiz: {type: "pop_quiz", questions, duration}
  - Engagement: {type: "raise_hand"|"reaction"|"new_doubt", ...}
  - Participant Count: {type: "participant_count", count, participants}
  - Control: {type: "pause"|"resume", session_id}
  - Session End: {type: "session_finalized", session_id}

Broadcasting Logic:
  - Audio Service maintains session_stores[session_id] registry
  - On message from teacher/student, broadcast to all connected clients in same session
  - Filters applied: role-based (e.g., participant_count only broadcast once per 30 sec)
```

---

### 3. Data Consistency & Reliability

**MongoDB Write Patterns**:
- Transcripts: `$push` (append-only array, atomic)
- Status updates: atomic field replacement
- Post-processing: `$set` (overwrite computed fields)
- Retry logic: Motor async driver with connection pooling

**Qdrant Integrity**:
- Upsert (idempotent): if vector.id exists, replace; else insert
- Filtered search: always filtered by session_id to prevent cross-contamination
- Backup: snapshot files included in deployment

**File Storage**:
- Atomic write: save to temp file, then rename (atomic FS operation)
- Unique naming: {session_id}_{timestamp} or UUID to avoid collisions
- Cleanup: optional TTL-based deletion (configurable retention)

---

### 4. Error Handling & Fallback

**Audio Service Failures**:
- If Whisper model unavailable: fallback to browser SpeechRecognition (lower quality)
- If VAD fails: process all frames (no silence filtering)
- If connection drops: attempt reconnection every 5 seconds

**Backend Failures**:
- MongoDB unavailable: queue transcript events in memory, retry on reconnection
- Qdrant unavailable: log error, continue without RAG (quizzes generated from transcript only)
- Groq LLM timeout: use cached templates, fallback to heuristic summaries

**Student Connection Loss**:
- WebSocket close: student auto-prompted to rejoin
- Transcript polling fallback: if WebSocket fails, poll REST API every 5 seconds
- Partial data loss acceptable: student can reload transcript from MongoDB after reconnection

---

### 5. Performance & Scalability Constraints

**Concurrent Users**:
- Single session: up to 100-200 students (WebSocket limit dependent on server resources)
- System load: depends on transcript indexing parallelization
- LLM concurrency: batched requests (up to 5 concurrent to Groq)

**Latency SLAs**:
- Transcript broadcast: < 1 second (target: 700ms)
- Material sync: < 500ms
- Quiz generation: 2-5 seconds
- Answer grading: 1-3 seconds
- Q&A response: 2-5 seconds

**Data Volume**:
- Typical session: 2000-5000 transcript segments (1-2 hour lecture)
- Qdrant vectors per session: 400-1000 (after chunking)
- Storage per session: ~1 MB transcript + 5-10 MB audio + 100 KB PDF

---

## Overall System Flow Diagram Drawing Instructions

### Canvas & Layout (Large Format Recommended)

1. **Divide canvas into 5 horizontal timeline sections** (top to bottom):
   - **Section 1: Before Session** (planning)
   - **Section 2: During Session - Live Audio** (real-time transcription)
   - **Section 3: During Session - Interaction** (materials, quizzes, engagement)
   - **Section 4: Post-Session - Processing** (async background tasks)
   - **Section 5: Content Consumption** (history, assessment, Q&A)

2. **Draw actors at left edge**:
   - **Teacher** (top-left)
   - **Students** (middle-left)
   - **LLM/External Services** (right side)

3. **Draw major system components** (boxes/rectangles):
   - **Frontend** (browser UIs)
   - **Backend** (FastAPI)
   - **Audio Service** (Whisper)
   - **Databases** (MongoDB, Qdrant)
   - **Storage** (File system)
   - **External** (Groq, YouTube, Edge-TTS)

4. **Draw data flows** with color-coding:
   - **Real-time flows** (solid blue arrows): transcripts, context sync, reactions
   - **On-demand flows** (solid green arrows): material upload, quiz submissions
   - **Async/background flows** (dashed purple arrows): summarization, indexing
   - **Storage operations** (red arrows): MongoDB writes, Qdrant upserts

5. **Add time annotations**:
   - "T+0 sec" (session start)
   - "T+100ms, T+200ms, ..." (real-time events)
   - "T+end" (session end)
   - "T+end+20 sec" (background processing)

6. **Add legend**:
   - Arrow types (solid/dashed)
   - Data types (JSON, binary, images)
   - Protocols (WebSocket, HTTP, REST)
   - Frequency labels (real-time, every 2-4 sec, on-demand, async)

---

## Detailed Component Interaction Matrix

Create a matrix table showing which components interact, communication protocol, and data type:

| Component A | Component B | Protocol | Data Type | Frequency | Latency |
|:---|:---|:---|:---|:---|---:|
| Teacher Browser | Audio Service | WebSocket | Binary PCM | Continuous | ~50ms |
| Audio Service | FastAPI Backend | Internal WS | JSON events | Every 2-4 sec | ~20ms |
| FastAPI Backend | MongoDB | Async HTTP | BSON | Per event | ~50ms |
| FastAPI Backend | Qdrant | Python SDK | Vectors | Batch (end) | ~100ms |
| FastAPI Backend | Student Browser | WebSocket | JSON | Every 2-4 sec | ~50ms |
| Student Browser | FastAPI Backend | HTTPS REST | JSON | On-demand | ~100ms |
| FastAPI Backend | Groq LLM | HTTPS REST | JSON | Post-session | 2-5 sec |
| FastAPI Backend | File Storage | File I/O | Binary | Post-session | 1-2 sec |
| FastAPI Backend | YouTube API | HTTPS REST | JSON | Post-session | 2-5 sec |
| FastAPI Backend | Edge-TTS | Library call | Audio script | Post-session | 10-20 sec |

---

This comprehensive technical specification should enable detailed diagram creation with all components, data flows, timings, and architectural decisions clearly documented.
