import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

async def discover():
    uri = "mongodb+srv://classroom_admin:Classroom123@cluster0.iadryrl.mongodb.net/smart_classroom?retryWrites=true&w=majority"
    print(f"Connecting to: {uri.split('@')[-1]}")
    
    # Try with specialized options for better connectivity
    client = AsyncIOMotorClient(
        uri,
        tls=True,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=20000,
        connectTimeoutMS=20000
    )
    
    try:
        print("Listing databases...")
        dbs = await client.list_database_names()
        print(f"Databases: {dbs}")
        
        for db_name in dbs:
            if db_name in ["admin", "local", "config"]: continue
            db = client[db_name]
            collections = await db.list_collection_names()
            print(f"DB '{db_name}' collections: {collections}")
            
            for col_name in collections:
                count = await db[col_name].count_documents({})
                print(f"  - {col_name}: {count} documents")
                
    except Exception as e:
        print(f"Discovery failed: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(discover())
