import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

async def check():
    client = AsyncIOMotorClient('mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority', tls=True, tlsCAFile=certifi.where())
    db = client['smart_classroom']
    s = await db['sessions'].find_one({'session_id': '53423436-2ef3-4dfb-b899-ccbe63284f71-20260323_213515'})
    if s:
        transcripts = s.get("transcripts", [])
        print(f"Transcripts count: {len(transcripts)}")
        if transcripts:
            print("First transcript keys:", transcripts[0].keys())
            print("First transcript start:", transcripts[0].get("start"))

asyncio.run(check())
