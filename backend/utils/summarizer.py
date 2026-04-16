"""
summarizer.py — High-Intelligence Educational Analysis using Groq Llama-3.

Generates:
1. Session Type Classification (Lecture, Seminar, Workshop, etc.)
2. Intelligent Multi-Paragraph Narrative Summary
3. Categorized Taxonomy (Theory, Practice, Key Terms)
4. Pedagogical Study Questions

Uses Groq Llama-3 for state-of-the-art educational insight.
"""

import os
import json
import re
import time
import logging
from typing import Optional
from collections import Counter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stopwords and Constants
# ---------------------------------------------------------------------------
STOPWORDS = set([
    "the", "is", "a", "an", "and", "to", "of", "in", "for", "on",
    "that", "this", "it", "we", "you", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "need",
    "with", "as", "at", "by", "from", "or", "but", "not", "so", "if",
    "its", "our", "they", "their", "he", "she", "him", "her", "his",
    "also", "about", "which", "what", "when", "how", "all", "any",
    "one", "just", "then", "than", "there", "these", "those", "my",
    "your", "no", "more", "into", "up", "out", "like", "get", "use",
    "now", "here", "only", "very", "i", "me", "us", "am",
])

NOISE_TOKENS = [
    "[inaudible]", "(inaudible)", "[noise]", "(noise)",
    "[laughter]", "(laughter)", "[music]", "(music)",
]

# Regex for common transcription artifacts (large numbers, repeated timestamps)
ARTIFACT_PATTERN = re.compile(r'\b\d{1,3}(?:,\d{3}){2,}\b|\b\d{9,}\b')

# ---------------------------------------------------------------------------
# Groq Logic
# ---------------------------------------------------------------------------
MODEL_PRIORITY = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
_client_cache: dict = {}

def _get_client():
    global _client_cache
    if not _client_cache:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set. Please add it to your .env file.")
        _client_cache["client"] = Groq(api_key=api_key)
    return _client_cache["client"]

def _heuristic_fallback(text: str) -> dict:
    """Basic extraction when AI fails."""
    sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    words = [w for w in re.findall(r"\b[a-zA-Z]{4,}\b", text.lower()) if w not in STOPWORDS]
    freq = Counter(words)
    top_words = [w for w, _ in freq.most_common(10)]
    
    return {
        "session_type": "Class Session",
        "summary": "Educational analysis is being processed. " + (" ".join(sents[:3]) if sents else "Summary pending."),
        "podcast_script": "A detailed educational analysis is currently being processed for this session. Please check back shortly for a complete academic synthesis. Thank you for your patience.",
        "concepts": top_words,
        "questions": [f"What were the key takeaways regarding {top_words[0]}?" if top_words else "What was discussed?"],
        "taxonomy": {"General Topics": top_words}
    }

