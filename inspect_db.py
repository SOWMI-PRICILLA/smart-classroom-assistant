import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
import os
import json

MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority")

async def check_db():
    client = AsyncIOMotorClient(MONGO_URI, tls=True, tlsCAFile=certifi.where())
    db = client["smart_classroom"]
    sessions_collection = db["sessions"]
    
    # Let's find the latest session or the one in the screenshot if we can
    session_id = "2642f849" # From user screenshot
    session = await sessions_collection.find_one({"session_id": session_id})
    
    if session:
        print(f"Session ID: {session.get('session_id')}")
        print(f"Status: {session.get('status')}")
        print(f"Subject: {session.get('subject')}")
        transcripts = session.get("transcripts", [])
        chunks = session.get("transcript_chunks", [])
        print(f"Transcripts count: {len(transcripts)}")
        print(f"Chunks count: {len(chunks)}")
        if transcripts:
            print("First 2 transcripts:")
            print(json.dumps(transcripts[:2], default=str))
            print("Last 2 transcripts:")
            print(json.dumps(transcripts[-2:], default=str))
    else:
        print(f"Session {session_id} NOT found.")
        
        # List all active sessions
        async for s in sessions_collection.find({"status": "active"}):
            print(f"Active Session: {s.get('session_id')} | Created: {s.get('started_at')}")

if __name__ == "__main__":
    asyncio.run(check_db())
