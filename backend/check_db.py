import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

async def check():
    uri = "mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority"
    client = AsyncIOMotorClient(
        uri,
        tls=True,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=5000
    )
    db = client.smart_classroom
    
    session_id = "be14a024-5289-4d08-a59d-53a02c9d0fe8-20260327_131520"
    s = await db.sessions.find_one({"session_id": session_id})
    if s:
        print(f"Session found: {session_id}")
        print(f"Status: {s.get('status')}")
        print(f"Teacher: {s.get('teacher_email')}")
    else:
        print(f"Session NOT found: {session_id}")
        
    print("\nListing all active sessions:")
    cursor = db.sessions.find({"status": "active"})
    async for doc in cursor:
        print(f" - {doc.get('session_id')} (Subject: {doc.get('subject_id') or doc.get('subject')})")

if __name__ == "__main__":
    asyncio.run(check())
