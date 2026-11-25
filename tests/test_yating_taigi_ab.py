import base64
import importlib.util
import io
import json
import os
import pathlib
import unittest
from unittest.mock import patch
import wave

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "yating-taigi-ab.py"
spec = importlib.util.spec_from_file_location("yating_ab", SCRIPT)
ab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ab)


def wav_fixture(rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * rate)
    return buf.getvalue()


class YatingTaigiAbTest(unittest.TestCase):
    def test_two_exact_taiwanese_voices(self):
        self.assertEqual([x[2] for x in ab.VOICES], ["tai_female_1", "tai_female_2"])
        for _, _, voice in ab.VOICES:
            body = ab.payload(voice, "歹勢，這馬無空房。")
            self.assertEqual(body["voice"], {"model": voice, "speed": 1, "pitch": 1, "energy": 1})
            self.assertEqual(body["audioConfig"], {"encoding": "LINEAR16", "sampleRate": "16K"})
            self.assertEqual(body["input"]["type"], "text")
            self.assertNotIn("key", body)

    def test_unapproved_voice_and_oversized_input(self):
        with self.assertRaises(ValueError):
            ab.payload("tai_male_1", "hi")
        with self.assertRaises(ValueError):
            ab.payload("tai_female_1", "字" * 301)
        self.assertEqual(ab.character_units("字A"), 3)

    def test_valid_wav_audio(self):
        raw = json.dumps({"audioContent": base64.b64encode(wav_fixture()).decode()}).encode()
        wav, duration = ab.parse_wave_response(raw)
        self.assertTrue(wav.startswith(b"RIFF"))
        self.assertAlmostEqual(duration, 1.0)

    def test_bad_audio_fails_closed(self):
        for raw in [b"{}", b'{"audioContent":"bad!"}', b"not json"]:
            with self.assertRaises((ValueError, json.JSONDecodeError)):
                ab.parse_wave_response(raw)
        raw = json.dumps({"audioContent": base64.b64encode(wav_fixture(22050)).decode()}).encode()
        with self.assertRaisesRegex(ValueError, "Unexpected PCM"):
            ab.parse_wave_response(raw)

    def test_api_key_never_enters_payload(self):
        from urllib.request import Request
        class FakeResponse:
            status = 201
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, n): return json.dumps({
                "audioContent": base64.b64encode(wav_fixture()).decode()
            }).encode()
        seen = []
        def mock_urlopen(req: Request, timeout: int):
            seen.append(req)
            return FakeResponse()
        with patch.object(ab.urllib.request, "urlopen", side_effect=mock_urlopen):
            wav, duration, latency = ab.synthesize("sample-only-secret", "tai_female_2", "你好")
        self.assertTrue(wav.startswith(b"RIFF"))
        self.assertGreater(duration, 0)
        self.assertGreaterEqual(latency, 0)
        self.assertEqual(seen[0].get_header("Key"), "sample-only-secret")
        self.assertNotIn("sample-only-secret", seen[0].data.decode())


if __name__ == "__main__":
    unittest.main()
