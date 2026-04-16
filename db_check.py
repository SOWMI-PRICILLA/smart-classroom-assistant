import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

async def check():
    client = AsyncIOMotorClient('mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority', tls=True, tlsCAFile=certifi.where())
    db = client['smart_classroom']
    
    print("Checking student user 'Sowmi'...")
    user = await db['users'].find_one({"role": "student"})
    if user:
        print(f"User: {user.get('email')}")
        print(f"Enrolled subjects: {user.get('enrolled_subjects')}")
        
    print("\nChecking the session from the screenshot...")
    session = await db['sessions'].find_one({"session_id": "53423436-2ef3-4dfb-b899-ccbe63284f71-20260323_231038"})
    if session:
        print(f"Session subject_id: {session.get('subject_id')}")
        print(f"Session subject: {session.get('subject')}")

asyncio.run(check())
