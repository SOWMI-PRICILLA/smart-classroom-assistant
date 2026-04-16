from motor.motor_asyncio import AsyncIOMotorClient
import certifi
import os

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise ValueError("MONGO_URI not set in environment variables")

client = AsyncIOMotorClient(
    MONGO_URI,
    tls=True,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=20000,
    retryWrites=True,
    heartbeatFrequencyMS=10000  # Keep connections alive
)

db = client["smart_classroom"]

students_collection = db["students"]
sessions_collection = db["sessions"]
summaries_collection = db["summaries"]
subjects_collection = db["subjects"]
users_collection = db["users"]
timetable_collection = db["timetable"]
teacher_timetables_collection = db["teacher_timetables"]
student_timetables_collection = db["student_timetables"]

announcements_collection = db["announcements"]
subject_materials_collection = db["subject_materials"]
assignments_collection = db["assignments"]
assignment_submissions_collection = db["assignment_submissions"]
concept_resources_collection = db["concept_resources"]
quizzes_collection = db["quizzes"]
quiz_submissions_collection = db["quiz_submissions"]

async def init_db():
    try:
        # --- Indexes for Performance ---
        await sessions_collection.create_index([("session_id", 1)], unique=True)
        await sessions_collection.create_index([("started_at", -1)])
        await sessions_collection.create_index([("status", 1)])
        await sessions_collection.create_index([("subject_id", 1)])
        
        # UNIQUE INDEX: (subject_name, department, year, section, academic_year)
        await subjects_collection.create_index([
            ("subject_name", 1),
            ("department", 1),
            ("year", 1),
            ("section", 1),
            ("academic_year", 1)
        ], unique=True)
        await subjects_collection.create_index([("subject_id", 1)], unique=True)
        
        await users_collection.create_index([("email", 1)], unique=True)
        await timetable_collection.create_index([("day_index", 1), ("start_time", 1)])
        
        # Timetable indexes
        await teacher_timetables_collection.create_index([("faculty_id", 1), ("academic_year", 1), ("month", 1)], unique=True)
        await student_timetables_collection.create_index([("department", 1), ("year", 1), ("section", 1), ("academic_year", 1), ("month", 1)], unique=True)
        print("Database indexes initialized successfully.")
    except Exception as e:
        print(f"Warning: Database index initialization failed: {e}")
