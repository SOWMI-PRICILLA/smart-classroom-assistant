import logging
import json
import re
import numpy as np
import io
import wave
import os
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# Audio gate disabled for "Absolute Recall" strategy.
# We let Whisper handle low-level noise via its internal VAD.
_MIN_RMS = 0.0

class WhisperStream:
    """
    Single persistent local Whisper model.
    Optimized for extremely fast real-time transcription.
    """
    def __init__(
        self,
        model_size="small",  # Speed optimized model
        device=None,
        compute_type="float16", 
    ):
        if device is None:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            # If on CPU, float16 is technically not supported/slow, so use int8
            if device == "cpu" and compute_type == "float16":
                compute_type = "int8"
        
        logger.info(f"Loading FULL local Whisper model: {model_size} on {device} ({compute_type})...")
        try:
            # Optimized for absolute recall precision
            self.model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
                cpu_threads=8,
            )
            logger.info(f"Full {model_size} Model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load local Whisper model {model_size}: {e}")
            if model_size != "medium.en":
                logger.info("Retrying with medium.en...")
                self.__init__(model_size="medium.en", device=device, compute_type=compute_type)
            else:
                raise

    def transcribe(self, audio_np: np.ndarray, is_partial: bool = False):
        """
        Transcribe a numpy int16 audio buffer locally using Faster-Whisper.
        Returns detailed raw segments with word-level timestamps.
        """
        audio_float32 = audio_np.astype(np.float32) / 32768.0
        
        # Stabilization Requirements:
        # - word_timestamps=True for boundary trimming
        # - condition_on_previous_text=False to prevent LM ending bias
        # - no_speech_threshold=0.3 (more aggressive silence rejection)
        # - temperature=0.0 (deterministic)
        
        segments, info = self.model.transcribe(
            audio_float32,
            beam_size=3,  # Increased to 3 for better accuracy (was 1/greedy)
            temperature=0.0,
            vad_filter=True, 
            condition_on_previous_text=True, # Improved coherence between segments
            initial_prompt="A classroom lecture. The following is high accuracy transcription.",
            word_timestamps=True,
            no_speech_threshold=0.35, # Slightly more sensitive to speech
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            repetition_penalty=1.1,
        )

        results = []
        for seg in segments:
            # Extract word-level data for precision trimming in the server layer
            words = []
            if seg.words:
                for w in seg.words:
                    words.append({
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "word": w.word,
                        "probability": round(w.probability, 4)
                    })

            text = self._clean_text(seg.text)
            if text:
                results.append({
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": text,
                    "words": words,
                    # Expose no_speech_prob so server.py can reject hallucinations
                    "no_speech_prob": round(getattr(seg, "no_speech_prob", 0.0), 4),
                })

        if not results:
            return None

        msg_type = "partial" if is_partial else "final"
        logger.info(f"[{msg_type.upper()}] Got {len(results)} segments (word_timestamps=True).")
        return json.dumps({"type": msg_type, "segments": results})

    def _clean_text(self, text: str) -> str:
        """Light cleaning, removes obvious repetitions."""
        if not text:
            return ""
        # Remove obvious repetitions (word word word)
        text = re.sub(r"\b(\w+)(?:\s+\1){2,}\b", r"\1", text, flags=re.IGNORECASE)
        
        # Ghost Phrase Filtering
        # Reject short, common hallucinations if they are the only words
        ghost_phrases = ["you", "thank you", "thanks for watching", "thanks for reading", "subtitles by"]
        clean_text = text.lower().strip().strip(".,!?")
        if clean_text in ghost_phrases:
            return ""
            
        return text.strip()
