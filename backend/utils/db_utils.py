import asyncio
import functools
from pymongo.errors import AutoReconnect
from fastapi import HTTPException

def with_mongodb_retry(max_retries=3, delay=0.5):
    """Decorator to retry asynchronous MongoDB operations on AutoReconnect."""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except AutoReconnect as e:
                    last_exc = e
                    print(f"DEBUG: [RETRY] MongoDB AutoReconnect on {func.__name__} (attempt {attempt+1}/{max_retries})")
                    if attempt < max_retries - 1:
                        # Exponential backoff
                        await asyncio.sleep(delay * (2 ** attempt))
                        continue
            print(f"DEBUG: [FAILED] MongoDB failed after {max_retries} attempts: {last_exc}")
            raise HTTPException(status_code=503, detail="The database connection is currently unstable. Our automated systems are attempting to reconnect, please try again in a moment.")
        return wrapper
    return decorator
