from __future__ import annotations

import json
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.api.deps import get_current_user
from app.services.excel_standardizer import (
    ExcelStandardizationError,
    MAX_UPLOAD_BYTES,
    analyze_workbook,
    initials_from_user,
    standardize_workbook,
)
from app.services.word_standardizer import (
    WordStandardizationError,
    analyze_word_document,
    standardize_word_document,
)


router = APIRouter()


async def _read_upload(file: UploadFile, default_filename: str = "uploaded.xlsx") -> tuple[bytes, str]:
    filename = file.filename or default_filename
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Skedari tejkalon kufirin prej 20 MB.")
    return content, filename


def _bad_request(exc: ExcelStandardizationError | WordStandardizationError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _multipart_response(
    *,
    file_field: str,
    file_bytes: bytes,
    output_filename: str,
    media_type: str,
    report: dict,
) -> Response:
    boundary = f"primeflow-{uuid.uuid4().hex}"
    report_json = json.dumps(report, ensure_ascii=False).encode("utf-8")
    disposition_name = quote(output_filename)
    body = b"".join(
        [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"report\"\r\nContent-Type: application/json; charset=utf-8\r\n\r\n".encode(),
            report_json,
            b"\r\n",
            (
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{output_filename}\"; "
                f"filename*=UTF-8''{disposition_name}\r\n"
                f"Content-Type: {media_type}\r\n\r\n"
            ).encode(),
            file_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return Response(content=body, media_type=f"multipart/form-data; boundary={boundary}")


@router.post("/excel/analyze")
async def analyze_excel(
    file: UploadFile = File(...),
    _user=Depends(get_current_user),
):
    content, filename = await _read_upload(file)
    try:
        return analyze_workbook(content, filename).to_dict()
    except ExcelStandardizationError as exc:
        raise _bad_request(exc) from exc


@router.post("/excel/generate")
async def generate_excel(
    file: UploadFile = File(...),
    description: str = Form(""),
    missing_headers_json: str = Form("{}"),
    user=Depends(get_current_user),
):
    content, filename = await _read_upload(file)
    try:
        parsed_missing_headers = json.loads(missing_headers_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Header-at e plotësuar nuk janë validë.") from exc
    if not isinstance(parsed_missing_headers, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Header-at e plotësuar nuk janë validë.")
    initials = initials_from_user(user.full_name, user.username, user.email)
    if not initials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inicialet nuk mund të nxirren nga profili i përdoruesit në PrimeFlow.",
        )
    try:
        workbook_bytes, output_filename, report = standardize_workbook(
            content=content,
            filename=filename,
            initials=initials,
            missing_headers=parsed_missing_headers,
            description=description or None,
        )
    except ExcelStandardizationError as exc:
        raise _bad_request(exc) from exc

    return _multipart_response(
        file_field="workbook",
        file_bytes=workbook_bytes,
        output_filename=output_filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        report=report,
    )


@router.post("/word/analyze")
async def analyze_word(
    file: UploadFile = File(...),
    _user=Depends(get_current_user),
):
    content, filename = await _read_upload(file, "uploaded.docx")
    try:
        return analyze_word_document(content, filename).to_dict()
    except WordStandardizationError as exc:
        raise _bad_request(exc) from exc


@router.post("/word/generate")
async def generate_word(
    file: UploadFile = File(...),
    description: str = Form(""),
    user=Depends(get_current_user),
):
    content, filename = await _read_upload(file, "uploaded.docx")
    initials = initials_from_user(user.full_name, user.username, user.email)
    if not initials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inicialet nuk mund të nxirren nga profili i përdoruesit në PrimeFlow.",
        )
    try:
        document_bytes, output_filename, report = standardize_word_document(
            content=content,
            filename=filename,
            initials=initials,
            description=description or None,
        )
    except WordStandardizationError as exc:
        raise _bad_request(exc) from exc

    return _multipart_response(
        file_field="document",
        file_bytes=document_bytes,
        output_filename=output_filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        report=report,
    )
