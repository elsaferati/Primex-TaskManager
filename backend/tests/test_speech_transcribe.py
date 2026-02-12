import unittest
from io import BytesIO

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from app.api.routers.speech import _read_upload_with_limit


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


if __name__ == "__main__":
    unittest.main()
