import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
from datetime import datetime, timezone

async def check():
    uri = "mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority"
    client = AsyncIOMotorClient(
        uri,
        tls=True,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=5000
    )
    db = client.smart_classroom
    
    target = "be14a024"
    print(f"Searching for sessions related to: {target}")
    
    # Search by session_id prefix or subject_id
    cursor = db.sessions.find({
        "$or": [
            {"session_id": {"$regex": f"^{target}"}},
            {"subject_id": target},
            {"subject": target}
        ]
    })
    
    found = False
    async for s in cursor:
        found = True
        print(f"\nSession ID: {s.get('session_id')}")
        print(f"Status: {s.get('status')}")
        print(f"Teacher: {s.get('teacher_email')}")
        print(f"Started At: {s.get('started_at')}")
        print(f"Ended At: {s.get('ended_at')}")
    
    if not found:
        print(f"No sessions found for {target}")

if __name__ == "__main__":
    asyncio.run(check())
