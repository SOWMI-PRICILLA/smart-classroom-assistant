import asyncio
import uuid
import os
import certifi
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI")

async def seed_notifs():
    client = AsyncIOMotorClient(
        MONGO_URI,
        tls=True,
        tlsCAFile=certifi.where()
    )
    db = client["smart_classroom"]
    
    announcements_collection = db["announcements"]
    subject_materials_collection = db["subject_materials"]
    assignments_collection = db["assignments"]
    
    subj_id = 'CS101'
    
    await announcements_collection.insert_one({
        'announcement_id': str(uuid.uuid4()),
        'subject_id': subj_id,
        'title': 'Final Exam Schedule',
        'content': 'Exam is next Monday',
        'created_at': datetime.now(timezone.utc),
        'author_name': 'Dr. Aris'
    })
    
    await subject_materials_collection.insert_one({
        'material_id': str(uuid.uuid4()),
        'subject_id': subj_id,
        'title': 'Deep Learning Notes',
        'type': 'pdf',
        'url': '/files/notes.pdf',
        'uploaded_at': datetime.now(timezone.utc),
        'uploaded_by': 'Dr. Aris'
    })
    
    await assignments_collection.insert_one({
        'assignment_id': str(uuid.uuid4()),
        'subject_id': subj_id,
        'title': 'Neural Networks Lab',
        'description': 'Implement a 3rd layer',
        'due_date': '2026-04-10',
        'created_at': datetime.now(timezone.utc)
    })
    
    print('Seed data created successfully')
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_notifs())
