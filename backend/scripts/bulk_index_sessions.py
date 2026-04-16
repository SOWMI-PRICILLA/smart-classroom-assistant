import os
import sys
import asyncio
import logging
from datetime import datetime, timezone

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.db import sessions_collection, init_db
from backend.utils.indexer import index_session_transcript
from backend.utils.vector_store import vector_store

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def bulk_index():
    logger.info("Starting bulk indexing of all finished sessions...")
    
    # Ensure DB is initialized
    await init_db()
    
    # 1. Fetch all finished sessions
    sessions = await sessions_collection.find({"status": "finished"}).to_list(length=1000)
    logger.info(f"Found {len(sessions)} finished sessions in MongoDB.")
    
    indexed_count = 0
    skipped_count = 0
    
    for session in sessions:
        session_id = session.get("session_id")
        transcripts = session.get("transcripts") or session.get("transcript_chunks") or []
        
        if not transcripts:
            logger.warning(f"Session {session_id} has no transcripts. Skipping.")
            skipped_count += 1
            continue
            
        try:
            # Trigger indexing (idempotent thanks to recent VectorStore update)
            # We run it in a thread like the app does to avoid blocking
            await asyncio.to_thread(index_session_transcript, session_id, transcripts)
            logger.info(f"Successfully indexed session: {session_id}")
            indexed_count += 1
        except Exception as e:
            logger.error(f"Failed to index session {session_id}: {e}")
            
    logger.info("--- Bulk Indexing Complete ---")
    logger.info(f"Indexed: {indexed_count}")
    logger.info(f"Skipped: {skipped_count}")
    logger.info(f"Total processed: {len(sessions)}")

if __name__ == "__main__":
    asyncio.run(bulk_index())
