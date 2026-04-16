import numpy as np
import sys
import os
import difflib
import re

def align(last_text, new_text):
    if not last_text or not new_text: return new_text
    def clean_word(w): return re.sub(r'[^\w]', '', w.lower())
    new_all = new_text.split()
    last_all = last_text.split()
    clean_new = [clean_word(w) for w in new_all if clean_word(w)]
    clean_last = [clean_word(w) for w in last_all if clean_word(w)]
    if not clean_new or not clean_last: return new_text
    search_limit = min(len(clean_last), 100)
    suffix = clean_last[-search_limit:]
    matcher = difflib.SequenceMatcher(None, suffix, clean_new)
    match = matcher.find_longest_match(0, len(suffix), 0, min(len(clean_new), 50))
    if match.size >= 3:
        target_clean_idx = match.b + match.size
        current_clean_idx = 0
        for i, word in enumerate(new_all):
            if clean_word(word):
                if current_clean_idx == target_clean_idx:
                    return " ".join(new_all[i:]).strip()
                current_clean_idx += 1
    return new_text

def test_alignment_logic():
    print("Testing Absolute Recall Alignment...")
    
    # Case 1: Perfect overlap (3+ words)
    last_val = "artificial intelligence is the ability of a digital computer."
    new_val = "a digital computer or computer-controlled robot to perform tasks."
    clean = align(last_val, new_val)
    print(f"  - Perfect Overlap result: '{clean}'")
    assert clean == "or computer-controlled robot to perform tasks.", f"Expected 'or computer-controlled robot to perform tasks.', got '{clean}'"
    
    # Case 2: No overlap (should return all)
    last_val = "end of previous sentence."
    new_val = "Start of completely new sentence."
    clean = align(last_val, new_val)
    assert clean == "Start of completely new sentence.", "Should not clip without match"
    print("  - Disjoint segments PASSED")
    
    # Case 3: Punctuation mismatch (should still match)
    last_val = "This is a test, of the alignment!"
    new_val = "test of the alignment and it works."
    clean = align(last_val, new_val)
    print(f"  - Punctuation robustness result: '{clean}'")
    assert clean == "and it works.", f"Expected 'and it works.', got '{clean}'"

def test_vad_minimal():
    from backend.audio_service.vad import VADProcessor
    print("Testing VAD (used for partials only now)...")
    vad = VADProcessor(aggressiveness=1)
    silence = b'\x00' * 960
    assert vad.is_speech(silence) is False, "Silence should be detected as False"
    print("  - VAD minimal test PASSED")

if __name__ == "__main__":
    # Add project root to path for imports
    sys.path.append(os.getcwd())
    
    try:
        test_alignment_logic()
        test_vad_minimal()
        print("\nABSOLUTE RECALL LOGIC TESTS PASSED")
    except Exception as e:
        print(f"\nTESTS FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
