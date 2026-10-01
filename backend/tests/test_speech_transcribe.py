import unittest
from io import BytesIO
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
import httpx
from starlette.datastructures import Headers, UploadFile

from app.api.routers.speech import _read_upload_with_limit, transcribe_audio
from app.config import settings


class TestSpeechTranscribe(unittest.IsolatedAsyncioTestCase):
    async def test_read_upload_within_limit(self) -> None:
        upload = UploadFile(filename="audio.webm", file=BytesIO(b"hello"))
        data = await _read_upload_with_limit(upload, max_bytes=10)
        self.assertEqual(data, b"hello")

    async def test_read_upload_exceeds_limit(self) -> None:
        upload = UploadFile(filename="audio.webm", file=BytesIO(b"x" * 20))
        with self.assertRaises(HTTPException) as context:
            await _read_upload_with_limit(upload, max_bytes=5)
        self.assertEqual(context.exception.status_code, 400)

    async def test_safari_mp4_with_codec_parameters_is_accepted(self) -> None:
        upload = UploadFile(
            filename="dictation.mp4", file=BytesIO(b"audio"),
            headers=Headers({"content-type": "audio/mp4;codecs=mp4a.40.2"}),
        )
        client = AsyncMock()
        client.post.return_value = httpx.Response(200, json={"text": "Përshëndetje"})
        with (
            patch.object(settings, "OPENAI_API_KEY", "test-key"),
            patch.object(settings, "SPEECH_TRANSCRIBE_MODEL", "whisper-1"),
            patch.object(settings, "SPEECH_ALLOWED_MIME", "audio/mp4,audio/webm"),
            patch("app.api.routers.speech.httpx.AsyncClient") as client_class,
        ):
            client_class.return_value.__aenter__.return_value = client
            result = await transcribe_audio(upload, language="sq", prompt=None, user=object())
        self.assertEqual(result, {"text": "Përshëndetje"})
        self.assertEqual(client.post.call_args.kwargs["files"]["file"], ("dictation.mp4", b"audio", "audio/mp4"))
        self.assertNotIn("language", client.post.call_args.kwargs["data"])
        self.assertTrue(upload.file.closed)

    async def test_language_hints_preserve_english_and_autodetect_albanian_for_whisper(self) -> None:
        for model, language, expected in [
            ("whisper-1", "sq", None),
            ("whisper-1", "sq-AL", None),
            ("whisper-1", "SQ_al", None),
            ("whisper-1", "en", "en"),
            ("whisper-1", None, None),
            ("gpt-4o-transcribe", "sq", "sq"),
        ]:
            with self.subTest(model=model, language=language):
                upload = UploadFile(filename="dictation.mp4", file=BytesIO(b"audio"))
                client = AsyncMock()
                client.post.return_value = httpx.Response(200, json={"text": "Test transcript"})
                with (
                    patch.object(settings, "OPENAI_API_KEY", "test-key"),
                    patch.object(settings, "SPEECH_TRANSCRIBE_MODEL", model),
                    patch.object(settings, "SPEECH_ALLOWED_MIME", None),
                    patch("app.api.routers.speech.httpx.AsyncClient") as client_class,
                ):
                    client_class.return_value.__aenter__.return_value = client
                    result = await transcribe_audio(upload, language=language, prompt="Context", user=object())
                payload = client.post.call_args.kwargs["data"]
                self.assertEqual(result, {"text": "Test transcript"})
                self.assertEqual(payload["model"], model)
                self.assertEqual(payload["prompt"], "Context")
                if expected is None:
                    self.assertNotIn("language", payload)
                else:
                    self.assertEqual(payload["language"], expected)

    async def test_unconfigured_speech_service_returns_explicit_error(self) -> None:
        with patch.object(settings, "OPENAI_API_KEY", None):
            with self.assertRaises(HTTPException) as context:
                await transcribe_audio(None, language=None, prompt=None, user=object())
        self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(context.exception.detail, "Speech service not configured")

    async def test_provider_rejection_is_logged_without_key_or_audio(self) -> None:
        audio = b"private-audio-content"
        upload = UploadFile(filename="dictation.mp4", file=BytesIO(audio))
        client = AsyncMock()
        client.post.return_value = httpx.Response(
            401, json={"error": {"message": "Incorrect API key: test-secret"}},
            headers={"x-request-id": "req-speech-test"},
        )
        with (
            patch.object(settings, "OPENAI_API_KEY", "test-secret"),
            patch.object(settings, "SPEECH_ALLOWED_MIME", None),
            patch("app.api.routers.speech.httpx.AsyncClient") as client_class,
            self.assertLogs("app.api.routers.speech", level="WARNING") as logs,
        ):
            client_class.return_value.__aenter__.return_value = client
            with self.assertRaises(HTTPException) as context:
                await transcribe_audio(upload, language="sq", prompt=None, user=object())
        self.assertEqual(context.exception.status_code, 502)
        output = "\n".join(logs.output)
        self.assertIn("speech_transcription_rejected status=401", output)
        self.assertIn("req-speech-test", output)
        self.assertIn("Incorrect API key: [REDACTED]", output)
        self.assertNotIn("test-secret", output)
        self.assertNotIn(audio.decode(), output)

    async def test_timeout_is_identifiable_in_logs(self) -> None:
        upload = UploadFile(filename="dictation.mp4", file=BytesIO(b"audio"))
        client = AsyncMock()
        client.post.side_effect = httpx.ReadTimeout("private-request-information")
        with (
            patch.object(settings, "OPENAI_API_KEY", "test-secret"),
            patch.object(settings, "SPEECH_ALLOWED_MIME", None),
            patch("app.api.routers.speech.httpx.AsyncClient") as client_class,
            self.assertLogs("app.api.routers.speech", level="WARNING") as logs,
        ):
            client_class.return_value.__aenter__.return_value = client
            with self.assertRaises(HTTPException) as context:
                await transcribe_audio(upload, language="sq", prompt=None, user=object())
        self.assertEqual(context.exception.status_code, 502)
        output = "\n".join(logs.output)
        self.assertIn("error=ReadTimeout", output)
        self.assertNotIn("private-request-information", output)


if __name__ == "__main__":
    unittest.main()
