import os
from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer
import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# --- Configuration ---
QDRANT_PATH = os.path.join(os.path.dirname(__file__), "..", "storage", "qdrant_db")
os.makedirs(QDRANT_PATH, exist_ok=True)

COLLECTION_NAME = "classroom_knowledge"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"  # 384 dimensions

class VectorStore:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VectorStore, cls).__new__(cls)
            cls._instance._init_client()
        return cls._instance

    def _init_client(self):
        try:
            self.client = QdrantClient(path=QDRANT_PATH)
            self.model = SentenceTransformer(EMBEDDING_MODEL_NAME)
            self.sync_collection()
        except Exception as e:
            logger.error(f"Failed to initialize Qdrant: {e}")
            raise

    def sync_collection(self):
        """Ensures the collection exists and is optimized for filtering by session_id."""
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == COLLECTION_NAME for c in collections)
            
            if not exists:
                self.client.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE),
                )
                logger.info(f"Created Qdrant collection: {COLLECTION_NAME}")
                
            # --- Payload Indexing for session_id ---
            # This is critical for fast and reliable filtering
            self.client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name="session_id",
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
            logger.info("Payload index for 'session_id' verified/created.")
        except Exception as e:
            logger.warning(f"Collection sync warning: {e}")

    def recreate_collection(self):
        """Wipes and recreates the collection to ensure a clean state."""
        try:
            self.client.recreate_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE),
            )
            self.client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name="session_id",
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
            logger.info(f"Recreated collection {COLLECTION_NAME} with payload index.")
        except Exception as e:
            logger.error(f"Failed to recreate collection: {e}")

    def add_texts(self, texts, metadatas, session_id):
        """
        Embeds and adds multiple text chunks to the vector store.
        Deletes old chunks for this session first to maintain idempotency.
        """
        if not texts:
            return
        
        # Ensure session_id is a clean string
        sid = str(session_id).strip()
        
        # --- IDEMPOTENCY: Clear old chunks for this session ---
        try:
            self.client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="session_id",
                            match=models.MatchValue(value=sid)
                        )
                    ]
                )
            )
        except Exception as e:
            logger.warning(f"Failed to clear old chunks for session {sid}: {e}")

        embeddings = self.model.encode(texts).tolist()
        
        points = []
        for i, (text, meta) in enumerate(zip(texts, metadatas)):
            point_id = str(uuid.uuid4())
            payload = {
                "text": text,
                "session_id": sid,
                **meta
            }
            points.append(models.PointStruct(
                id=point_id,
                vector=embeddings[i],
                payload=payload
            ))
            
        self.client.upsert(
            collection_name=COLLECTION_NAME,
            points=points
        )
        logger.info(f"Added {len(texts)} chunks to vector store for session {sid}")

    def search(self, query, session_id=None, session_ids=None, limit=5):
        """
        Searches for the most relevant chunks.
        Supports single session_id or a list of session_ids.
        """
        query_vector = self.model.encode(query).tolist()
        
        # Filter logic
        must_conditions = []
        
        if session_ids:
            # Multi-session filter
            # Using MatchAny but ensuring they are all strings
            sids = [str(s).strip() for s in session_ids if s]
            if sids:
                must_conditions.append(models.FieldCondition(
                    key="session_id",
                    match=models.MatchAny(any=sids)
                ))
            logger.info(f"RAG Search: Filtering by sessions: {sids}")
        elif session_id:
            # Single session filter
            sid = str(session_id).strip()
            must_conditions.append(models.FieldCondition(
                key="session_id",
                match=models.MatchValue(value=sid)
            ))
            logger.info(f"RAG Search: Filtering by single session: {sid}")
            
        search_filter = models.Filter(must=must_conditions) if must_conditions else None
        
        try:
            # query_points is the unified search entry point in modern qdrant-client
            response = self.client.query_points(
                collection_name=COLLECTION_NAME,
                query=query_vector,
                query_filter=search_filter,
                limit=limit
            )
            # QueryResponse contains points (and potentially groups/batches)
            results = response.points
        except Exception as e:
            logger.error(f"Qdrant Search Failed: {e}")
            return []
        
        parsed_results = [
            {
                "text": r.payload["text"],
                "score": r.score,
                "metadata": {k: v for k, v in r.payload.items() if k != "text"}
            }
            for r in results
        ]
        
        if not parsed_results and (session_id or session_ids):
            logger.warning(f"RAG Search: ZERO results for {session_id or session_ids}. Trying UNFILTERED fallback for diagnostics...")
            # Fallback for diagnostics: search without filter to see if data exists at all
            fallback = self.client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vector,
                limit=1
            )
            if fallback:
                logger.info(f"DIAGNOSTIC: Unfiltered search found data (sample SID: {fallback[0].payload.get('session_id')}). THE FILTER IS THE PROBLEM.")
            else:
                logger.info("DIAGNOSTIC: Unfiltered search also empty. COLLECTION IS EMPTY.")

        return parsed_results

# Global instance for easy access
vector_store = VectorStore()
