import asyncio
import websockets
import numpy as np
import json
import logging
import wave
import os
import struct
import threading
import random
import string
import collections
import difflib
import functools
import sys
from concurrent.futures import ThreadPoolExecutor
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
from datetime import datetime

# Ensure the backend directory is in the path so we can import shared utilities
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from whisper_stream import WhisperStream
from vad import VADProcessor
from speech_segmenter import SpeechSegmenter
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from backend.utils.summarizer import generate_summary, extract_concepts, generate_questions, analyze_session


# -----------------------------------------------------------------------------
# Configuration & Constants
# -----------------------------------------------------------------------------
SAMPLE_RATE = 16000
FRAME_MS = 30  # Duration of one audio frame (if needed for chunking)
# 2 bytes per sample, 16000 samples/sec
# Byte rate = 32000 bytes/sec
BASE_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "recordings")
os.makedirs(BASE_AUDIO_DIR, exist_ok=True)

# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# Global Resources
# -----------------------------------------------------------------------------
logging.basicConfig(
    format='%(asctime)s %(levelname)s: %(message)s',
    level=logging.INFO,
    handlers=[
        logging.FileHandler("audio_service.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AudioService")
# summary = generate_summary(self.transcript_buffer) # REMOVED: Buggy global call

# MongoDB configuration (Fix: Use Environment Variable and TLS)
MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority")
logger.info(f"Connecting to MongoDB with URI: {MONGO_URI.split('@')[-1]}") # Log only host part for security

mongo_client = AsyncIOMotorClient(
    MONGO_URI,
    tls=True,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=5000
)
db = mongo_client["smart_classroom"]
sessions_collection = db["sessions"]

# Executors
# Single inference_executor shared by both final and partial workers.
# ctranslate2 (faster-whisper) releases the GIL during inference, so
# ThreadPoolExecutor works correctly and avoids loading multiple model copies.
inference_executor = ThreadPoolExecutor(max_workers=4)
io_executor = ThreadPoolExecutor(max_workers=4)

# Initialize persistent Local Whisper model
whisper_instance = WhisperStream()

# Audio Write Lock
audio_write_lock = threading.Lock()

# Registry: session_id -> AudioSession object
active_audio_sessions = {}
# Viewer Registry: session_id -> list of websockets
active_viewers = collections.defaultdict(list)
viewers_lock = asyncio.Lock()
registry_lock = asyncio.Lock()
active_connections = {}
active_connections_lock = asyncio.Lock()

# -----------------------------------------------------------------------------
# Audio Persistence (Sync, runs in io_executor)
# -----------------------------------------------------------------------------
def get_session_pcm_path(session_id):
    """Return the absolute path for a session's PCM file."""
    return os.path.join(BASE_AUDIO_DIR, f"{session_id}.pcm")

def append_audio_chunk(session_id, audio_bytes):
    """Append raw bytes to PCM file."""
    pcm_path = get_session_pcm_path(session_id)
    try:
        with audio_write_lock:
            with open(pcm_path, "ab") as f:
                f.write(audio_bytes)
    except Exception as e:
        logger.error(f"PCM append error for {session_id}: {e}")


# -----------------------------------------------------------------------------
# Audio Session Class
# -----------------------------------------------------------------------------
# -----------------------------------------------------------------------------
# SESSION PERSISTENCE (In-Memory across refreshes)
# -----------------------------------------------------------------------------

class SessionStore:
    def __init__(self, session_id):
        self.session_id = session_id
        self.transcript_buffer = []  # List of dicts
        self.current_context = {"type": "none"}
        self.last_screen_frame = None
        self.participants = {}  # ws -> {name, email}
        self.attendance = set() # set of (name, email) tuples
        self.lock = asyncio.Lock()
        self.last_active = datetime.utcnow()

# Global registry for stores: session_id -> SessionStore
session_stores = {}
stores_lock = asyncio.Lock()

async def get_or_create_store(session_id):
    async with stores_lock:
        if session_id not in session_stores:
            session_stores[session_id] = SessionStore(session_id)
        session_stores[session_id].last_active = datetime.utcnow()
        return session_stores[session_id]

class AudioSession:
    def __init__(self, websocket, session_id):
        self.ws = websocket
        self.session_id = session_id
        self.running = True
        self.current_speaker = "Teacher" # Dynamic speaker tracking
        self.store = None # Will be initialized in start()
        
        # Buffers & Queues
        # Shared segment queue for transcription (closed segments)
        self.segment_queue = asyncio.Queue(maxsize=100)
        
        # Audio accumulator for VAD
        self.vad = VADProcessor(aggressiveness=1)  # Lowering aggressiveness to prevent clipping soft speech
        self.segmenter = SpeechSegmenter()  # Uses optimized defaults: 450ms silence, 2.4s force-flush

        # Remainder buffer for non-aligned chunks (less than 30ms)
        self.remainder_buffer = bytearray()
        
        # In-memory transcript items for batching MongoDB Writes
        # self.transcript_buffer = [] # Moved to SessionStore
        # self.buffer_lock = asyncio.Lock() # Moved to SessionStore
        
        # Timing context for Merge Layer
        self.last_segment_end_time = -1.0 
        self.session_start_time = datetime.utcnow()
        self.cumulative_offset = 0.0 
        
        # Audio Context for Continuity (Overlap)
        self.last_context_bytes = b""
        
        # Stabilization State (Prefix Freezing)
        self.stable_prefix = ""
        self.last_partial_words = []
        
        # Sequence counter for MongoDB
        self.seq_counter = 0
        
        # Remote Classroom: Current document/page/screen context
        # self.current_context = None # Moved to SessionStore
        # self.last_screen_frame = None # Moved to SessionStore
        
        # Tasks reference
        self.tasks = []
        
        # Session lifecycle event — set by handle_client when the WebSocket closes
        self._session_done = asyncio.Event()

        # Participant tracking
        self.active_participants = 0

        # Efficiency Flag: if True, we prioritize browser-based results for display
        self.use_browser_transcription = False

    async def start(self, initial_chunk=None):
        """Launch all concurrent tasks."""
        logger.info(f"Starting session {self.session_id}")
        loop = asyncio.get_running_loop()
        
        self.store = await get_or_create_store(self.session_id)

        # Ensure Index for performance
        try:
            await sessions_collection.create_index("session_id", unique=True)
        except Exception:
            pass

        # Create/Update session record
        try:
            # First, check the existing status in the database
            existing = await sessions_collection.find_one({"session_id": self.session_id})
            if existing:
                curr_status = existing.get("status")
                if curr_status == "finished":
                    logger.info(f"Session {self.session_id} is already finished. NOT resurrecting.")
                    self.running = False
                    self._session_done.set()
                    return
                logger.info(f"Resuming existing session {self.session_id} (current status: {curr_status})")
                # Restore attendance
                if "attendance" in existing:
                    async with self.store.lock:
                        for entry in existing["attendance"]:
                            self.store.attendance.add((entry["name"], entry["email"]))
            else:
                logger.info(f"Creating NEW session record for {self.session_id}")

            await sessions_collection.update_one(
                {"session_id": self.session_id},
                {
                    "$setOnInsert": {
                        "subject": self.session_id.rsplit("-", 1)[0],
                        "subject_id": self.session_id.rsplit("-", 1)[0], 
                        "started_at": datetime.utcnow(),
                        "transcripts": [],
                        "status": "active" # Set status on insert
                    }
                },
                upsert=True
            )
        except Exception as e:
            logger.error(f"Failed to create/check session record: {e}")
            
        # Create processing tasks (audio_receiver is NOT here — handle_client feeds bytes
        # directly to process_audio_chunk(), avoiding dual-consumer WS conflict)
        self.tasks = [
            loop.create_task(self.transcription_worker()),
            loop.create_task(self.partial_worker()),
            loop.create_task(self.mongo_flusher())
        ]
        
        if initial_chunk and isinstance(initial_chunk, bytes):
            self.process_audio_chunk(initial_chunk)

        try:
            # Block here until handle_client signals the WebSocket has closed
            await self._session_done.wait()
        except Exception as e:
            logger.error(f"Session Error: {e}")
        finally:
            self.running = False
            # Force flush segmenter
            final_seg = self.segmenter.force_flush()
            if final_seg:
                self.segment_queue.put_nowait((final_seg, self.cumulative_offset))
            
            # Wait for workers to finish queues
            logger.info(f"Waiting for workers to finish queue for {self.session_id}...")
            await asyncio.sleep(1) # Grace period for transcription
            
            # NOTE: We NO LONGER finalize the session here on disconnect.
            # This allows the teacher to refresh and resume the same session.
            # Finalization is handled by the manual 'stop_session' REST call in app.py
            # or by the 'stop_session' WebSocket message.
            
            # RESUME GUARD: Only force status to 'active' if it's currently active.
            # If it's already finished, keep it finished.
            current_doc = await sessions_collection.find_one({"session_id": self.session_id}, {"status": 1})
            target_status = "active"
            if current_doc and current_doc.get("status") in ["finished", "archived"]:
                target_status = current_doc.get("status")
            
            await self.force_flush(status=target_status) 
            logger.info(f"Producer disconnected from {self.session_id}. Session is {target_status}.")

    async def audio_receiver(self):
        """
        STEP 2: RECEIVER TASK
        - Continuously receive audio frames.
        - Push to fast_queue and context_queue.
        - Persist to disk (legacy/requested requirement).
        """
        logger.info("[Receiver] Started")
        loop = asyncio.get_running_loop()
        
        try:
            async for message in self.ws:
                if not self.running:
                    break
                    
                if isinstance(message, bytes):
                    self.process_audio_chunk(message)
                            
        except Exception as e:
            logger.error(f"[Receiver] WS Error: {e}")
        finally:
            logger.info("[Receiver] Stopped")

    def process_audio_chunk(self, audio_bytes):
        """VAD-driven chunk processing using 30ms frames."""
        loop = asyncio.get_event_loop()
        
        # 1. Background persist (PCM)
        loop.run_in_executor(io_executor, append_audio_chunk, self.session_id, audio_bytes)
        
        # 2. Chain into frames
        self.remainder_buffer.extend(audio_bytes)
        
        # 30ms @ 16kHz = 480 samples = 960 bytes
        frame_size = 960
        while len(self.remainder_buffer) >= frame_size:
            frame = bytes(self.remainder_buffer[:frame_size])
            del self.remainder_buffer[:frame_size]
            
            # VAD Test
            if self.vad.is_speech(frame):
                closed_segment = self.segmenter.add_speech(frame)
            else:
                closed_segment = self.segmenter.add_silence(frame)
            
            # If a segment was closed by silence
            if closed_segment:
                duration_s = len(closed_segment) / 32000.0
                self.segment_queue.put_nowait((closed_segment, self.cumulative_offset))
                logger.info(f"[Pipeline] Enqueued segment: {duration_s:.2f}s at offset {self.cumulative_offset:.2f}s")
                self.cumulative_offset += duration_s
                
                # Update context for next segment (keep last 300ms)
                # 300ms = 0.3 * 32000 = 9600 bytes
                self.last_context_bytes = closed_segment[-9600:]
                
                # Reset stabilization for new segment
                self.stable_prefix = ""
                self.last_partial_words = []

    async def transcription_worker(self):
        """Processes completed speech segments from segmenter."""
        logger.info("[Worker] Started")
        loop = asyncio.get_running_loop()
        
        while self.running:
            try:
                segment_data = await self.segment_queue.get()
                segment_bytes, base_offset = segment_data
                
                # context overlap logic
                overlap_s = 0.0
                if self.last_context_bytes:
                    overlap_s = len(self.last_context_bytes) / 32000.0
                    audio_to_send = self.last_context_bytes + segment_bytes
                else:
                    audio_to_send = segment_bytes
                
                audio_np = np.frombuffer(audio_to_send, dtype=np.int16)

                # ── RMS Energy Guard ─────────────────────────────────────────
                # Whisper hallucinates (Korean/symbols) on near-silence.
                # Skip segments whose RMS is below the noise floor (int16 scale).
                rms = np.sqrt(np.mean(audio_np.astype(np.float32) ** 2))
                RMS_THRESHOLD = 110  # Increased from 80 to prevent low-level noise hallucinations
                if rms < RMS_THRESHOLD:
                    logger.info(f"[Worker] Skipping near-silent segment (RMS={rms:.1f} < {RMS_THRESHOLD})")
                    self.segment_queue.task_done() if hasattr(self.segment_queue, 'task_done') else None
                    continue
                # ─────────────────────────────────────────────────────────────
                
                json_str = await loop.run_in_executor(
                    inference_executor,
                    whisper_instance.transcribe,
                    audio_np,
                    False,   # is_partial
                )
                
                if json_str:
                    data = json.loads(json_str)
                    segments = data.get("segments", [])
                    
                    for seg in segments:
                        words = seg.get("words", [])

                        # ── No-Speech Probability Filter ──────────────────────
                        no_speech_prob = seg.get("no_speech_prob", 0.0)
                        if no_speech_prob > 0.45: # Tightened from 0.55
                            logger.info(f"[Worker] Rejecting low-confidence segment (prob={no_speech_prob:.2f}): {seg.get('text', '')}")
                            continue

                        # ── Repetitive Symbol Filter ──────────────────────────
                        import re
                        raw_text = seg.get("text", "").strip()
                        # Reject if text is mostly repetitive symbols like ) ) ) ), ? ? ? ?, etc.
                        # Matches non-alphanumeric char followed by 3+ occurrences of itself (with optional spaces)
                        if re.search(r'([^\w\s])(?:\s*\1){3,}', raw_text):
                            logger.info(f"[Worker] Rejecting repetitive hallucination: {raw_text}")
                            continue
                        # ─────────────────────────────────────────────────────

                        # Timestamp-based Merge + Boundary Trimming
                        # Shift by overlap_s because we prepended context
                        start_time = base_offset + seg["start"] - overlap_s
                        end_time = base_offset + seg["end"] - overlap_s
                        
                        # Filtered list of words
                        cleaned_words = []
                        segment_rel_start = seg["start"] # time in transcribed buffer
                        segment_duration = seg["end"] - seg["start"]
                        
                        for w in words:
                            w_start = w.get("start", 0)
                            w_end = w.get("end", 0)
                            w_dur = w.get("end", 0) - w.get("start", 0)
                            w_prob = w.get("probability", 1.0)
                            
                            # BOUNDARY TRIMMING rules (Relaxed to avoid dropping starts after gaps)
                            # First 0.25s: drop absolute noise only
                            if w_start < 0.25 and (w_prob < 0.2 or w_dur < 0.02):
                                continue
                            
                            # Last 0.25s: drop unstable trailing words
                            if w_end > (segment_duration + overlap_s) - 0.25:
                                # Often noise artifacts
                                if w_prob < 0.2 or w_dur < 0.02:
                                    continue
                                    
                            cleaned_words.append(w.get("word", "").strip())

                        text = " ".join(cleaned_words).strip()
                        if not text:
                            continue

                        # DUPLICATE WORD COLLAPSE (Immediate repetitions)
                        tokens = text.split()
                        collapsed = []
                        for i, t in enumerate(tokens):
                            if i > 0 and t.lower() == tokens[i-1].lower():
                                continue
                            collapsed.append(t)
                        text = " ".join(collapsed)

                        # FINAL FILTERING (Length vs Duration)
                        segment_real_dur = len(segment_bytes) / 32000.0
                        if len(text.split()) < 4 and segment_real_dur < 1.0:
                            # Reject fake endings like "Thank you."
                            logger.info(f"[Worker] Rejected short segment: {text}")
                            continue

                        # Attributed broadcast
                        speaker = getattr(self, 'current_speaker', 'Teacher')
                        attributed_text = f"{speaker}: {text}" if speaker != "Teacher" else text
                        
                        duration = end_time - start_time
                        
                        # Efficiency: Suppress redundant Whisper broadcasts for the Teacher
                        # if the browser is handling the immediate transcription.
                        if getattr(self, "use_browser_transcription", False) and speaker == "Teacher":
                            logger.info(f"[Worker] Suppressing Whisper broadcast for Teacher (Browser Transcription Active): {text}")
                        else:
                            await self.merge_and_send("final", attributed_text, start_time, end_time, duration, context=self.store.current_context)
                        
                        # Structured persistence
                        async with self.store.lock:
                            item = {
                                "seq": self.seq_counter,
                                "start": start_time,
                                "end": end_time,
                                "text": text,
                                "timestamp": datetime.utcnow()
                            }
                            if self.store.current_context:
                                item["context"] = self.store.current_context
                            self.store.transcript_buffer.append(item)
                            self.seq_counter += 1
                        
                        self.last_segment_end_time = end_time

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[Worker] Error: {e}")

    async def partial_worker(self):
        """Prefix Freezing logic for stable partials."""
        logger.info("[PartialWorker] Started")
        loop = asyncio.get_running_loop()
        
        while self.running:
            try:
                await asyncio.sleep(0.15) 

                if not self.segmenter.in_speech:
                    continue

                snippet = self.segmenter.get_active_buffer()
                if len(snippet) < 6400: # optimized from 9600 to 6400 (0.2s) for faster feedback
                    continue
                
                audio_np = np.frombuffer(snippet, dtype=np.int16)

                json_str = await loop.run_in_executor(
                    inference_executor,
                    whisper_instance.transcribe,
                    audio_np,
                    True,   # is_partial
                )
                
                if json_str:
                    data = json.loads(json_str)
                    segments = data.get("segments", [])
                    if segments:
                        raw_text = " ".join(s["text"] for s in segments)
                        new_words = raw_text.split()
                        
                        # PREFIX FREEZING
                        # Compare with last_partial_words
                        # Freeze words that stay identical for 2 consecutive updates
                        stable_idx = 0
                        min_len = min(len(new_words), len(self.last_partial_words))
                        
                        for i in range(min_len):
                            if new_words[i].lower() == self.last_partial_words[i].lower():
                                stable_idx = i + 1
                            else:
                                break
                        
                        # Only freeze words that were already "seen" once at that position
                        # In this simplified logic, we update the stable_prefix
                        if stable_idx > 0:
                            # Actually freeze words that survived more than one iteration
                            # (Here we just use the current match to advance the prefix)
                            self.stable_prefix = " ".join(new_words[:stable_idx])
                            unstable_tail = " ".join(new_words[stable_idx:])
                        else:
                            unstable_tail = raw_text
                            
                        self.last_partial_words = new_words
                        
                        display_text = (self.stable_prefix + " " + unstable_tail).strip()
                        await self.merge_and_send("partial", display_text)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[PartialWorker] Error: {e}")

    async def mongo_flusher(self):
        """
        STEP 5: PERSISTENCE TASK
        - Periodically flushes segment_queue to MongoDB.
        - Provides 'catch-up' data via the in-memory store.
        """
        logger.info("[Flusher] Started")
        try:
            while self.running:
                await asyncio.sleep(5) 
                await self.force_flush()
                if self.store: # Housekeeping: update store activity
                    self.store.last_active = datetime.utcnow()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[MongoFlusher] Error: {e}")

    async def force_flush(self, status=None, summary=None, concepts=None, questions=None, session_type=None, taxonomy=None):
        """Force write transcript buffer to DB and optionally update status/analysis."""
        async with self.store.lock:
            to_save = list(self.store.transcript_buffer)
            self.store.transcript_buffer = []

        if not to_save and not status and not summary:
            return

        update_ops = {}
        if to_save:
            update_ops["$push"] = {"transcripts": {"$each": to_save}}

        set_fields = {}
        if status: set_fields["status"] = status
        if summary: 
            set_fields["status"] = "finished"
            set_fields["summary"] = summary
        if concepts: set_fields["concepts"] = concepts
        if questions: set_fields["questions"] = questions
        if session_type: set_fields["session_type"] = session_type
        if taxonomy: set_fields["taxonomy"] = taxonomy
        if status == "finished": set_fields["ended_at"] = datetime.utcnow()
        
        # Atomic update of current context from store
        if self.store:
            async with self.store.lock:
                set_fields["current_context"] = self.store.current_context
                # Persist unique attendance list
                if self.store.attendance:
                    set_fields["attendance"] = [
                        {"name": name, "email": email} 
                        for name, email in self.store.attendance
                    ]

        # STATUS GUARD: Don't overwrite if session is already 'finished' or 'archived' in DB
        # unless we are explicitly setting it to finished.
        if status != "finished":
            session_doc = await sessions_collection.find_one({"session_id": self.session_id}, {"status": 1})
            if session_doc and session_doc.get("status") in ["finished", "archived"]:
                logger.info(f"[ForceFlush] Skipping status update to '{status}' because session {self.session_id} is already '{session_doc.get('status')}'.")
                # Clear out-of-date fields
                status = None
                if "status" in set_fields: del set_fields["status"]

        if set_fields:
            update_ops["$set"] = set_fields

        try:
            res = await sessions_collection.update_one(
                {"session_id": self.session_id},
                update_ops,
                upsert=True
            )
            if to_save:
                logger.info(f"[MongoFlusher] Flushed {len(to_save)} items for {self.session_id} (mod: {res.modified_count}).")
        except Exception as e:
            logger.error(f"[ForceFlush] Error writing to MongoDB for {self.session_id}: {e}")
            # Restore items to store buffer if it's not a terminal failure
            if self.store:
                async with self.store.lock:
                    self.store.transcript_buffer = to_save + self.store.transcript_buffer
                    if len(self.store.transcript_buffer) > 100:
                        self.store.transcript_buffer = self.store.transcript_buffer[-100:]


    async def merge_and_send_binary(self, binary_data):
        """Relay raw binary chunks (PCM or image frames) to all students."""
        if not self.running:
            return
            
        async with viewers_lock:
            viewers = active_viewers[self.session_id][:]
            
        if not viewers:
            return

        tasks = []
        dead_viewers = []
        for v_ws in viewers:
            # Don't send back to self (if teacher is in viewer list)
            if v_ws == self.ws:
                continue
            try:
                tasks.append(v_ws.send(binary_data))
            except Exception:
                dead_viewers.append(v_ws)
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
            
        if dead_viewers:
            async with viewers_lock:
                for dv in dead_viewers:
                    if dv in active_viewers[self.session_id]:
                        active_viewers[self.session_id].remove(dv)

    async def merge_and_send(self, msg_type, text=None, start=None, end=None, duration=None, context=None, frame=None, emoji=None):
        """Broadcast result to all registered viewers."""
        msg_payload = {
            "type": msg_type,
            "session_id": self.session_id
        }
        if text is not None: msg_payload["text"] = text
        if start is not None: msg_payload["start"] = start
        if end is not None: msg_payload["end"] = end
        if duration is not None: msg_payload["duration"] = duration
        if context is not None: msg_payload["context"] = context
        if frame is not None: msg_payload["frame"] = frame
        if emoji is not None: msg_payload["emoji"] = emoji
        
        msg = json.dumps(msg_payload)
        
        async with viewers_lock:
            viewers = active_viewers[self.session_id][:]
            
        if not viewers:
            return

        tasks = []
        dead_viewers = []
        for v_ws in viewers:
            try:
                # Check connection state safely — .closed attr varies by websockets version
                state = getattr(v_ws, 'closed', None)
                if state is True:
                    dead_viewers.append(v_ws)
                    continue
                tasks.append(v_ws.send(msg))
            except Exception:
                dead_viewers.append(v_ws)
        
        # Prune dead viewers
        if dead_viewers:
            async with viewers_lock:
                for dv in dead_viewers:
                    if dv in active_viewers[self.session_id]:
                        active_viewers[self.session_id].remove(dv)
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def merge_and_send_binary(self, data):
        """Broadcast raw binary data (audio) to all registered viewers."""
        async with viewers_lock:
            viewers = active_viewers[self.session_id][:]
            
        if not viewers:
            return

        tasks = []
        dead_viewers = []
        for v_ws in viewers:
            if v_ws == self.producer_ws:
                continue
            try:
                state = getattr(v_ws, 'closed', None)
                if state is True:
                    dead_viewers.append(v_ws)
                    continue
                tasks.append(v_ws.send(data))
            except Exception:
                dead_viewers.append(v_ws)
        
        # Prune dead viewers
        if dead_viewers:
            async with viewers_lock:
                for dv in dead_viewers:
                    if dv in active_viewers[self.session_id]:
                        active_viewers[self.session_id].remove(dv)
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def store_final_to_mongo(self, text):
        """No longer used directly, replaced by mongo_flusher."""
        pass

async def relay_audio(session_id, sender_ws, audio_bytes):
    # logger.info("Audio frame received") # Removed high-frequency log
    
    async with active_connections_lock:
        if session_id not in active_connections:
            return
        clients = list(active_connections[session_id].items())
        
    targets = [c_ws for c_ws, _ in clients if c_ws != sender_ws]
    logger.info(f"Target clients count: {len(targets)}")
    
    if not targets:
        return

    tasks = []
    dead_sockets = []
    for c_ws in targets:
        try:
            state = getattr(c_ws, 'closed', None)
            if state is True:
                dead_sockets.append(c_ws)
                continue
            tasks.append(c_ws.send(audio_bytes))
        except Exception as e:
            logger.error(f"Errors: {e}")
            dead_sockets.append(c_ws)

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res, c_ws in zip(results, [c for c in targets if c not in dead_sockets]):
            if isinstance(res, Exception):
                logger.error(f"Errors relaying: {res}")
                dead_sockets.append(c_ws)
        
    # logger.info("Audio frame relayed") # Removed high-frequency log

    if dead_sockets:
        async with active_connections_lock:
            if session_id in active_connections:
                for ds in dead_sockets:
                    if ds in active_connections[session_id]:
                        del active_connections[session_id][ds]

async def handle_client(ws):
    """
    Unified entry point. A single connection can:
    1. Subscribe to a session to see transcriptions.
    2. Initialize as a producer (microphone) for a session.
    3. Send raw audio bytes (legacy or active producer).
    """
    session_id = None
    is_producer = False
    audio_session = None

    try:
        async for message in ws:
            if isinstance(message, str):
                try:
                    data = json.loads(message)
                    m_type = data.get("type")

                    if m_type == "subscribe":
                        target_sid = data.get("session_id")
                        if target_sid:
                            async with viewers_lock:
                                if ws not in active_viewers[target_sid]:
                                    active_viewers[target_sid].append(ws)
                            logger.info(f"Viewer subscribed to session: {target_sid}")
                            
                            # Fetch current context & recent transcripts to sync immediate
                            session_id = target_sid
                            session_doc = await sessions_collection.find_one({"session_id": target_sid})
                            
                            # 1. Look for a persistent session store
                            store = await get_or_create_store(target_sid)
                            
                            # 2. Sync Context
                            ctx = store.current_context
                            # Fallback to DB if store has no context (rare)
                            if ctx.get("type") == "none" and session_doc:
                                ctx = session_doc.get("current_context", ctx)
                                
                            if ctx:
                                logger.info(f"Syncing initial context to new viewer: {ctx}")
                                await ws.send(json.dumps({
                                    "type": "context_sync",
                                    "session_id": target_sid,
                                    "context": ctx
                                }))
                                
                                # 3. Sync Last Screen Frame if applicable
                                if ctx.get("type") == "screen" and store.last_screen_frame:
                                    await ws.send(json.dumps({
                                        "type": "screen_frame",
                                        "session_id": target_sid,
                                        "frame": store.last_screen_frame
                                    }))

                            # 4. Sync un-flushed transcripts from memory store
                            async with store.lock:
                                in_mem_transcripts = list(store.transcript_buffer)
                                
                            for t in in_mem_transcripts:
                                await ws.send(json.dumps({
                                    "type": "final",
                                    "session_id": target_sid,
                                    "text": t["text"],
                                    "start": t["start"],
                                    "end": t.get("end"),
                                    "context": t.get("context")
                                }))
                            
                            # Broadcast participant count update
                            async with viewers_lock:
                                count = len(active_viewers[target_sid])
                                participants = []
                                for v_ws, info in store.participants.items():
                                    async with active_connections_lock:
                                        role = active_connections.get(target_sid, {}).get(v_ws, "student")
                                    participants.append({"name": info.get("name", "Student"), "role": role})
                                    
                                participant_msg = json.dumps({
                                    "type": "participant_count",
                                    "session_id": target_sid,
                                    "count": count,
                                    "participants": participants
                                })
                                # Broadcast to all
                                tasks = [v.send(participant_msg) for v in active_viewers[target_sid]]
                                if tasks:
                                    await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "join":
                        target_sid = data.get("session_id")
                        user_name = data.get("name", "Student")
                        user_email = data.get("email", "unknown@email.com")
                        role = data.get("role", "student")
                        
                        if target_sid:
                            # CRITICAL: Set the outer session_id so binary relay works
                            session_id = target_sid
                            
                            async with active_connections_lock:
                                if target_sid not in active_connections:
                                    active_connections[target_sid] = {}
                                active_connections[target_sid][ws] = role
                                
                            store = await get_or_create_store(target_sid)
                            async with store.lock:
                                store.participants[ws] = {"name": user_name, "email": user_email}
                                store.attendance.add((user_name, user_email))
                            
                            # Add to active_viewers so they receive transcript relay
                            async with viewers_lock:
                                if ws not in active_viewers[target_sid]:
                                    active_viewers[target_sid].append(ws)
                            
                            logger.info(f"User {user_name} ({user_email}) joined session {target_sid} as {role}")
                            
                            # Broadcast updated participant list to all
                            async with viewers_lock:
                                participants = []
                                for v_ws, info in store.participants.items():
                                    async with active_connections_lock:
                                        role = active_connections.get(target_sid, {}).get(v_ws, "student")
                                    participants.append({"name": info.get("name", "Student"), "role": role})
                                    
                                msg = json.dumps({
                                    "type": "participant_count",
                                    "session_id": target_sid,
                                    "count": len(participants),
                                    "participants": participants
                                })
                                v_list = active_viewers[target_sid][:]
                                tasks = [v.send(msg) for v in v_list]
                                if tasks:
                                    await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "p_init":
                        target_sid = data.get("session_id")
                        if not target_sid:
                            await ws.send(json.dumps({"type": "error", "message": "session_id required"}))
                            continue
                        
                        session_id = target_sid
                        is_producer = True
                        logger.info(f"Producer initializing for session: {session_id}")
                        
                        async with active_connections_lock:
                            if session_id not in active_connections:
                                active_connections[session_id] = {}
                            active_connections[session_id][ws] = "teacher"
                        
                        # Register as a viewer too so we see our own results
                        async with viewers_lock:
                            if ws not in active_viewers[session_id]:
                                active_viewers[session_id].append(ws)
                        
                        async with registry_lock:
                            # Re-use existing session if possible (teacher refresh/re-init)
                            if session_id in active_audio_sessions:
                                audio_session = active_audio_sessions[session_id]
                                audio_session.ws = ws # update to current websocket
                                logger.info(f"Re-init existing AudioSession for {session_id}")
                            else:
                                audio_session = AudioSession(ws, session_id)
                                active_audio_sessions[session_id] = audio_session
                                asyncio.create_task(audio_session.start())
                            
                        await ws.send(json.dumps({
                            "type": "session_id",
                            "session_id": session_id,
                            "role": "producer"
                        }))

                    elif m_type in ["update_context", "context_update"]:
                        target_sid = data.get("session_id")
                        new_ctx = data.get("context")
                        if target_sid and new_ctx:
                            # Normalize type: 'none'
                            if not new_ctx or not isinstance(new_ctx, dict) or not new_ctx.get("type"):
                                new_ctx = {"type": "none"}
                            
                            # Store in the persistent SessionStore
                            store = await get_or_create_store(target_sid)
                            async with store.lock:
                                store.current_context = new_ctx
                                # Clear screen frame if no longer sharing screen
                                if new_ctx.get("type") != "screen":
                                    store.last_screen_frame = None
                                
                            logger.info(f"Context updated for {target_sid}: {new_ctx}")
                            
                            # Broadcast to all viewers
                            async with viewers_lock:
                                vws_list = active_viewers.get(target_sid, [])
                                for vws in vws_list:
                                    try:
                                        await vws.send(json.dumps({
                                            "type": "context_sync",
                                            "session_id": target_sid,
                                            "context": new_ctx
                                        }))
                                    except: pass

                    elif m_type == "screen_frame":
                        target_sid = data.get("session_id")
                        frame = data.get("frame")
                        if target_sid and frame:
                            # Persist in persistent SessionStore
                            store = await get_or_create_store(target_sid)
                            async with store.lock:
                                store.last_screen_frame = frame
                                
                            msg = json.dumps({"type": "screen_frame", "session_id": target_sid, "frame": frame})
                            async with viewers_lock:
                                viewers = active_viewers.get(target_sid, [])[:]
                            tasks = [v.send(msg) for v in viewers if v != ws]
                            if tasks:
                                await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "webcam_frame":
                        target_sid = data.get("session_id")
                        frame = data.get("frame")
                        if target_sid and frame:
                            msg = json.dumps({"type": "webcam_frame", "session_id": target_sid, "frame": frame})
                            async with viewers_lock:
                                viewers = active_viewers.get(target_sid, [])[:]
                            tasks = [v.send(msg) for v in viewers if v != ws]
                            if tasks:
                                await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "reaction":
                        # Student sending a reaction (emoji) - Relay to all (including teacher)
                        target_sid = data.get("session_id")
                        reaction = data.get("reaction")
                        if target_sid and reaction:
                            # Use merge_and_send if we have an audio_session, else manual broadcast
                            if audio_session:
                                await audio_session.merge_and_send("reaction", emoji=reaction, text=data.get("sender", "Student"))
                            else:
                                msg = json.dumps({
                                    "type": "reaction",
                                    "session_id": target_sid,
                                    "emoji": reaction,
                                    "sender": data.get("sender", "Student")
                                })
                                async with viewers_lock:
                                    viewers = active_viewers[target_sid][:]
                                tasks = [v.send(msg) for v in viewers]
                                if tasks:
                                    await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "submit_doubt":
                        # Student submitting a manual doubt
                        target_sid = data.get("session_id")
                        text = data.get("text")
                        sender = data.get("sender", "Student")
                        if target_sid and text:
                            logger.info(f"Doubt received from {sender}: {text}")
                            # Relay to ALL (including teacher so they see it on their board)
                            msg = json.dumps({
                                "type": "new_doubt",
                                "session_id": target_sid,
                                "text": text,
                                "sender": sender,
                                "timestamp": datetime.utcnow().isoformat()
                            })
                            async with viewers_lock:
                                viewers = active_viewers[target_sid][:]
                            tasks = [v.send(msg) for v in viewers]
                            if tasks:
                                await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "raise_hand":
                        # Student raising hand - Relay to all
                        target_sid = data.get("session_id")
                        sender = data.get("sender", "Student")
                        if target_sid:
                            msg = json.dumps({
                                "type": "raise_hand",
                                "session_id": target_sid,
                                "sender": sender
                            })
                            async with viewers_lock:
                                viewers = active_viewers[target_sid][:]
                            tasks = [v.send(msg) for v in viewers]
                            if tasks:
                                await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "pop_quiz":
                        # Teacher launches a pop quiz — broadcast to all viewers (students)
                        target_sid = data.get("session_id")
                        question = data.get("question", "")
                        duration = data.get("duration", 60)
                        sender = data.get("sender", "Teacher")
                        if target_sid and question:
                            logger.info(f"Pop quiz launched in session {target_sid}: {question[:60]}")
                            msg = json.dumps({
                                "type": "pop_quiz",
                                "session_id": target_sid,
                                "question": question,
                                "duration": duration,
                                "sender": sender
                            })
                            async with viewers_lock:
                                viewers = active_viewers[target_sid][:]
                            tasks = [v.send(msg) for v in viewers]
                            if tasks:
                                await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "quiz_response":
                        # Student submits graded quiz response — relay to all (teacher sees it)
                        target_sid = data.get("session_id")
                        if target_sid:
                            logger.info(f"Quiz response received from {data.get('student_name', 'Student')} in {target_sid}")
                            msg = json.dumps({
                                "type": "quiz_response",
                                "session_id": target_sid,
                                "student_name": data.get("student_name", "Student"),
                                "score": data.get("score", 0),
                                "grade": data.get("grade", "?"),
                                "feedback": data.get("feedback", ""),
                                "answer": data.get("answer", ""),
                                "timestamp": datetime.utcnow().isoformat()
                            })
                            async with viewers_lock:
                                viewers = active_viewers[target_sid][:]
                            tasks = [v.send(msg) for v in viewers]
                            if tasks:
                                await asyncio.gather(*tasks, return_exceptions=True)

                    elif m_type == "browser_transcript":
                        target_sid = data.get("session_id")
                        text = data.get("text")
                        is_final = data.get("is_final", False)
                        
                        if target_sid and text:
                            # Identify Speaker
                            if is_producer:
                                speaker = "Teacher"
                            else:
                                store = await get_or_create_store(target_sid)
                                async with store.lock:
                                    student_info = store.participants.get(ws, {})
                                    speaker = student_info.get("name", "Student")
                            
                            if audio_session:
                                audio_session.use_browser_transcription = True
                            
                            msg_type = "final" if is_final else "partial"
                            attributed_text = f"{speaker}: {text}" if speaker != "Teacher" else text
                            
                            # Aggressive Content De-duplication: Skip if text matches any of the last 2 entries
                            if is_final and audio_session:
                                if audio_session.store.transcript_buffer:
                                    last_entries = audio_session.store.transcript_buffer[-2:]
                                    if any(e["text"].strip() == attributed_text.strip() for e in last_entries):
                                        return

                            if audio_session:
                                await audio_session.merge_and_send(msg_type, text=attributed_text)
                            else:
                                msg = json.dumps({"type": msg_type, "session_id": target_sid, "text": attributed_text})
                                async with viewers_lock:
                                    viewers = active_viewers.get(target_sid, [])[:]
                                tasks = [v.send(msg) for v in viewers]
                                if tasks: await asyncio.gather(*tasks, return_exceptions=True)

                            # If final, persist to MongoDB for the project history
                            if is_final and audio_session:
                                start_time = audio_session.cumulative_offset
                                async with audio_session.store.lock:
                                    item = {
                                        "seq": audio_session.seq_counter,
                                        "start": start_time,
                                        "text": attributed_text,
                                        "timestamp": datetime.utcnow(),
                                        "method": "browser"
                                    }
                                    if audio_session.store.current_context:
                                        item["context"] = audio_session.store.current_context
                                    audio_session.store.transcript_buffer.append(item)
                                    audio_session.seq_counter += 1

                    elif m_type in ["stop_session", "session_terminated"]:
                        # Explicit stop from the teacher (either via REST or WS)
                        target_sid = data.get("session_id")
                        if target_sid:
                            logger.info(f"Stop request received for session {target_sid} via WebSocket.")
                            async with registry_lock:
                                audio_session = active_audio_sessions.get(target_sid)
                                if audio_session:
                                    audio_session.running = False
                                    # Trigger a flush with 'finished' status
                                    await audio_session.force_flush(status="finished")
                                    audio_session._session_done.set()

                except json.JSONDecodeError:
                    logger.warning("Received invalid JSON string")
            
            elif isinstance(message, bytes):
                if session_id:
                    await relay_audio(session_id, ws, message)

                # If we don't have a session_id yet, treat as legacy producer
                if not session_id:
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    session_id = f"legacy-{timestamp}"
                    logger.info(f"Starting legacy producer session: {session_id}")
                    
                    is_producer = True
                    async with viewers_lock:
                        active_viewers[session_id].append(ws)
                    
                    audio_session = AudioSession(ws, session_id)
                    asyncio.create_task(audio_session.start(initial_chunk=message))
                
                else:
                    if not audio_session:
                        async with registry_lock:
                            audio_session = active_audio_sessions.get(session_id)
                            
                    if audio_session:
                        if is_producer:
                            # Teacher audio -> Transcribe
                            audio_session.current_speaker = "Teacher"
                        else:
                            # Student audio -> Transcribe
                            store = await get_or_create_store(session_id)
                            async with store.lock:
                                student_info = store.participants.get(ws, {})
                                student_name = student_info.get("name", "Student")
                            audio_session.current_speaker = student_name
                            
                        audio_session.process_audio_chunk(message)

    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        logger.error(f"Handler error: {e}")
    finally:
        # Signal session to finish teardown
        if audio_session:
            audio_session.running = False
            audio_session._session_done.set()
            # Remove from active registry if this was the current producer
            async with registry_lock:
                if active_audio_sessions.get(session_id) == audio_session:
                    del active_audio_sessions[session_id]
        # Cleanup viewer registry
        if session_id:
            async with active_connections_lock:
                if session_id in active_connections and ws in active_connections[session_id]:
                    del active_connections[session_id][ws]
                    
            async with viewers_lock:
                if ws in active_viewers[session_id]:
                    active_viewers[session_id].remove(ws)
                
                # Cleanup participant list
                store = await get_or_create_store(session_id)
                async with store.lock:
                    if ws in store.participants:
                        del store.participants[ws]
                
                # Broadcast updated list
                participants = []
                for v_ws, info in store.participants.items():
                    async with active_connections_lock:
                        role = active_connections.get(session_id, {}).get(v_ws, "student")
                    participants.append({"name": info.get("name", "Student"), "role": role})

                msg = json.dumps({
                    "type": "participant_count",
                    "session_id": session_id,
                    "count": len(participants),
                    "participants": participants
                })
                tasks = [v.send(msg) for v in active_viewers[session_id]]
                if tasks:
                    async def _disconnect_broadcast():
                        await asyncio.gather(*tasks, return_exceptions=True)
                    asyncio.create_task(_disconnect_broadcast())
        
        logger.info(f"Connection closed for session: {session_id}")

async def main():
    print("Initializing...")
    # init_audio_file is now per-session
    
    print("Starting Audio Service on 0.0.0.0:8765")
    async with websockets.serve(
        handle_client, 
        "0.0.0.0", 
        8765,
        ping_interval=10, 
        ping_timeout=300,
        max_size=20000000 # 20MB for large PDF/image shares
    ):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    # Windows support for ProcessPoolExecutor
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
