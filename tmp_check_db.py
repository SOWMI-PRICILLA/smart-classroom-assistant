import asyncio
import os
import certifi
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI")

async def check_data():
    client = AsyncIOMotorClient(
        MONGO_URI,
        tls=True,
        tlsCAFile=certifi.where()
    )
    db = client["smart_classroom"]
    
    collections = {
        "ANNOUNCEMENTS": db["announcements"],
        "MATERIALS": db["subject_materials"],
        "ASSIGNMENTS": db["assignments"],
        "SESSIONS": db["sessions"]
    }
    
    for name, coll in collections.items():
        print(f"--- {name} ---")
        # Try to find any doc
        docs = await coll.find().sort([('_id', -1)]).to_list(length=1)
        if docs:
            print(docs[0])
            # Check for timestamp fields
            doc = docs[0]
            for field in ['created_at', 'timestamp', 'date', 'started_at']:
                if field in doc:
                    print(f"Found timestamp field: {field} = {doc[field]}")
        else:
            print("No documents found.")
            
    client.close()

if __name__ == "__main__":
    asyncio.run(check_data())
