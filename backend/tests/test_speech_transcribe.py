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
            patch.object(settings, "SPEECH_ALLOWED_MIME", "audio/mp4,audio/webm"),
            patch("app.api.routers.speech.httpx.AsyncClient") as client_class,
        ):
            client_class.return_value.__aenter__.return_value = client
            result = await transcribe_audio(upload, language="sq", prompt=None, user=object())
        self.assertEqual(result, {"text": "Përshëndetje"})
        self.assertEqual(client.post.call_args.kwargs["files"]["file"], ("dictation.mp4", b"audio", "audio/mp4"))
        self.assertEqual(client.post.call_args.kwargs["data"]["language"], "sq")
        self.assertTrue(upload.file.closed)

    async def test_unconfigured_speech_service_returns_explicit_error(self) -> None:
        with patch.object(settings, "OPENAI_API_KEY", None):
            with self.assertRaises(HTTPException) as context:
                await transcribe_audio(None, language=None, prompt=None, user=object())
        self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(context.exception.detail, "Speech service not configured")


if __name__ == "__main__":
    unittest.main()
