import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.db import sessions_collection, init_db

async def check():
    await init_db()
    total = await sessions_collection.count_documents({"summary": {"$exists": True, "$ne": None, "$ne": ""}})
    with_audio = await sessions_collection.count_documents({"audio_summary_url": {"$exists": True, "$ne": None, "$ne": ""}})
    
    with open("db_stats.txt", "w") as f:
        f.write(f"Total sessions with summary: {total}\n")
        f.write(f"Sessions with audio summary: {with_audio}\n")
        
        cursor = sessions_collection.find({"audio_summary_url": {"$exists": True, "$ne": None, "$ne": ""}}, sort=[("started_at", -1)]).limit(5)
        recent = await cursor.to_list(length=5)
        for r in recent:
            f.write(f"Session: {r.get('session_id')} - URL: {r.get('audio_summary_url')}\n")

if __name__ == "__main__":
    asyncio.run(check())
