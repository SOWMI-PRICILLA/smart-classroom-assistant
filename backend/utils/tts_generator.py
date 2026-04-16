import os
import asyncio
import edge_tts
import uuid

# Use the same MATERIALS_DIR logic as in app.py
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage")
MATERIALS_DIR = os.path.join(STORAGE_DIR, "materials")
os.makedirs(MATERIALS_DIR, exist_ok=True)

# A professional, premium-tier natural British female voice for academic audio
VOICE = "en-GB-SoniaNeural"

def handle_acronyms(text: str) -> str:
    """Ensures acronyms are pronounced as individual letters (e.g. AI -> A.I.)."""
    import re
    # Match 2-4 uppercase letters not followed by lowercase (to avoid matching 'This', 'The')
    acronyms = ["AI", "ML", "IT", "UI", "UX", "API", "OS", "DNA", "RNA", "FAQ", "SaaS"]
    for a in acronyms:
        # Replace only if it's a whole word
        text = re.sub(rf'\b{a}\b', ".".join(list(a)) + ".", text)
    return text

async def generate_audio_summary(text: str, session_id: str) -> str:
    """
    Converts the provided text into speech using edge-tts.
    Saves it as an MP3 and returns the URL string.
    """
    if not text:
        return None
        
    # Advanced preprocessing for natural TTS flow
    clean_text = text.replace("#", "").replace("*", "").replace("\n", " ").replace("  ", " ").strip()
    clean_text = handle_acronyms(clean_text)
    
    # We add a random hex to avoid browser caching issues when regenerating
    filename = f"audio_summary_{session_id}_{uuid.uuid4().hex[:6]}.mp3"
    filepath = os.path.join(MATERIALS_DIR, filename)
    
    try:
        # Reset to normal rate (+0%) for improved engagement and natural rhythm
        # Added a slight pitch reduction (-1Hz) for an authoritative yet warm academic tone
        communicate = edge_tts.Communicate(clean_text, VOICE, rate="+0%", pitch="-1Hz")
        await communicate.save(filepath)
        
        # Use relative URL for frontend compatibility
        file_url = f"/storage/materials/{filename}"
        print(f"DEBUG: Audio summary generated. URL: {file_url}")
        return file_url
    except Exception as e:
        print(f"DEBUG: edge-tts audio generation failed: {e}")
        return None
