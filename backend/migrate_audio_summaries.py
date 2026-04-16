"""
migrate_audio_summaries.py — Re-generate audio for all existing sessions.

For sessions that already have a text summary but no podcast_script,
this script will:
  1. Use Groq to convert the existing dry text summary into an engaging podcast script.
  2. Pass that script to edge-tts to generate a high-quality MP3.
  3. Save both podcast_script and audio_summary_url back to MongoDB.
"""
import asyncio
import os
import sys
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.db import sessions_collection, init_db
from backend.utils.tts_generator import generate_audio_summary
from backend.utils.summarizer import _get_client, MODEL_PRIORITY

async def _make_podcast_script(text_summary: str, session_type: str) -> str:
    """Use Groq to turn a dry markdown summary into a natural conversational podcast script."""
    prompt = f"""You are a professional educational podcast host. Convert the following academic session summary into a short, engaging conversational script for an audio podcast recap.

SESSION TYPE: {session_type}

ACADEMIC SUMMARY:
\"\"\"{text_summary[:5000]}\"\"\"

INSTRUCTIONS:
- Write in a warm, engaging, conversational tone as if speaking directly to a student.
- Start with a welcoming hook, e.g. "Welcome back to your Smart Classroom recap. Today we covered..."
- Summarize the key topics naturally in 2-3 short paragraphs.
- End with an encouraging note that motivates the student to review the material.
- DO NOT use markdown, bullet points, asterisks, hashtags, or symbols. This will be sent directly to a Text-to-Speech engine.
- Keep it concise: 120-160 words maximum.

RESPOND WITH ONLY THE RAW PODCAST SCRIPT TEXT, NO JSON, NO EXTRA FORMATTING."""

    for model_name in MODEL_PRIORITY:
        try:
            client = _get_client()
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=400
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"  [WARN] Model {model_name} failed: {e}")
            continue
    return None

async def migrate():
    print("Initializing Database...")
    await init_db()

    # Find sessions with a summary but no podcast_script or audio_summary_url
    query = {
        "summary": {"$exists": True, "$ne": None, "$ne": ""},
        "$or": [
            {"audio_summary_url": {"$exists": False}},
            {"audio_summary_url": None},
            {"audio_summary_url": ""},
        ]
    }

    cursor = sessions_collection.find(query)
    sessions = await cursor.to_list(length=1000)

    if not sessions:
        print("All sessions already have audio summaries. Nothing to do!")
        return

    print(f"Found {len(sessions)} sessions to migrate.\n")

    for i, session in enumerate(sessions):
        session_id = session.get("session_id")
        summary_text = session.get("summary", "")
        session_type = session.get("session_type", "Class Session")
        
        if not summary_text:
            continue

        print(f"[{i+1}/{len(sessions)}] Processing: {session_id[:40]}...")

        # Step 1: Generate conversational podcast script from Groq
        podcast_script = await _make_podcast_script(summary_text, session_type)
        if not podcast_script:
            print(f"  [FAILED] Could not generate podcast script.")
            continue
        
        print(f"  Script ready ({len(podcast_script)} chars). Generating audio...")

        # Step 2: Generate MP3 from the natural script
        audio_url = await generate_audio_summary(podcast_script, session_id)
        if not audio_url:
            print(f"  [FAILED] Audio generation failed.")
            continue

        # Step 3: Save podcast_script + audio_summary_url to DB
        await sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "podcast_script": podcast_script,
                "audio_summary_url": audio_url
            }}
        )
        print(f"  [SUCCESS] {audio_url}")

    print("\nMigration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
