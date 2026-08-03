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
    standardize_workbook,
)


router = APIRouter()


async def _read_upload(file: UploadFile) -> tuple[bytes, str]:
    filename = file.filename or "uploaded.xlsx"
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Skedari tejkalon kufirin prej 20 MB.")
    return content, filename


def _bad_request(exc: ExcelStandardizationError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


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
    initials: str = Form(...),
    description: str = Form(""),
    missing_headers_json: str = Form("{}"),
    _user=Depends(get_current_user),
):
    content, filename = await _read_upload(file)
    try:
        parsed_missing_headers = json.loads(missing_headers_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Header-at e plotësuar nuk janë validë.") from exc
    if not isinstance(parsed_missing_headers, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Header-at e plotësuar nuk janë validë.")
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

    boundary = f"primeflow-{uuid.uuid4().hex}"
    report_json = json.dumps(report, ensure_ascii=False).encode("utf-8")
    disposition_name = quote(output_filename)
    body = b"".join(
        [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"report\"\r\nContent-Type: application/json; charset=utf-8\r\n\r\n".encode(),
            report_json,
            b"\r\n",
            (
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"workbook\"; filename=\"{output_filename}\"; "
                f"filename*=UTF-8''{disposition_name}\r\n"
                "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n"
            ).encode(),
            workbook_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return Response(content=body, media_type=f"multipart/form-data; boundary={boundary}")
