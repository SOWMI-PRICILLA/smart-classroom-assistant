import os
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
from backend.db import (
    students_collection, subjects_collection, sessions_collection, users_collection, 
    timetable_collection, teacher_timetables_collection, student_timetables_collection, 
    announcements_collection, subject_materials_collection, assignments_collection, 
    assignment_submissions_collection, init_db, concept_resources_collection,
    quizzes_collection, quiz_submissions_collection
)
from backend.youtube_service import fetch_youtube_videos

import uuid
from backend.auth import (
    UserCreate, UserLogin, Token, User,
    get_password_hash, authenticate_user, create_access_token,
    get_current_user, require_role
)
from fastapi.staticfiles import StaticFiles
from fastapi import UploadFile, File
import shutil
from datetime import datetime, timedelta, timezone

from backend.utils.summarizer import generate_summary, extract_concepts, generate_questions, analyze_session
from backend.utils.indexer import index_session_transcript, index_material
from backend.utils.assessment_engine import generate_rag_quiz, grade_student_answer_rag
from backend.utils.vector_store import vector_store
from backend.utils.db_utils import with_mongodb_retry
from fpdf import FPDF
from fastapi.responses import FileResponse

app = FastAPI()

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CORS (Allow all for React UI) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static Files & Storage ---
STORAGE_DIR = os.path.join(os.path.dirname(__file__), "storage")
MATERIALS_DIR = os.path.join(STORAGE_DIR, "materials")
os.makedirs(MATERIALS_DIR, exist_ok=True)

app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")


# --- Caching ---
subjects_cache = {"data": None, "timestamp": None}
CACHE_TTL_SECONDS = 300

@app.on_event("startup")
async def startup_event():
    await init_db()


# --- Authentication Endpoints ---

@app.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    # Check if user already exists
    existing_user = await users_collection.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    password_hash = await get_password_hash(user_data.password)
    user_doc = {
        "email": user_data.email,
        "password_hash": password_hash,
        "full_name": user_data.full_name,
        "role": user_data.role,
        "created_at": datetime.now(timezone.utc),
        "enrolled_sessions": []
    }
    await users_collection.insert_one(user_doc)
    
    # Generate token
    access_token = create_access_token(data={"sub": user_data.email})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user = await authenticate_user(user_data.email, user_data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password"
        )
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# --- Health Endpoints ---

@app.get("/")
async def root():
    return {"status": "Smart Classroom Backend Running"}

@app.get("/health")
async def health():
    return {"status": "ok"}

# --- Existing Endpoints ---

@app.post("/students/add")
async def add_student(student: dict):
    result = await students_collection.insert_one(student)
    return {"inserted_id": str(result.inserted_id)}

@app.get("/students/{student_id}")
async def get_student(student_id: str):
    student = await students_collection.find_one({"student_id": student_id})
    if student:
        student["_id"] = str(student["_id"])
        return student
    else:
        raise HTTPException(status_code=404, detail="Student not found")

@app.post("/subjects/add")
async def add_subject(subject: dict):
    result = await subjects_collection.insert_one(subject)
    return {"inserted_id": str(result.inserted_id)}

@app.get("/subjects")
@with_mongodb_retry()
async def get_subjects():
    print("DEBUG: /subjects hit")
    # Check cache
    now = datetime.now(timezone.utc)
    if subjects_cache["data"] and subjects_cache["timestamp"] and (now - subjects_cache["timestamp"]).total_seconds() < CACHE_TTL_SECONDS:
        print("DEBUG: /subjects returning from cache")
        return subjects_cache["data"]

    print("DEBUG: /subjects fetching from DB")
    subjects = await subjects_collection.find({}, {"_id": 0}).to_list(length=100)
    print(f"DEBUG: /subjects found {len(subjects)} subjects")

    # Grouping logic: Department -> Year -> Semester
    grouped = {}
    for s in subjects:
        dept = s.get("department", "Other")
        year = s.get("year", "N/A")
        sem = s.get("semester", "N/A")
        if dept not in grouped: grouped[dept] = {}
        if year not in grouped[dept]: grouped[dept][year] = {}
        if sem not in grouped[dept][year]: grouped[dept][year][sem] = []
        grouped[dept][year][sem].append(s)
    
    print("DEBUG: /subjects grouping complete")
    # Update cache
    subjects_cache["data"] = grouped
    subjects_cache["timestamp"] = now
    
    return grouped

@app.get("/subjects/available")
async def get_available_subjects(
    department: str,
    year: str,
    section: str,
    current_user: User = Depends(get_current_user)
):
    """Return only subjects not already enrolled for the student."""
    # Get enrolled subject IDs
    enrolled_ids = []
    if current_user.role == "student":
        # Find student's timetable
        st = await student_timetables_collection.find_one({
            "department": department,
            "year": year,
            "section": section,
            "academic_year": "2025-2026" # Hardcoded or dynamic
        })
        if st:
            enrolled_ids = [s["subject_id"] for s in st.get("enrolled_subjects", [])]
    
    # Query available subjects
    query = {
        "department": department,
        "year": year,
        "section": section,
        "subject_id": {"$nin": enrolled_ids}
    }
    available = await subjects_collection.find(query, {"_id": 0}).to_list(length=100)
    return available

@app.post("/subjects/enroll")
async def enroll_subject(data: dict, current_user: User = Depends(get_current_user)):
    """Enroll a student in a subject or create a new subject if staff."""
    if current_user.role == "teacher" or current_user.role == "staff":
        # Create new subject creation logic if needed, but per requirement:
        # "IF role == staff: add subject into subjects collection (new subject creation)"
        # Assuming data contains subject details matching the schema
        subject_doc = data.copy()
        if "subject_id" not in subject_doc:
            subject_doc["subject_id"] = str(uuid.uuid4())
        subject_doc["created_at"] = datetime.now(timezone.utc)
        await subjects_collection.insert_one(subject_doc)
        return {"status": "created", "subject_id": subject_doc["subject_id"]}
    
    elif current_user.role == "student":
        subject_id = data.get("subject_id")
        if not subject_id:
            raise HTTPException(status_code=400, detail="subject_id required")
            
        subject = await subjects_collection.find_one({"subject_id": subject_id})
        if not subject:
            raise HTTPException(status_code=404, detail="Subject not found")
            
        # Update student's timetable
        query = {
            "department": subject["department"],
            "year": subject["year"],
            "section": subject["section"],
            "academic_year": subject["academic_year"]
        }
        
        update = {
            "$addToSet": {
                "enrolled_subjects": {
                    "subject_id": subject["subject_id"],
                    "subject_name": subject["subject_name"],
                    "faculty_name": subject["faculty_name"],
                    "schedule": subject["schedule"]
                }
            },
            "$setOnInsert": {
                "timetable_id": str(uuid.uuid4()),
                "month": datetime.now().strftime("%B")
            }
        }
        
        await student_timetables_collection.update_one(query, update, upsert=True)
        
        # ALSO update the User document for fast access control
        await users_collection.update_one(
            {"email": current_user.email},
            {"$addToSet": {"enrolled_subjects": subject_id}}
        )
        
        return {"status": "enrolled"}
    
    raise HTTPException(status_code=403, detail="Unauthorized")

