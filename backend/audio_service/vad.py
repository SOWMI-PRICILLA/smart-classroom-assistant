import webrtcvad


class VADProcessor:
    """
    WebRTC VAD wrapper for 16 kHz, 30 ms frames (960 bytes int16 mono).

    aggressiveness=2 (medium):
      - 0 = very permissive (passes fan noise, keystrokes — caused hallucinations)
      - 2 = medium (passes clear speech, rejects most background noise)
      - 3 = very aggressive (may clip soft speech)
    """

    def __init__(self, aggressiveness: int = 1):
        self.vad = webrtcvad.Vad(aggressiveness)
        self.sample_rate = 16000

    def is_speech(self, pcm_bytes: bytes) -> bool:
        """
        pcm_bytes must be 16-bit PCM, mono, 30ms (960 bytes).
        Returns True if speech is detected by WebRTC VAD.
        """
        try:
            return self.vad.is_speech(pcm_bytes, self.sample_rate)
        except Exception as e:
            logger.error(f"VAD Error: {e}")
            return False
