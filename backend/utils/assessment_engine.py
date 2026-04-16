import json
import logging
import asyncio
from typing import List, Dict
from backend.utils.vector_store import vector_store
from backend.utils.summarizer import _get_client

logger = logging.getLogger(__name__)

def _call_groq_assessment(prompt: str, response_format={"type": "json_object"}) -> Dict:
    """Helper to call Groq for assessment tasks."""
    client = _get_client()
    for model in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are an expert academic assessment designer and grader. Respond strictly in the required JSON format."},
                    {"role": "user", "content": prompt}
                ],
                response_format=response_format,
                temperature=0.3
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.warning(f"Model {model} failed in assessment call: {e}")
            continue
    return {}

async def generate_rag_quiz(session_id: str = None, session_ids: List[str] = None, num_questions: int = 5) -> List[Dict]:
    """
    Generates a quiz by retrieving high-importance chunks from one or more sessions.
    """
    # 1. Retrieve interesting chunks
    # Use a broader query for comprehensive assessments to capture more diversity
    query = "key concepts, core definitions, important theories, case studies, academic thesis, fundamental principles"
    
    relevant_chunks = vector_store.search(
        query, 
        session_id=session_id, 
        session_ids=session_ids, 
        limit=15 if session_ids else 10
    )
    
    if not relevant_chunks:
        # DIAGNOSTIC: Check if we have ANY data at all
        if session_ids:
            logger.warning(f"RAG search failed for {len(session_ids)} sessions. Checking collection health...")
            global_check = vector_store.search(query, limit=1)
            if global_check:
                logger.error(f"DATA EXISTS in collection, but NOT for the selected sessions: {session_ids}")
            else:
                logger.error("COLLECTION IS EMPTY. No data found globally.")
        
        return []

    # Combine chunks for context
    context_text = "\n---\n".join([c["text"] for c in relevant_chunks])
    
    prompt = f"""Based on the following lecture context, generate a quiz with {num_questions} questions.
Include a mix of Multiple Choice Questions (MCQ) and Short Answer questions.

CONTEXT:
\"\"\"{context_text}\"\"\"

INSTRUCTIONS:
- Ensure each question is grounded *only* in the provided context.
- For MCQs, provide 4 options and the correct answer index.
- For Short Answer, provide a "model_answer" which will be used for grading.
- Provide a "source_evidence" string for each question (a snippet from the context).

RESPONSE FORMAT (Strict JSON):
{{
  "quiz_title": "Assessment for Session",
  "questions": [
    {{
      "id": "q1",
      "type": "mcq",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct_index": 0,
      "max_points": 2,
      "source_evidence": "..."
    }},
    {{
      "id": "q2",
      "type": "short_answer",
      "question": "...",
      "max_points": 10,
      "model_answer": "...",
      "source_evidence": "..."
    }}
  ]
}}"""

    result = await asyncio.to_thread(_call_groq_assessment, prompt)
    return result.get("questions", [])

async def grade_student_answer_rag(session_id: str = None, session_ids: List[str] = None, question: str = "", student_answer: str = "") -> Dict:
    """
    Grades a student answer by retrieving the specific grounding context from one or more sessions.
    """
    # 1. Retrieve grounding context for the specific question/answer
    relevant_chunks = vector_store.search(
        f"Question: {question} \nAnswer context", 
        session_id=session_id, 
        session_ids=session_ids, 
        limit=3
    )
    grounding_context = "\n---\n".join([c["text"] for c in relevant_chunks])
    
    logger.info(f"Grading RAG: Retrieved {len(relevant_chunks)} chunks for question. Context length: {len(grounding_context)} chars.")
    if not grounding_context:
        logger.warning(f"No grounding context found for question: {question[:50]}...")

    prompt = f"""You are an expert academic grader. Grade the student's answer based on the provided LECTURE CONTEXT, but be HOLISTIC and permissive.
    
QUESTION: {question}
STUDENT ANSWER: {student_answer}

LECTURE GROUNDING CONTEXT:
\"\"\"{grounding_context}\"\"\"

GRADING RULES:
1. Focus on the STUDENT'S UNDERSTANDING. If the answer is generally correct and aligns with the core concepts of the lecture, give a high score (8-10).
2. Do NOT penalize for phrasing or vocabulary differences if the underlying meaning is accurate.
3. If the answer is partially right or hits some key points, give a score between 5-7.
4. If the answer is completely off-topic or contradicts the lecture fundamentally, give a score between 0-4.
5. Provide a "grade" (A, B, C, D, or F).
6. Provide encouraging "feedback" and a "teacher_quote" from the context that supports the student's valid points or clarifies the correct concept.

RESPONSE FORMAT (Strict JSON):
{{
  "score": <0-10>,
  "grade": "<A/B/C/D/F>",
  "feedback": "...",
  "teacher_quote": "..."
}}"""

    result = await asyncio.to_thread(_call_groq_assessment, prompt)
    if not result:
        logger.error("Grading LLM call returned empty result.")
        return {"score": 0, "grade": "F", "feedback": "Auto-grading failed due to technical error.", "teacher_quote": ""}
    return result