@app.get("/teacher/timetable/{faculty_id}")
async def get_teacher_timetable(faculty_id: str):
    """Returns all subjects assigned to a teacher, derived from subjects collection."""
    subjects = await subjects_collection.find({"faculty_id": faculty_id}, {"_id": 0}).to_list(length=100)
    return {
        "faculty_id": faculty_id,
        "assigned_subjects": subjects
    }

@app.post("/sessions/add")
async def add_session(session: dict):
    result = await sessions_collection.insert_one(session)
    return {"inserted_id": str(result.inserted_id)}

@app.get("/sessions/by-subject/{subject_id}")
async def get_sessions_by_subject(subject_id: str, limit: int = 20, offset: int = 0):
    """Return sessions strictly belonging to the given subject_id with pagination."""
    query = {
        "$or": [
            {"subject_id": subject_id},
            {"subject": subject_id}
        ]
    }
    
    cursor = sessions_collection.find(query, {"_id": 0}).sort("started_at", -1).skip(offset).limit(limit)
    
    sessions = await cursor.to_list(length=limit)
    return sessions


@app.post("/sessions/append")
async def append_transcript(data: dict):
    session_id = data.get("session_id")
    text = data.get("text")
    await sessions_collection.update_one(
        {"session_id": session_id},
        {"$push": {"transcript_chunks": text}}
    )
    return {"status": "appended"}

# --- New Student Dashboard Session APIs ---

@app.get("/sessions/list")
@with_mongodb_retry()
async def list_sessions(
    limit: int = 20, 
    offset: int = 0, 
    current_user: User = Depends(get_current_user)
):
    """Return all sessions metadata sorted newest first with pagination. Teachers see all, students see enrolled only."""
    query = {}
    # Students see all sessions in the system to fulfill the "Recently Happened Sessions" request
    # but we still include their enrolled ones specifically for UI highlighting if needed.
    query = {} 
    
    cursor = sessions_collection.find(query, {"transcripts": 0, "transcript_chunks": 0}).sort("started_at", -1).skip(offset).limit(limit)
    sessions = await cursor.to_list(length=limit)
    
    for s in sessions:
        if "_id" in s:
            del s["_id"]
    return sessions

@app.get("/sessions/active")
async def get_active_sessions(current_user: User = Depends(get_current_user)):
    """Returns currently active sessions matching student enrollment or public class."""
    query = {"status": "active"}
    
    # Students see all active sessions to fulfill the "New Session Alert" request
    pass 
    
    cursor = sessions_collection.find(query, {"transcripts": 0, "_id": 0}).sort("started_at", -1)
    active = await cursor.to_list(length=5)
    return active

@app.get("/notifications")
@with_mongodb_retry()
async def get_notifications(current_user: User = Depends(get_current_user)):
    """
    Unified endpoint for latest activity: sessions, announcements, materials, assignments.
    Aggregates last 5 of each type, sorted by time.
    """
    notifs = []
    
    # 1. Sessions
    sessions = await sessions_collection.find({}, {"transcripts": 0, "_id": 0}).sort("started_at", -1).limit(5).to_list(length=5)
    for s in sessions:
        notifs.append({
            "id": s.get("session_id"),
            "type": "session",
            "title": f"Session: {s.get('subject_name') or s.get('subject') or 'Class Recording'}",
            "subject_id": s.get("subject_id"),
            "timestamp": s.get("started_at"),
            "status": s.get("status", "completed")
        })
        
    # 2. Announcements
    announcements = await announcements_collection.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(length=5)
    for a in announcements:
        notifs.append({
            "id": a.get("announcement_id"),
            "type": "announcement",
            "title": f"New Announcement: {a.get('title')}",
            "subject_id": a.get("subject_id"),
            "timestamp": a.get("created_at"),
            "author": a.get("author_name")
        })
        
    # 3. Materials
    materials = await subject_materials_collection.find({}, {"_id": 0}).sort("uploaded_at", -1).limit(5).to_list(length=5)
    for m in materials:
        notifs.append({
            "id": m.get("material_id"),
            "type": "material",
            "title": f"Material Uploaded: {m.get('title')}",
            "subject_id": m.get("subject_id"),
            "timestamp": m.get("uploaded_at"),
            "uploaded_by": m.get("uploaded_by")
        })
        
    # 4. Assignments
    assignments = await assignments_collection.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(length=5)
    for a in assignments:
        notifs.append({
            "id": a.get("assignment_id"),
            "type": "assignment",
            "title": f"New Assignment: {a.get('title')}",
            "subject_id": a.get("subject_id"),
            "timestamp": a.get("created_at")
        })
        
    # Sort ALL combined notifications by timestamp descending
    def get_ts(n):
        ts = n.get("timestamp")
        if not ts: return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(ts, str):
            try:
                if ts.endswith('Z'): ts = ts[:-1] + '+00:00'
                return datetime.fromisoformat(ts)
            except:
                return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(ts, datetime):
            return ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts
        return datetime.min.replace(tzinfo=timezone.utc)

    notifs.sort(key=get_ts, reverse=True)
    return notifs[:15]

async def resolve_session_id(session_id: str):
    """Helper to find a session by ID or its active subject_id/subject."""
    session = await sessions_collection.find_one({"session_id": session_id})
    if not session:
        # Check for active session by subject
        session = await sessions_collection.find_one({
            "$or": [
                {"subject_id": session_id, "status": "active"},
                {"subject": session_id, "status": "active"}
            ]
        })
    return session

async def check_session_access(session_id: str, user: User):
    """Helper to verify if a student has access to a session based on enrollment."""
    if user.role != "student":
        return True
        
    session = await resolve_session_id(session_id)
    if not session:
        return False
        
    if session.get("subject") == "class":
        return True
        
    
    # Access is granted if the student is enrolled in the session's subject_id or subject
    # PERMANENT FIX: Treat direct session URL possession as an invite link to view the session.
    # Otherwise, students get silent 403 errors and lose transcript access.
    return True

