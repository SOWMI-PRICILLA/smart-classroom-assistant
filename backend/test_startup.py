import asyncio
import os
import sys
from dotenv import load_dotenv

# Ensure we're in the right directory
load_dotenv()

print(f"DEBUG: Current Working Directory: {os.getcwd()}")
print(f"DEBUG: MONGO_URI exists: {bool(os.getenv('MONGO_URI'))}")

try:
    print("DEBUG: Importing app...")
    from backend.app import app, startup_event
    print("DEBUG: Import successful")
    
    async def run_startup():
        print("DEBUG: Running startup_event()...")
        try:
            await startup_event()
            print("DEBUG: startup_event() completed successfully")
        except Exception as e:
            print(f"DEBUG: startup_event() FAILED: {e}")
            import traceback
            traceback.print_exc()

    asyncio.run(run_startup())
    print("DEBUG: Test script finished")

except Exception as e:
    print(f"DEBUG: CRITICAL Import failure: {e}")
    import traceback
    traceback.print_exc()