def analyze_session(transcripts: list) -> dict:
    if not transcripts: return {"summary": "", "concepts": [], "questions": []}
    
    full_text = " ".join([t.get("text", "") if isinstance(t, dict) else str(t) for t in transcripts])
    # Remove noise tokens and large numerical artifacts
    full_text = ARTIFACT_PATTERN.sub("", full_text)
    full_text = " ".join([w for w in full_text.split() if not any(n in w.lower() for n in NOISE_TOKENS)])

    if len(full_text.split()) < 20:
        return _heuristic_fallback(full_text)

    prompt = f"""You are a High-Intelligence Clinical Educational Research Lead. 
Analyze this classroom transcript and return a strict JSON response.

CONTEXT-AWARE ERROR CORRECTION:
- Carefully evaluate the transcript for phonetic or contextual transcription errors.
- If the subject is technical (e.g., Computer Science) and you see terms like "Mission learning", "Data mining" (instead of "Data lining"), or "Python" (instead of "Phonon"), intelligently interpret them as the correct academic terms BASED ON THE OVERALL CONTEXT.
- Use these corrected terms in your summary and concepts.

TRANSCRIPT:
\"\"\"{full_text[:15000]}\"\"\"

INSTRUCTIONS:
- summary: A HIGHLY PROFESSIONAL, structured educational analysis using subheadings.
  - Organization:
    - ### Executive Overview: A formal summary of the session's primary academic objectives and core thesis.
    - ### Theoretical Frameworks: A detailed breakdown of the central concepts, theories, and principles discussed.
    - ### Practical Applications: Analysis of real-world implementation, industry relevance, and methodology.
    - ### Critical Academic Takeaways: A precise set of essential rules or facts for student mastery.
  - Use bullet points within sections where appropriate for clarity.
  - Tone: Academic, formal, and objective. AVOID informal phrases like "AHA! moment" or "Golden Rule".
  - Return as ONE plain string with markdown subheadings and newlines.
- podcast_script: A highly professional, comprehensive academic synthesis of the session transcript.
  - Tone: Formal, precise, and authoritative, like a scientific or academic briefing.
  - Length: 3-5 short but information-dense paragraphs (approx 250-400 words).
  - Focus: Prioritize technical definitions, nuanced arguments, and specific evidence.
  - Structure: Use short, clean sentences for natural Text-to-Speech flow. Avoid overly long parenthetical phrases or complex nested clauses.
  - AVOID: Simple overviews or "Quick Review" hooks. DO NOT use greetings like "Welcome" or "Hello". Instead, start with a professional opening like "This academic synthesis provides a detailed review of the session on [topic]...".
  - DO NOT use markdown, bullet points, asterisks, bolding, or complex symbols. This text will be sent directly to a Text-to-Speech engine.
- session_type: A precise string like "Theoretical Computer Science Lecture", "Advanced Calculus Seminar", etc.
- concepts: Array of 5-8 precise academic terms, CORRECTED for transcription errors.
- taxonomy: Object with keys "Theoretical Foundations", "Applied Logistics", "Domain Lexicon" — each an array of strings.
- questions: Array of exactly 3 deep, application-based study questions that require critical thinking.

RESPONSE FORMAT (strict JSON):
{{
  "session_type": "Lecture",
  "summary": "Step-by-step detailed breakdown...",
  "podcast_script": "This academic synthesis provides a detailed review of the session focusing on...",
  "concepts": ["Concept 1", "Concept 2"],
  "taxonomy": {{
     "Theoretical Foundations": ["item1"],
     "Applied Logistics": ["item1"],
     "Domain Lexicon": ["term1"]
  }},
  "questions": ["Question 1?", "Question 2?", "Question 3?"]
}}"""

    def _sanitize(data: dict) -> dict:
        """Ensure all fields are the correct types — flatten objects if LLM misbehaves."""
        # summary must be a string
        s = data.get("summary", "")
        if isinstance(s, dict):
            data["summary"] = " ".join(str(v) for v in s.values())
        elif not isinstance(s, str):
            data["summary"] = str(s)

        # podcast_script must be a string
        p = data.get("podcast_script", "")
        if isinstance(p, dict):
            data["podcast_script"] = " ".join(str(v) for v in p.values())
        elif not isinstance(p, str):
            data["podcast_script"] = str(p)

        # questions must be list of strings
        q = data.get("questions", [])
        if isinstance(q, dict):
            data["questions"] = [f"{k}: {v}" if not str(v).endswith("?") else str(v) for k, v in q.items()]
        elif isinstance(q, list):
            data["questions"] = [
                f"{k}: {v}" if isinstance(item, dict) else str(item)
                for item in q
                for k, v in (item.items() if isinstance(item, dict) else [(None, item)])
            ]

        # concepts must be list of strings
        c = data.get("concepts", [])
        if isinstance(c, dict):
            data["concepts"] = list(c.values())

        # taxonomy values must be lists of strings
        t = data.get("taxonomy", {})
        if isinstance(t, dict):
            for k, v in t.items():
                if isinstance(v, str):
                    t[k] = [v]
                elif not isinstance(v, list):
                    t[k] = [str(v)]
        data["taxonomy"] = t

        return data

    for model_name in MODEL_PRIORITY:
        try:
            client = _get_client()
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": "You are an expert educational analyst. Respond ONLY with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            content = response.choices[0].message.content
            raw = json.loads(content)
            return _sanitize(raw)
        except Exception as e:
            logger.warning(f"Model {model_name} failed: {e}")
            continue

    return _heuristic_fallback(full_text)

# Wrappers
def generate_summary(transcripts): return analyze_session(transcripts).get("summary", "")
def extract_concepts(transcripts): return analyze_session(transcripts).get("concepts", [])
def generate_questions(transcripts): return analyze_session(transcripts).get("questions", [])