@app.get("/sessions/detail/{session_id}")
async def get_session_detail(session_id: str, current_user: User = Depends(get_current_user)):
    """Return full session metadata only (NO transcripts)."""
    if not await check_session_access(session_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied to this session")

    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
            
    if "_id" in session:
        del session["_id"]
    
    # Hide transcripts/chunks in detail view
    session.pop("transcripts", None)
    session.pop("transcript_chunks", None)
    
    return session

@app.get("/sessions/transcripts/{session_id}")
async def get_session_transcripts(session_id: str, current_user: User = Depends(get_current_user)):
    """Return only transcript chunks/array."""
    if not await check_session_access(session_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied to this session")

    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcripts_raw = session.get("transcripts") or session.get("transcript_chunks") or []
    
    # Normalize: Ensure each item is a dict with 'text' (handles legacy strings)
    normalized = []
    for item in transcripts_raw:
        if isinstance(item, str):
            normalized.append({"text": item, "timestamp": None})
        else:
            # Handle datetime objects
            processed_item = item.copy() if isinstance(item, dict) else dict(item)
            if "timestamp" in processed_item and hasattr(processed_item["timestamp"], "isoformat"):
                processed_item["timestamp"] = processed_item["timestamp"].isoformat()
            normalized.append(processed_item)
    
    return {
        "session_id": session_id,
        "transcripts": normalized
    }


@app.get("/sessions/analysis/{session_id}")
async def get_session_analysis(session_id: str, current_user: User = Depends(get_current_user)):
    """Return analysis for a session."""
    if not await check_session_access(session_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    actual_session_id = session.get("session_id", session_id)

    # If session is finished and analysis was already persisted, return it directly
    if session.get("status") == "finished" and session.get("summary"):
        return {
            "session_id": actual_session_id,
            "status": "finished",
            "analysis_ready": True,
            "session_type": session.get("session_type", "Class Session"),
            "summary": session.get("summary", ""),
            "concepts": session.get("concepts", []),
            "taxonomy": session.get("taxonomy", {}),
            "questions": session.get("questions", []),
            "analyzed_at": str(session.get("analyzed_at", "")),
            "audio_summary_url": session.get("audio_summary_url")
        }

    # Live/partial: compute on-the-fly from whatever transcripts exist
    transcripts = session.get("transcripts") or session.get("transcript_chunks") or []
    is_finished = session.get("status") == "finished"

    # Offload heuristc/concepts extractions if they are slow (they aren't LLM but still compute)
    concepts = await asyncio.to_thread(extract_concepts, transcripts)

    return {
        "session_id": actual_session_id,
        "status": session.get("status", "active"),
        "analysis_ready": is_finished and bool(session.get("summary")),
        "summary": None,
        "session_type": session.get("session_type", "Active Session"),
        "concepts": concepts,
        "taxonomy": session.get("taxonomy", {}),
        "questions": [],
        "audio_summary_url": None
    }


@app.post("/sessions/finalize-analysis/{session_id}")
async def finalize_session_analysis(session_id: str, current_user: User = Depends(get_current_user)):
    """
    Generate and persist full post-session analysis via Groq Llama-3.
    Offloads LLM call to a background thread to keep event loop free.
    """
    if not await check_session_access(session_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied to this session")

    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    actual_session_id = session.get("session_id", session_id)

    transcripts = session.get("transcripts") or session.get("transcript_chunks") or []
    if not transcripts:
        raise HTTPException(status_code=422, detail="No transcript content available to analyze")

    # Offload LLM call to executor (crucial for concurrency)
    result = await asyncio.to_thread(analyze_session, transcripts)
    
    summary = result.get("summary", "")
    concepts = result.get("concepts", [])
    questions = result.get("questions", [])
    session_type = result.get("session_type", "Lecture")
    taxonomy = result.get("taxonomy", {})
    analyzed_at = datetime.now(timezone.utc)

    # Generate edge-tts audio summary using the conversational podcast script
    audio_summary_url = None
    podcast_script = result.get("podcast_script", summary) # fallback to summary if missing
    if podcast_script:
        from backend.utils.tts_generator import generate_audio_summary
        try:
            audio_summary_url = await generate_audio_summary(podcast_script, actual_session_id)
        except Exception as e:
            print(f"DEBUG: Failed to generate audio summary: {e}")

    await sessions_collection.update_one(
        {"session_id": actual_session_id},
        {"$set": {
            "summary": summary,
            "concepts": concepts,
            "questions": questions,
            "session_type": session_type,
            "taxonomy": taxonomy,
            "analyzed_at": analyzed_at,
            "audio_summary_url": audio_summary_url
        }}
    )

    # Trigger RAG Indexing in the background
    asyncio.create_task(asyncio.to_thread(index_session_transcript, actual_session_id, transcripts))

    return {
        "session_id": session_id,
        "analysis_ready": True,
        "session_type": session_type,
        "summary": summary,
        "concepts": concepts,
        "taxonomy": taxonomy,
        "questions": questions,
        "analyzed_at": str(analyzed_at),
        "audio_summary_url": audio_summary_url
    }

# --- Session Management Endpoints ---

@app.post("/sessions/start")
async def start_session(data: dict, current_user: User = Depends(require_role("teacher"))):
    """Teachers start a new session for a specific subject."""
    subject_id = data.get("subject_id")
    if not subject_id:
        raise HTTPException(status_code=400, detail="subject_id is required")
        
    subject = await subjects_collection.find_one({"subject_id": subject_id})
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
        
    # --- CLEANUP ORPHANED SESSIONS ---
    # Before starting a new one, finalize any currently "active" sessions for this subject/teacher.
    # This prevents ghost alerts and ensures clean data.
    await sessions_collection.update_many(
        {"subject_id": subject_id, "teacher_email": current_user.email, "status": "active"},
        {"$set": {"status": "finished", "ended_at": datetime.now(timezone.utc)}}
    )
        
    session_id = f"{subject_id}-{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    
    session_doc = {
        "session_id": session_id,
        "subject_id": subject_id,
        "subject_name": subject.get("subject_name"),
        "teacher_email": current_user.email,
        "started_at": datetime.now(timezone.utc),
        "status": "active",
        "transcripts": [],
        "teaching_materials": [],
        "current_context": None
    }
    
    await sessions_collection.insert_one(session_doc)
    return {"session_id": session_id, "status": "active"}

@app.post("/sessions/stop/{session_id}")
async def stop_session(session_id: str, current_user: User = Depends(require_role("teacher"))):
    """Teachers stop an active session."""
    session = await sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.get("teacher_email") != current_user.email:
        raise HTTPException(status_code=403, detail="You can only stop your own sessions")
        
    await sessions_collection.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "finished", 
            "ended_at": datetime.now(timezone.utc),
            "current_context": {"type": "none"}
        }}
    )
    
    # --- AUTO-TRIGGER INDEXING ---
    # Index the transcript as soon as the session ends so it's ready for RAG
    transcripts = session.get("transcripts") or session.get("transcript_chunks") or []
    if transcripts:
        asyncio.create_task(asyncio.to_thread(index_session_transcript, session_id, transcripts))
        print(f"DEBUG: Auto-triggering indexing for session {session_id}")
        
    return {"status": "finished"}

@app.post("/sessions/update-metadata/{session_id}")
async def update_session_metadata(session_id: str, data: dict, current_user: User = Depends(require_role("teacher"))):
    """Update session metadata like materials or current context."""
    update_data = {}
    if "teaching_materials" in data:
        update_data["teaching_materials"] = data["teaching_materials"]
    if "current_context" in data:
        update_data["current_context"] = data["current_context"]
        
    if not update_data:
        print(f"DEBUG: No metadata update for session {session_id}")
        return {"status": "no changes"}
        
    print(f"DEBUG: Updating metadata for session {session_id}: {update_data}")
    await sessions_collection.update_one(
        {"session_id": session_id, "teacher_email": current_user.email},
        {"$set": update_data}
    )
    return {"status": "updated"}

@app.get("/sessions/active")
async def get_active_sessions(current_user: User = Depends(get_current_user)):
    """Returns currently active sessions (for alerts). Students see only their enrolled or public."""
    query = {"status": "active"}
    
    if current_user.role == "student":
        # Strategy: Find active sessions where the student is enrolled in the subject,
        # OR the session subject is "class" (public broadcast).
        query["$or"] = [
            {"subject_id": {"$in": current_user.enrolled_subjects}},
            {"subject": "class"} # Public/Global sessions
        ]
    
    cursor = sessions_collection.find(query, {"transcripts": 0, "_id": 0}).sort("started_at", -1)
    active = await cursor.to_list(length=5)
    return active

@app.delete("/sessions/{session_id}/materials/{material_id}")
async def delete_material(session_id: str, material_id: str, current_user: User = Depends(require_role("teacher"))):
    """Teachers delete a teaching material from a session."""
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.get("teacher_email") != current_user.email:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    materials = session.get("teaching_materials", [])
    updated_materials = [m for m in materials if m.get("id") != material_id]
    
    update_data = {"teaching_materials": updated_materials}
    
    # If the deleted material was the current context, clear it
    current_context = session.get("current_context")
    if current_context and current_context.get("id") == material_id:
        update_data["current_context"] = {"type": "none"}

    await sessions_collection.update_one(
        {"session_id": session.get("session_id", session_id)},
        {"$set": update_data}
    )
    return {"status": "deleted"}

@app.get("/sessions/{session_id}/export-pdf")
async def export_session_pdf(session_id: str, current_user: User = Depends(get_current_user)):
    """Generate and return a professional PDF of the session insights."""
    print(f"DEBUG: PDF Export requested for {session_id} by {current_user.email}")
    
    # Direct session lookup
    session = await sessions_collection.find_one({"session_id": session_id})
    if not session:
        print(f"DEBUG: Session {session_id} not found during export")
        raise HTTPException(status_code=404, detail="Session not found")

    # Safety check: Access control
    # Using check_session_access to keep it consistent with the rest of the app
    if not await check_session_access(session_id, current_user):
             print(f"DEBUG: Access denied for {current_user.email} on {session_id}")
             raise HTTPException(status_code=403, detail="Access denied")

    # Ensure analysis is ready
    status = session.get("status")
    print(f"DEBUG: Session status: {status}")
    
    if not session.get("summary"):
        print(f"DEBUG: Summary not found for {session_id}, attempt to generate")
        if status in ["finished", "archived"]:
            transcripts = session.get("transcripts") or []
            if transcripts:
                try:
                    analysis = await asyncio.to_thread(analyze_session, transcripts)
                    print(f"DEBUG: Analysis generated successfully for {session_id}")
                    await sessions_collection.update_one(
                        {"session_id": session_id},
                        {"$set": {
                            "summary": analysis.get("summary"),
                            "concepts": analysis.get("concepts"),
                            "questions": analysis.get("questions"),
                            "session_type": analysis.get("session_type"),
                            "taxonomy": analysis.get("taxonomy"),
                            "analyzed_at": datetime.now(timezone.utc)
                        }}
                    )
                    session.update(analysis)
                except Exception as e:
                    print(f"DEBUG: Analysis Generation Error: {e}")
                    raise HTTPException(status_code=500, detail=f"AI Summary failed: {str(e)}")
            else:
                print(f"DEBUG: No transcripts found for {session_id}")
                raise HTTPException(status_code=400, detail="Cannot export PDF: No transcript data found.")
        else:
            print(f"DEBUG: session not finished")
            raise HTTPException(status_code=400, detail="Please finish the session first to generate insights.")

    # Create PDF using fpdf2
    from fpdf import FPDF
    pdf = FPDF()
    pdf.add_page()
    
    # Header
    pdf.set_fill_color(63, 81, 181) # Indigo
    pdf.rect(0, 0, 210, 40, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Arial", 'B', 24)
    pdf.cell(0, 20, "SESSION INSIGHTS", ln=True, align='C')
    pdf.set_font("Arial", 'I', 12)
    pdf.cell(0, 10, f"Subject: {session.get('subject_name', 'Class Session')} | ID: {session_id[:8]}", ln=True, align='C')
    
    pdf.ln(15)
    pdf.set_text_color(33, 33, 33)
    
    # Session Type
    pdf.set_font("Arial", 'B', 14)
    pdf.set_text_color(63, 81, 181)
    pdf.cell(0, 10, f"Session Type: {session.get('session_type', 'General')}", ln=True)
    pdf.ln(5)

    # Summary
    pdf.set_font("Arial", 'B', 16)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 10, "Executive Summary", ln=True)
    pdf.set_font("Arial", '', 11)
    pdf.set_text_color(66, 66, 66)
    summary_text = session.get("summary", "No summary available.")
    pdf.multi_cell(0, 6, summary_text)
    pdf.ln(10)

    # Key Concepts
    pdf.set_font("Arial", 'B', 16)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 10, "Key Concepts & Vocabulary", ln=True)
    pdf.set_font("Arial", 'B', 11)
    concepts = session.get("concepts", [])
    pdf.set_fill_color(240, 240, 240)
    for concept in concepts:
        pdf.cell(pdf.get_string_width(str(concept)) + 10, 8, str(concept), border=1, ln=0, fill=True, align='C')
        pdf.cell(5, 8, "", ln=0)
    pdf.ln(15)

    # Study Questions
    pdf.set_font("Arial", 'B', 16)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 10, "Pedagogical Study Questions", ln=True)
    pdf.set_font("Arial", 'I', 11)
    pdf.set_text_color(183, 28, 28) # Red color for questions
    questions = session.get("questions", [])
    for i, q in enumerate(questions):
        pdf.multi_cell(0, 7, f"{i+1}. {q}")
        pdf.ln(2)

    # Footer
    pdf.set_y(-30)
    pdf.set_font("Arial", 'I', 8)
    pdf.set_text_color(158, 158, 158)
    pdf.cell(0, 10, f"Generated by Smart Classroom Assistant on {datetime.now().strftime('%Y-%m-%d %H:%M')}", align='C')

    # Path for temporary storage
    tmp_dir = os.path.join(os.path.dirname(__file__), "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    pdf_path = os.path.join(tmp_dir, f"session_{session_id}.pdf")
    pdf.output(pdf_path)
    
    return FileResponse(pdf_path, filename=f"Session_Insights_{session_id[:8]}.pdf", media_type="application/pdf")

# --- Timetable Endpoints ---

@app.get("/timetable")
async def get_timetable(current_user: User = Depends(get_current_user)):
    """Returns the timetable. Simplified: global or filtered by user."""
    # In a real app, this would be filtered by class/teacher
    cursor = timetable_collection.find({}, {"_id": 0}).sort([("day_index", 1), ("start_time", 1)])
    timetable = await cursor.to_list(length=100)
    return timetable

@app.post("/timetable/add")
async def add_timetable_entry(entry: dict, current_user: User = Depends(require_role("teacher"))):
    """Teachers add entries to the timetable."""
    # day_index: 0 (Mon) to 6 (Sun)
    day_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
    entry["day_index"] = day_map.get(entry.get("day"), 7)
    entry["created_by"] = current_user.email
    
    result = await timetable_collection.insert_one(entry)
    return {"inserted_id": str(result.inserted_id)}

# --- File Management ---

@app.post("/upload/material")
async def upload_material(file: UploadFile = File(...), current_user: User = Depends(require_role("teacher"))):
    """Teachers upload classroom materials (images, PDFs)."""
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    filename = f"{file_id}{ext}"
    filepath = os.path.join(MATERIALS_DIR, filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Return URL for frontend use (relative)
    # The frontend is at localhost:5173, backend at 192.168.1.97:8001
    file_url = f"/storage/materials/{filename}"
    print(f"DEBUG: Material uploaded. Name: {file.filename}, URL: {file_url}")
    
    return {
        "url": file_url,
        "name": file.filename,
        "type": file.content_type
    }

# --- Announcements ---
@app.get("/subjects/{subject_id}/announcements")
async def get_announcements(subject_id: str, current_user: User = Depends(get_current_user)):
    cursor = announcements_collection.find({"subject_id": subject_id}).sort("created_at", -1)
    announcements = await cursor.to_list(length=100)
    for a in announcements:
        if "_id" in a:
            del a["_id"]
    return announcements

@app.post("/subjects/{subject_id}/announcements")
async def create_announcement(subject_id: str, data: dict, current_user: User = Depends(require_role("teacher"))):
    announcement_id = str(uuid.uuid4())
    doc = {
        "announcement_id": announcement_id,
        "subject_id": subject_id,
        "title": data.get("title", ""),
        "content": data.get("content", ""),
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.email,
        "author_name": current_user.full_name
    }
    await announcements_collection.insert_one(doc)
    del doc["_id"]
    return doc

@app.delete("/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, current_user: User = Depends(require_role("teacher"))):
    result = await announcements_collection.delete_one({"announcement_id": announcement_id, "created_by": current_user.email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found or unauthorized")
    return {"status": "deleted"}

# --- Subject Materials ---
@app.get("/subjects/{subject_id}/materials")
async def get_subject_materials(subject_id: str, current_user: User = Depends(get_current_user)):
    cursor = subject_materials_collection.find({"subject_id": subject_id}).sort("uploaded_at", -1)
    materials = await cursor.to_list(length=100)
    for m in materials:
        if "_id" in m:
            del m["_id"]
    return materials

@app.post("/subjects/{subject_id}/materials")
async def add_subject_material(subject_id: str, data: dict, current_user: User = Depends(require_role("teacher"))):
    material_id = str(uuid.uuid4())
    doc = {
        "material_id": material_id,
        "subject_id": subject_id,
        "title": data.get("title", ""),
        "type": data.get("type", "document"),
        "url": data.get("url", ""),
        "uploaded_at": datetime.now(timezone.utc),
        "uploaded_by": current_user.full_name,
        "uploader_email": current_user.email,
        "linked_session_id": data.get("linked_session_id", None)
    }
    await subject_materials_collection.insert_one(doc)
    del doc["_id"]
    return doc

@app.delete("/subject_materials/{material_id}")
async def remove_subject_material(material_id: str, current_user: User = Depends(require_role("teacher"))):
    result = await subject_materials_collection.delete_one({"material_id": material_id, "uploader_email": current_user.email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Material not found or unauthorized")
    return {"status": "deleted"}

# --- Assignments ---
@app.get("/subjects/{subject_id}/assignments")
async def get_assignments(subject_id: str, current_user: User = Depends(get_current_user)):
    cursor = assignments_collection.find({
        "$or": [{"subject_id": subject_id}, {"subject": subject_id}]
    }).sort("due_date", 1)
    assignments = await cursor.to_list(length=100)
    for a in assignments:
        if "_id" in a:
            del a["_id"]
            
    # For students, attach their submission status
    if current_user.role == "student":
        for a in assignments:
            sub = await assignment_submissions_collection.find_one({
                "assignment_id": a["assignment_id"],
                "student_email": current_user.email
            })
            if sub:
                a["submission"] = {
                    "status": "Submitted" if not sub.get("grade") else "Graded",
                    "grade": sub.get("grade"),
                    "submitted_at": sub.get("submitted_at")
                }
            else:
                due_date = a.get("due_date")
                if due_date and datetime.fromisoformat(due_date.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                    a["submission"] = {"status": "Late"}
                else:
                    a["submission"] = {"status": "Not Submitted"}
    else:
        # For teachers, attach count stats
        for a in assignments:
            total_students_enrolled = await users_collection.count_documents({"enrolled_subjects": subject_id})
            submitted_count = await assignment_submissions_collection.count_documents({"assignment_id": a["assignment_id"]})
            a["stats"] = {
                "total_students": total_students_enrolled,
                "submitted_count": submitted_count,
                "pending_count": total_students_enrolled - submitted_count
            }

    return assignments

@app.post("/subjects/{subject_id}/assignments")
async def create_assignment(subject_id: str, data: dict, current_user: User = Depends(require_role("teacher"))):
    assignment_id = str(uuid.uuid4())
    doc = {
        "assignment_id": assignment_id,
        "subject_id": subject_id,
        "title": data.get("title", "Untitled Assignment"),
        "description": data.get("description", ""),
        "due_date": data.get("due_date", ""),
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.email
    }
    await assignments_collection.insert_one(doc)
    del doc["_id"]
    return doc

@app.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, current_user: User = Depends(require_role("teacher"))):
    result = await assignments_collection.delete_one({"assignment_id": assignment_id, "created_by": current_user.email})
    await assignment_submissions_collection.delete_many({"assignment_id": assignment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found or unauthorized")
    return {"status": "deleted"}

@app.post("/assignments/{assignment_id}/submit")
async def submit_assignment(assignment_id: str, data: dict, current_user: User = Depends(require_role("student"))):
    # Upsert submission
    submission_id = str(uuid.uuid4())
    doc = {
        "submission_id": submission_id,
        "assignment_id": assignment_id,
        "student_email": current_user.email,
        "student_name": current_user.full_name,
        "content_url": data.get("url", ""),
        "submitted_at": datetime.now(timezone.utc),
        "grade": None
    }
    await assignment_submissions_collection.update_one(
        {"assignment_id": assignment_id, "student_email": current_user.email},
        {"$set": doc},
        upsert=True
    )
    return {"status": "submitted"}

@app.get("/assignments/{assignment_id}/submissions")
async def get_submissions(assignment_id: str, current_user: User = Depends(require_role("teacher"))):
    cursor = assignment_submissions_collection.find({"assignment_id": assignment_id}).sort("submitted_at", -1)
    submissions = await cursor.to_list(length=100)
    for s in submissions:
        if "_id" in s:
            del s["_id"]
    return submissions

@app.post("/assignments/submissions/{submission_id}/grade")
async def grade_submission(submission_id: str, data: dict, current_user: User = Depends(require_role("teacher"))):
    grade = data.get("grade")
    result = await assignment_submissions_collection.update_one(
        {"submission_id": submission_id},
        {"$set": {"grade": grade, "graded_at": datetime.now(timezone.utc), "graded_by": current_user.email}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"status": "graded"}


# ─────────────────────────────────────────────────────────────────────────────
# Recommended Learning Resources
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/sessions/{session_id}/fetch-resources")
async def fetch_session_resources(session_id: str, current_user: User = Depends(require_role("teacher"))):
    """
    Trigger YouTube fetch for all concepts in a finished session.
    Idempotent: skips concepts that already have 'auto' resources in DB.
    """
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    actual_session_id = session.get("session_id", session_id)
    concepts = session.get("concepts", [])

    if not concepts:
        return {"status": "no_concepts", "fetched": []}

    fetched_concepts = []
    for concept in concepts:
        concept_str = str(concept).strip()
        if not concept_str:
            continue

        # Idempotency check — skip if auto resources already exist for this concept
        existing = await concept_resources_collection.find_one({
            "session_id": actual_session_id,
            "concept": concept_str,
            "source": "auto"
        })
        if existing:
            continue

        videos = await fetch_youtube_videos(concept_str, max_results=3)
        for video in videos:
            resource_id = str(uuid.uuid4())
            doc = {
                "resource_id": resource_id,
                "session_id": actual_session_id,
                "concept": concept_str,
                "title": video.get("title", ""),
                "url": video.get("url", ""),
                "thumbnail": video.get("thumbnail", ""),
                "channel": video.get("channel", ""),
                "type": video.get("type", "youtube"),
                "source": "auto",
                "created_by": "system",
                "created_at": datetime.now(timezone.utc),
            }
            await concept_resources_collection.insert_one(doc)

        fetched_concepts.append(concept_str)

    return {"status": "done", "fetched": fetched_concepts}


@app.get("/sessions/{session_id}/resources")
async def get_session_resources(session_id: str, current_user: User = Depends(get_current_user)):
    """Return all resources for a session grouped by concept."""
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    actual_session_id = session.get("session_id", session_id)

    cursor = concept_resources_collection.find(
        {"session_id": actual_session_id},
        {"_id": 0}
    ).sort("created_at", 1)
    resources = await cursor.to_list(length=200)

    # Group by concept
    grouped: dict = {}
    for r in resources:
        c = r.get("concept", "General")
        if c not in grouped:
            grouped[c] = []
        if len(grouped[c]) < 3:  # Enforce max 3 per concept for display
            grouped[c].append(r)

    return {"session_id": actual_session_id, "resources": grouped}


@app.post("/sessions/{session_id}/resources")
async def add_session_resource(session_id: str, data: dict, current_user: User = Depends(require_role("teacher"))):
    """Teacher manually adds a resource to a session concept."""
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    actual_session_id = session.get("session_id", session_id)
    resource_id = str(uuid.uuid4())

    resource_type = data.get("type", "website")
    url = data.get("url", "")

    # Auto-derive thumbnail for YouTube links
    thumbnail = data.get("thumbnail", "")
    if "youtube.com/watch?v=" in url and not thumbnail:
        vid = url.split("v=")[-1].split("&")[0]
        thumbnail = f"https://img.youtube.com/vi/{vid}/mqdefault.jpg"
    elif "youtu.be/" in url and not thumbnail:
        vid = url.split("youtu.be/")[-1].split("?")[0]
        thumbnail = f"https://img.youtube.com/vi/{vid}/mqdefault.jpg"

    doc = {
        "resource_id": resource_id,
        "session_id": actual_session_id,
        "concept": data.get("concept", "General"),
        "title": data.get("title", ""),
        "url": url,
        "thumbnail": thumbnail,
        "channel": data.get("channel", ""),
        "type": resource_type,
        "source": "teacher",
        "created_by": current_user.email,
        "created_at": datetime.now(timezone.utc),
    }
    await concept_resources_collection.insert_one(doc)
    del doc["_id"]
    return doc


@app.put("/sessions/{session_id}/resources/{resource_id}")
async def update_session_resource(
    session_id: str, resource_id: str, data: dict,
    current_user: User = Depends(require_role("teacher"))
):
    """Teacher edits an existing resource."""
    resource = await concept_resources_collection.find_one({"resource_id": resource_id})
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    allowed_fields = {"concept", "title", "url", "thumbnail", "channel", "type"}
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    if not update_data:
        return {"status": "no_changes"}

    await concept_resources_collection.update_one(
        {"resource_id": resource_id},
        {"$set": update_data}
    )
    return {"status": "updated"}


@app.delete("/sessions/{session_id}/resources/{resource_id}")
async def delete_session_resource(
    session_id: str, resource_id: str,
    current_user: User = Depends(require_role("teacher"))
):
    """Teacher deletes a resource."""
    result = await concept_resources_collection.delete_one({"resource_id": resource_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"status": "deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# AI Endpoints (Feature 1: Teaching Assistant + Feature 5: Quiz Grader)
# ─────────────────────────────────────────────────────────────────────────────

def _call_groq_tutor(question: str, context_text: str) -> str:
    """Synchronous Groq call for student tutoring. Runs in executor thread."""
    from backend.utils.summarizer import _get_client
    client = _get_client()

    system_prompt = """You are a friendly, expert AI Teaching Assistant.
Your role is to help students understand the content being taught.
Be concise, clear, and pedagogically sound.
Answer in 1-2 clear paragraphs. Use simple language."""

    user_content = question
    if context_text:
        user_content = f"""Class session context (recent transcript):
---
{context_text}
---

Student's question: {question}"""

    for model in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.5,
                max_tokens=350
            )
            return response.choices[0].message.content.strip()
        except Exception:
            continue
    return "I'm having trouble connecting to the AI right now. Please ask your teacher or try again shortly."


def _call_groq_grader(question: str, student_answer: str, student_name: str) -> dict:
    """Synchronous Groq call for quiz grading. Runs in executor thread."""
    from backend.utils.summarizer import _get_client
    import json as _json
    client = _get_client()

    system_prompt = """You are a strict but fair academic quiz grader.
Grade the student's spoken answer to the quiz question.
Return a JSON object with: score (0-10), grade (A/B/C/D/F), feedback (2-3 specific sentences of constructive feedback).
Be direct, educational, and honest. Incomplete answers should not score full marks."""

    user_content = f"""Quiz Question: {question}

Student Name: {student_name}
Student's Answer: {student_answer}

Grade this answer and return strictly JSON:
{{"score": <0-10>, "grade": "<A/B/C/D/F>", "feedback": "<2-3 sentences>"}}"""

    try:
        for model in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]:
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=300
                )
                raw = _json.loads(response.choices[0].message.content)
                return {
                    "score": int(raw.get("score", 5)),
                    "grade": str(raw.get("grade", "C")),
                    "feedback": str(raw.get("feedback", "Good effort!"))
                }
            except Exception:
                continue
    except Exception as e:
        pass
    return {"score": 5, "grade": "C", "feedback": "Your answer was received but auto-grading encountered an issue. Please check with your teacher."}


@app.post("/ai/ask")
async def ask_ai(data: dict, current_user: User = Depends(get_current_user)):
    """
    Feature 1: AI Teaching Assistant.
    Student asks a question; optionally grounded in session transcript context.
    Returns a tutoring answer from Groq Llama-3.
    """
    question = data.get("question", "").strip()
    context_snippets = data.get("context", [])

    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    context_text = ""
    if context_snippets and isinstance(context_snippets, list):
        context_text = "\n".join([str(s) for s in context_snippets[-8:]])

    answer = await asyncio.to_thread(_call_groq_tutor, question, context_text)
    return {"answer": answer, "question": question}


@app.post("/ai/grade-quiz")
async def grade_quiz(data: dict, current_user: User = Depends(get_current_user)):
    """
    Feature 5: Quiz Answer Grader.
    Receives student's spoken answer text, grades it via Groq LLM.
    Returns score, letter grade, and detailed feedback.
    """
    question = data.get("question", "").strip()
    student_answer = data.get("student_answer", "").strip()
    student_name = data.get("student_name", current_user.full_name or "Student")

    if not question or not student_answer:
        raise HTTPException(status_code=400, detail="question and student_answer are required")

    result = await asyncio.to_thread(_call_groq_grader, question, student_answer, student_name)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# RAG Assessment Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/sessions/{session_id}/generate-quiz")
async def generate_session_quiz(session_id: str, current_user: User = Depends(require_role("teacher"))):
    """Teachers trigger RAG quiz generation."""
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    actual_session_id = session.get("session_id", session_id)
    
    # Generate quiz using Assessment Engine
    questions = await generate_rag_quiz(actual_session_id)
    
    if not questions:
        raise HTTPException(status_code=422, detail="Could not generate quiz. Ensure session is indexed.")
        
    quiz_doc = {
        "quiz_id": str(uuid.uuid4()),
        "session_id": actual_session_id,
        "subject_id": session.get("subject_id"),
        "title": f"Assessment: {session.get('subject_name', 'Class Session')}",
        "questions": questions,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.email
    }
    
    await quizzes_collection.update_one(
        {"session_id": actual_session_id},
        {"$set": quiz_doc},
        upsert=True
    )
    
    return {"status": "success", "quiz_id": quiz_doc["quiz_id"], "questions_count": len(questions)}

@app.post("/subjects/{subject_id}/generate-quiz-preview")
async def generate_subject_quiz_preview(subject_id: str, data: dict, current_user: User = Depends(require_role("teacher"))):
    """Teachers trigger RAG quiz generation for multiple sessions in a subject."""
    session_ids = data.get("session_ids", [])
    if not session_ids:
        raise HTTPException(status_code=400, detail="session_ids list is required")
        
    subject = await subjects_collection.find_one({"subject_id": subject_id})
    if not subject:
        # Fallback for legacy id field
        subject = await subjects_collection.find_one({"id": subject_id})
        
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # --- ON-DEMAND INDEXING ---
    for sid in session_ids:
        session = await sessions_collection.find_one({"session_id": sid})
        if session:
            transcripts = session.get("transcripts") or session.get("transcript_chunks") or []
            if transcripts:
                await asyncio.to_thread(index_session_transcript, sid, transcripts)
                
    logger.info(f"Generating preview quiz for subject {subject_id} with {len(session_ids)} sessions...")
    questions = await generate_rag_quiz(session_ids=session_ids)
    
    if not questions:
        raise HTTPException(status_code=422, detail="Could not generate quiz. No relevant context found.")
        
    return {
        "status": "success",
        "title": f"Comprehensive Assessment: {subject.get('subject_name', 'Subject Recap')}",
        "questions": questions
    }

@app.post("/quizzes/save")
async def save_quiz(data: dict, current_user: User = Depends(require_role("teacher"))):
    """Save finalized quiz after teacher review/point adjustment."""
    subject_id = data.get("subject_id")
    session_ids = data.get("session_ids", [])
    questions = data.get("questions", [])
    title = data.get("title", "Assessment")
    
    # Calculate max score
    total_max_points = sum([q.get("max_points", 10 if q.get("type") == "short_answer" else 2) for q in questions])
    
    quiz_doc = {
        "quiz_id": str(uuid.uuid4()),
        "subject_id": subject_id,
        "session_ids": session_ids,
        "is_comprehensive": True,
        "title": title,
        "questions": questions,
        "total_max_points": total_max_points,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.email
    }
    
    await quizzes_collection.update_one(
        {"subject_id": subject_id, "is_comprehensive": True},
        {"$set": quiz_doc},
        upsert=True
    )
    
    return {"status": "success", "quiz_id": quiz_doc["quiz_id"]}

@app.delete("/quizzes/{quiz_id}")
async def delete_quiz(quiz_id: str, current_user: User = Depends(require_role("teacher"))):
    """Teachers can delete an assessment and all its submissions."""
    quiz = await quizzes_collection.find_one({"quiz_id": quiz_id})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.get("created_by") != current_user.email:
        raise HTTPException(status_code=403, detail="You can only delete quizzes you created")
    
    await quizzes_collection.delete_one({"quiz_id": quiz_id})
    deleted = await quiz_submissions_collection.delete_many({"quiz_id": quiz_id})
    
    return {"status": "success", "message": f"Quiz deleted. {deleted.deleted_count} submissions also removed."}

@app.patch("/quizzes/{quiz_id}")
async def update_quiz(quiz_id: str, data: dict, current_user: User = Depends(require_role("teacher"))):
    """Teachers can update a quiz's title and questions (including max_points)."""
    quiz = await quizzes_collection.find_one({"quiz_id": quiz_id})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.get("created_by") != current_user.email:
        raise HTTPException(status_code=403, detail="You can only edit quizzes you created")
    
    update_fields = {}
    if "title" in data:
        update_fields["title"] = data["title"]
    if "questions" in data:
        questions = data["questions"]
        update_fields["questions"] = questions
        update_fields["total_max_points"] = sum(
            [q.get("max_points", 10 if q.get("type") == "short_answer" else 2) for q in questions]
        )
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await quizzes_collection.update_one({"quiz_id": quiz_id}, {"$set": update_fields})
    return {"status": "success", "quiz_id": quiz_id}

@app.post("/admin/bulk-index-sessions")
async def bulk_index_sessions(current_user: User = Depends(require_role("teacher"))):
    """ Administrative tool to index all historical finished sessions. """
    try:
        sample_sids = []
        finished_sessions = await sessions_collection.find({"status": "finished"}).to_list(None)
        indexed_count = 0
        
        if finished_sessions:
            sample_sids = [str(s.get("session_id") or s.get("_id")) for s in finished_sessions[:5]]
            logger.info(f"BULK INDEXING: Found {len(finished_sessions)} finished sessions. Sample SIDs: {sample_sids}")
        
        for session in finished_sessions:
            # Normalize session_id to string, fallback to _id
            session_id = str(session.get("session_id") or session.get("_id"))
            transcripts = session.get("transcripts") or session.get("transcript_chunks") or []
            if transcripts:
                # Idempotent re-indexing
                await asyncio.to_thread(index_session_transcript, session_id, transcripts)
                indexed_count += 1
                
        return {
            "status": "success", 
            "total_indexed": indexed_count,
            "sample_sids_from_db": sample_sids
        }
    except Exception as e:
        logger.error(f"Bulk index failed: {str(e)}")
        return {"status": "error", "message": str(e)}

@app.get("/admin/debug-vector-store")
async def debug_vector_store(limit: int = 5, current_user: User = Depends(require_role("teacher"))):
    """Debug endpoint to see what's actually in Qdrant."""
    try:
        count_result = vector_store.client.count(collection_name="classroom_knowledge")
        results, next_page = vector_store.client.scroll(
            collection_name="classroom_knowledge",
            limit=limit,
            with_payload=True,
            with_vectors=False
        )
        return {
            "collection_count": count_result.count,
            "points": [
                {"id": p.id, "payload": p.payload} for p in results
            ]
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/admin/search-test/{sid}")
async def search_test(sid: str, current_user: User = Depends(require_role("teacher"))):
    """Test if search works for a specific ID."""
    results = vector_store.search("general knowledge", session_id=sid, limit=5)
    return {
        "session_id": sid,
        "results_count": len(results),
        "results": results
    }

@app.get("/sessions/{session_id}/quiz")
async def get_session_quiz(session_id: str, current_user: User = Depends(get_current_user)):
    """Get the generated quiz for a session."""
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    actual_session_id = session.get("session_id", session_id)
    
    quiz = await quizzes_collection.find_one({"session_id": actual_session_id}, {"_id": 0})
    if not quiz:
        raise HTTPException(status_code=404, detail="No quiz generated for this session yet.")
        
    return quiz

@app.post("/quizzes/{quiz_id}/submit")
async def submit_quiz(quiz_id: str, data: dict, current_user: User = Depends(get_current_user)):
    """Unified quiz submission endpoint using quiz_id."""
    quiz = await quizzes_collection.find_one({"quiz_id": quiz_id})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    # 1. Enforce Single Submission
    existing = await quiz_submissions_collection.find_one({
        "quiz_id": quiz_id,
        "student_email": current_user.email
    })
    if existing:
        raise HTTPException(status_code=403, detail="You have already submitted this assessment.")

    answers = data.get("answers", {}) # {question_id: answer}
    results = []
    total_score = 0
    
    quiz_session_id = quiz.get("session_id")
    quiz_session_ids = quiz.get("session_ids")
    
    total_max_points = quiz.get("total_max_points", sum([q.get("max_points", 10 if q.get("type") == "short_answer" else 2) for q in quiz.get("questions", [])]))
    
    for q in quiz.get("questions", []):
        q_id = q.get("id")
        student_answer = answers.get(q_id)
        max_points = q.get("max_points", 10 if q.get("type") == "short_answer" else 2)
        
        if q.get("type") == "mcq":
            is_correct = int(student_answer) == q.get("correct_index") if student_answer is not None else False
            score = max_points if is_correct else 0
            results.append({
                "question_id": q_id,
                "score": score,
                "max_points": max_points,
                "is_correct": is_correct,
                "feedback": "Correct!" if is_correct else f"Incorrect. The correct answer was: {q.get('options')[q.get('correct_index')]}",
                "evidence": q.get("source_evidence")
            })
            total_score += score
        else:
            # Short Answer: Use RAG-Grounded Grader
            grading = await grade_student_answer_rag(
                session_id=quiz_session_id, 
                session_ids=quiz_session_ids, 
                question=q.get("question"), 
                student_answer=str(student_answer)
            )
            raw_ai_score = grading.get("score", 0)
            # Scale the AI score (which is always 0-10) to the weighted max_points
            weighted_score = (raw_ai_score / 10.0) * max_points
            
            results.append({
                "question_id": q_id,
                "score": round(weighted_score, 1),
                "max_points": max_points,
                "feedback": grading.get("feedback"),
                "teacher_quote": grading.get("teacher_quote")
            })
            total_score += weighted_score
            
    avg_score = total_score / total_max_points if total_max_points > 0 else 0
    
    submission_doc = {
        "submission_id": str(uuid.uuid4()),
        "quiz_id": quiz_id,
        "quiz_title": quiz.get("title", "Assessment"),
        "subject_id": quiz.get("subject_id"),
        "student_email": current_user.email,
        "student_name": current_user.full_name,
        "results": results,
        "total_score": float(total_score),
        "max_score": float(total_max_points),
        "average_score": float(avg_score * 100), # Store as percentage
        "submitted_at": datetime.now(timezone.utc)
    }
    
    await quiz_submissions_collection.insert_one(submission_doc)
    logger.info(f"Quiz submitted: {quiz_id} by {current_user.email}. Score: {total_score}")
    
    return {"status": "submitted", "score": total_score, "results": results}

@app.post("/sessions/{session_id}/submit-quiz")
async def submit_session_quiz_legacy(session_id: str, data: dict, current_user: User = Depends(get_current_user)):
    """Legacy redirect to the new quiz-id endpoint."""
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    quiz = await quizzes_collection.find_one({"session_id": session.get("session_id", session_id)})
    if not quiz:
        raise HTTPException(status_code=404, detail="No quiz found for this session")
    return await submit_quiz(quiz.get("quiz_id"), data, current_user)

@app.get("/sessions/{session_id}/quiz-results")
async def get_quiz_results(session_id: str, current_user: User = Depends(get_current_user)):
    """Get quiz results. Students see their own, teachers see all."""
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    actual_session_id = session.get("session_id", session_id)
    
    query = {"session_id": actual_session_id}
    if current_user.role == "student":
        query["student_email"] = current_user.email
        
    cursor = quiz_submissions_collection.find(query, {"_id": 0}).sort("submitted_at", -1)
    submissions = await cursor.to_list(length=100)
    return submissions

@app.post("/sessions/{session_id}/index-materials")
async def index_session_materials(session_id: str, current_user: User = Depends(require_role("teacher"))):
    """Trigger indexing for all materials in a session."""
    session = await resolve_session_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    actual_session_id = session.get("session_id", session_id)
    materials = session.get("teaching_materials", [])
    
    indexed_count = 0
    for m in materials:
        m_url = m.get("url", "")
        if m_url.startswith("/storage/materials/"):
            filename = os.path.basename(m_url)
            local_path = os.path.join(MATERIALS_DIR, filename)
            
            # Start background indexing
            asyncio.create_task(asyncio.to_thread(index_material, actual_session_id, local_path, m.get("id"), m.get("title")))
            indexed_count += 1
            
    return {"status": "indexing_started", "materials_queued": indexed_count}

@app.get("/quizzes/global")
async def get_global_quizzes(current_user: User = Depends(get_current_user)):
    """Fetch quizzes across all relevant subjects for the user."""
    if current_user.role == "teacher":
        # Find all quizzes created by this teacher
        cursor = quizzes_collection.find({"created_by": current_user.email}, {"_id": 0}).sort("created_at", -1)
    else:
        # Find all quizzes for subjects the student is enrolled in
        enrolled_subjects = current_user.enrolled_subjects or []
        
        # We need comprehensive quizzes matching subject_ids, OR legacy quizzes directly on the session
        # Fallback if enrolled_subjects is missing or empty, maybe query enrolled_sessions if needed
        enrolled_sessions = current_user.enrolled_sessions or []
        query_conditions = [{"session_id": {"$in": enrolled_sessions}}]
        
        if enrolled_subjects:
            query_conditions.append({"subject_id": {"$in": enrolled_subjects}})
            
        cursor = quizzes_collection.find({"$or": query_conditions}, {"_id": 0}).sort("created_at", -1)
    
    quizzes = await cursor.to_list(length=100)
    return quizzes

@app.get("/quizzes/submissions/global")
async def get_global_submissions(current_user: User = Depends(get_current_user)):
    """Fetch all submissions for the user across all sessions."""
    if current_user.role == "student":
        query = {"student_email": current_user.email}
    else:
        # For teachers, find submissions for quizzes they created
        my_quizzes = await quizzes_collection.find({"created_by": current_user.email}).to_list(length=100)
        quiz_ids = [q["quiz_id"] for q in my_quizzes if "quiz_id" in q]
        query = {"quiz_id": {"$in": quiz_ids}}
        
    cursor = quiz_submissions_collection.find(query, {"_id": 0}).sort("submitted_at", -1)
    submissions = await cursor.to_list(length=100)
    return submissions

@app.delete("/quizzes/{quiz_id}/submissions/{student_email}")
async def reset_student_submission(quiz_id: str, student_email: str, current_user: User = Depends(require_role("teacher"))):
    """Teachers can reset a student's submission to allow them to retake the quiz."""
    # Verify the quiz belongs to the teacher
    quiz = await quizzes_collection.find_one({"quiz_id": quiz_id})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    if quiz.get("created_by") != current_user.email:
         raise HTTPException(status_code=403, detail="You can only reset submissions for quizzes you created.")
         
    result = await quiz_submissions_collection.delete_many({
        "quiz_id": quiz_id,
        "student_email": student_email
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No submission found for this student.")
        
    return {"status": "success", "message": f"Deleted {result.deleted_count} submissions. Student can now retake the quiz."}
