class SpeechSegmenter:
    """
    VAD-guided speech segmenter.

    Frame duration: 30 ms  →  1 frame = 30 ms

    Key parameters for classroom use:
      silence_frames_threshold = 15  → ~450 ms silence before flush  (was 25/750ms)
      min_speech_frames = 10         → ~300 ms minimum real speech   (was 15/450ms)
      max_speech_frames = 80         → ~2.4 s force-flush             (was 150/4.5s)
    """

    def __init__(
        self,
        silence_frames_threshold: int = 15,    # ~450ms silence to close segment (was 25/~750ms)
        min_speech_frames: int = 10,          # ~300ms min speech (was 15/~450ms)
        pre_padding_frames: int = 5,          # ~150ms pre-roll
        max_speech_frames: int = 50,          # ~1.5s force flush for continuous speech (was 80/~2.4s)
    ):
        self.buffer: list = []
        self.pre_speech_buffer: list = []
        self.silence_count: int = 0
        self.speech_frames_count: int = 0  
        self.threshold = silence_frames_threshold
        self.min_frames = min_speech_frames
        self.pre_padding = pre_padding_frames
        self.max_speech_frames = max_speech_frames
        self.in_speech: bool = False

    # ── public API ────────────────────────────────────────────────────────────

    def add_speech(self, frame: bytes):
        if not self.in_speech:
            # Start new segment with pre-roll
            self.buffer = list(self.pre_speech_buffer)
            self.in_speech = True
        
        self.buffer.append(frame)
        self.silence_count = 0
        self.speech_frames_count += 1
        self._update_pre_buffer(frame)
        
        if self.speech_frames_count >= self.max_speech_frames:
            segment = b"".join(self.buffer)
            self._reset()
            return segment
        return None

    def add_silence(self, frame: bytes):
        self._update_pre_buffer(frame)

        if not self.in_speech:
            return None

        self.buffer.append(frame)
        self.silence_count += 1

        # Close segment if silence threshold reached
        if self.silence_count >= self.threshold:
            if self.speech_frames_count >= self.min_frames:
                segment = b"".join(self.buffer)
                self._reset()
                return segment
            else:
                # Discard too short segments
                self._reset()
                return None
        return None

    def get_active_buffer(self) -> bytes:
        """Return the current active speech buffer for partial transcription."""
        if not self.in_speech or not self.buffer:
            return b""
        return b"".join(self.buffer)

    def force_flush(self):
        """Force close the current segment (e.g. on disconnect)."""
        if self.in_speech and self.speech_frames_count >= self.min_frames:
            segment = b"".join(self.buffer)
            self._reset()
            return segment
        self._reset()
        return None

    # ── internals ─────────────────────────────────────────────────────────────

    def _update_pre_buffer(self, frame: bytes):
        self.pre_speech_buffer.append(frame)
        if len(self.pre_speech_buffer) > self.pre_padding:
            self.pre_speech_buffer.pop(0)

    def _reset(self):
        self.buffer = []
        self.silence_count = 0
        self.speech_frames_count = 0
        self.in_speech = False
