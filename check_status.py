import asyncio
from backend.db import sessions_collection

async def check():
    session = await sessions_collection.find_one({"session_id": {"$regex": "555f2447"}})
    if session:
        print(f"ID: {session.get('session_id')}")
        print(f"Status: {session.get('status')}")
    else:
        print("Session not found")

if __name__ == "__main__":
    asyncio.run(check())
