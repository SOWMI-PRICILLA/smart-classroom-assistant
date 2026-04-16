"""
YouTube Data API v3 helper — fetches tutorial videos for a given concept.
The API key is read from the YOUTUBE_API_KEY environment variable and is
NEVER sent to the browser.
"""
import os
import httpx

YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/search"


async def fetch_youtube_videos(concept: str, max_results: int = 3) -> list:
    """
    Search YouTube for tutorial videos about `concept`.
    Returns a list of dicts: { title, url, thumbnail, channel, type }
    Returns an empty list on error (quota exceeded, invalid key, etc.)
    """
    api_key = os.getenv("YOUTUBE_API_KEY", "")
    if not api_key:
        print("WARNING: YOUTUBE_API_KEY is not set — skipping YouTube fetch.")
        return []

    params = {
        "part": "snippet",
        "type": "video",
        "maxResults": max_results,
        "q": f"{concept} university academic lecture educational course",
        "key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(YOUTUBE_API_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        print(f"YouTube API error for concept '{concept}': {e}")
        return []

    results = []
    for item in data.get("items", []):
        video_id = item.get("id", {}).get("videoId", "")
        snippet = item.get("snippet", {})
        if not video_id:
            continue
        results.append({
            "title": snippet.get("title", ""),
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "thumbnail": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
            "channel": snippet.get("channelTitle", ""),
            "type": "youtube",
        })

    return results
