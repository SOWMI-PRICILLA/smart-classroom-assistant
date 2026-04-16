import asyncio
import os
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority")

async def check():
    print(f"Connecting to: {MONGO_URI.split('@')[-1]}")
    client = AsyncIOMotorClient(
        MONGO_URI,
        tls=True,
        tlsCAFile=certifi.where()
    )
    db = client["smart_classroom"]
    
    subjects_count = await db["subjects"].count_documents({})
    sessions_count = await db["sessions"].count_documents({})
    users_count = await db["users"].count_documents({})
    
    print(f"Subjects: {subjects_count}")
    print(f"Sessions: {sessions_count}")
    print(f"Users: {users_count}")
    
    if subjects_count > 0:
        s = await db["subjects"].find_one({})
        print(f"Sample Subject: {s.get('subject_name')} ({s.get('subject_id')})")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
