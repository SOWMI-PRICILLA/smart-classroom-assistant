import re
from backend.utils.vector_store import vector_store
from pypdf import PdfReader
import os
import logging

logger = logging.getLogger(__name__)

def chunk_text(text, chunk_size=500, overlap=100):
    """
    Simple overlapping chunking logic.
    """
    if not text:
        return []
        
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += (chunk_size - overlap)
        
    return chunks

def index_session_transcript(session_id, transcripts):
    """
    Chunks and indexes the session transcript.
    """
    if not transcripts:
        return
        
    # Combine transcript segments
    full_text = " ".join([t.get("text", "") if isinstance(t, dict) else str(t) for t in transcripts])
    
    chunks = chunk_text(full_text)
    metadatas = [{"type": "transcript", "chunk_index": i} for i in range(len(chunks))]
    
    vector_store.add_texts(chunks, metadatas, session_id)
    logger.info(f"Indexed transcript for session {session_id}")

def index_material(session_id, material_path, material_id, material_title):
    """
    Extracts text from PDF and indexes it.
    """
    if not os.path.exists(material_path) or not material_path.lower().endswith(".pdf"):
        logger.warning(f"Material {material_path} skipped (not a PDF or not found)")
        return
        
    try:
        reader = PdfReader(material_path)
        text_content = ""
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                # Add each page as a chunk to preserve page context
                vector_store.add_texts(
                    [page_text], 
                    [{"type": "material", "material_id": material_id, "page": i+1, "title": material_title}], 
                    session_id
                )
        logger.info(f"Indexed PDF material {material_title} for session {session_id}")
    except Exception as e:
        logger.error(f"Failed to index material {material_path}: {e}")
