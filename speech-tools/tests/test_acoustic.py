import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "speech-tools/scripts"))
from analyze_delivery import analyze

class AcousticFixtureTest(unittest.TestCase):
    def test_synthetic_aligned_vowels_and_relative_pitch(self):
        fixture = ROOT / "homepage/src/lib/fixtures/pronunciation-canary.wav"
        saved = json.loads((ROOT / "homepage/tests/fixtures/pronunciation/elevenlabs__eleven_v4__Eric__everyday.json").read_text())
        words = saved["NBest"][0]["Words"]
        aligned = []
        for wi, word in enumerate(words):
            for pi, phone in enumerate(word.get("Phonemes", [])):
                if phone.get("Duration", 0) > 0:
                    aligned.append(dict(id=f"w{wi}.p{pi}", phoneme=phone["Phoneme"], startSec=phone["Offset"]/1e7, endSec=(phone["Offset"]+phone["Duration"])/1e7))
        first, last = words[0], words[-1]
        phrases = [dict(id="phrase-w0", startSec=first["Offset"]/1e7, endSec=(last["Offset"]+last["Duration"])/1e7)]
        result = analyze(fixture, {"phonemes": aligned, "phrases": phrases})
        self.assertEqual(result["version"], 2)
        self.assertGreater(len(result["vowels"]), 0)
        self.assertTrue(all(v["f2Hz"] > v["f1Hz"] for v in result["vowels"]))
        self.assertEqual(len(result["phrasePitch"][0]["contourSemitones"]), 5)
        self.assertNotEqual(result["pitch"]["rangeSemitones"], None)
        self.assertEqual(result["acousticInsights"], [])

if __name__ == "__main__":
    unittest.main()
