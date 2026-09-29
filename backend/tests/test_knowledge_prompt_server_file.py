import os
from pathlib import Path

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.api.routers.knowledge import (
    _prompt_filename,
    _resolve_files_server_path,
    _save_prompt_text_to_server,
)


def test_mapped_y_drive_resolves_to_files_server_storage() -> None:
    resolved = _resolve_files_server_path(r"Y:\10_ZHVILLIM\04_PROJECTS\prompt.txt")

    assert resolved == r"F:\FILES\10_ZHVILLIM\04_PROJECTS\prompt.txt"


def test_files_server_local_path_stays_on_storage_drive() -> None:
    resolved = _resolve_files_server_path(r"F:\FILES\10_ZHVILLIM\prompt.txt")

    assert resolved == r"F:\FILES\10_ZHVILLIM\prompt.txt"


def test_files_server_unc_path_resolves_to_storage_drive() -> None:
    resolved = _resolve_files_server_path(r"\\192.168.10.8\FILES\10_ZHVILLIM\prompt.txt")

    assert resolved == r"F:\FILES\10_ZHVILLIM\prompt.txt"


def test_save_prompt_text_to_explicit_file(tmp_path: Path) -> None:
    destination = tmp_path / "amazon-prompt.txt"

    stored = _save_prompt_text_to_server(str(destination), "Ignored title", "Only the prompt body")

    assert stored == str(destination)
    assert destination.read_text(encoding="utf-8") == "Only the prompt body"


def test_save_prompt_text_adds_txt_extension(tmp_path: Path) -> None:
    destination = tmp_path / "amazon-prompt"

    stored = _save_prompt_text_to_server(str(destination), "Ignored title", "Prompt")

    assert stored == str(destination.with_suffix(".txt"))
    assert destination.with_suffix(".txt").read_text(encoding="utf-8") == "Prompt"


def test_save_prompt_text_uses_title_for_directory(tmp_path: Path) -> None:
    stored = _save_prompt_text_to_server(str(tmp_path), 'Amazon: bullets / "DE"', "Prompt")
    destination = tmp_path / _prompt_filename('Amazon: bullets / "DE"')

    assert stored == str(destination)
    assert destination.read_text(encoding="utf-8") == "Prompt"


def test_save_prompt_text_rejects_non_text_extension(tmp_path: Path) -> None:
    with pytest.raises(HTTPException) as exc_info:
        _save_prompt_text_to_server(str(tmp_path / "prompt.pdf"), "Prompt", "Prompt")

    assert exc_info.value.status_code == 400
