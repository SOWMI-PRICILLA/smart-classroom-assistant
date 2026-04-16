import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
import json

async def check():
    client = AsyncIOMotorClient('mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority', tls=True, tlsCAFile=certifi.where())
    db = client['smart_classroom']
    
    print("Checking materials for active session...")
    s = await db['sessions'].find_one({'session_id': '53423436-2ef3-4dfb-b899-ccbe63284f71-20260323_213515'})
    if s:
        materials = s.get("teaching_materials", [])
        print(f"Materials count: {len(materials)}")
        if materials:
            print("Materials:", materials)
    else:
        print("Session not found.")

asyncio.run(check())
