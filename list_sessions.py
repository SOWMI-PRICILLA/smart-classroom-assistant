import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
import os
import json

MONGO_URI = "mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority"

async def check_db():
    client = AsyncIOMotorClient(MONGO_URI, tls=True, tlsCAFile=certifi.where())
    db = client["smart_classroom"]
    sessions_collection = db["sessions"]
    
    print("Listing latest 10 sessions:")
    async for s in sessions_collection.find().sort("started_at", -1).limit(10):
         print(f"ID: {s.get('session_id')} | Status: {s.get('status')} | Created: {s.get('started_at')}")
         transcripts = s.get("transcripts", [])
         print(f"  Transcripts: {len(transcripts)}")

if __name__ == "__main__":
    asyncio.run(check_db())
