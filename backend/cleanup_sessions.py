import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
from datetime import datetime, timezone

async def cleanup():
    uri = "mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority"
    client = AsyncIOMotorClient(
        uri,
        tls=True,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=5000
    )
    db = client.smart_classroom
    
    session_id = "be14a024-5289-4d08-a59d-53a02c9d0fe8-20260327_131520"
    print(f"Targeting session: {session_id}")
    
    result = await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "finished",
            "ended_at": datetime.now(timezone.utc),
            "current_context": {"type": "none"}
        }}
    )
    
    if result.modified_count > 0:
        print(f"Successfully marked session {session_id} as finished.")
    else:
        print(f"Session {session_id} was not modified (maybe already finished or not found).")

if __name__ == "__main__":
    asyncio.run(cleanup())
