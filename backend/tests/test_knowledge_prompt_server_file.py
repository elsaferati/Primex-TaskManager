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
from app.config import settings


@pytest.fixture
def prompt_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(settings, "FILES_SERVER_STORAGE_ROOT", str(tmp_path))
    monkeypatch.setattr(settings, "FILES_SERVER_PATH_ALIASES", "")
    return tmp_path


def test_mapped_y_drive_resolves_to_files_server_storage() -> None:
    resolved = _resolve_files_server_path(r"Y:\10_ZHVILLIM\04_PROJECTS\prompt.txt")

    assert resolved == r"F:\FILES\10_ZHVILLIM\04_PROJECTS\prompt.txt"


def test_files_server_local_path_stays_on_storage_drive() -> None:
    resolved = _resolve_files_server_path(r"F:\FILES\10_ZHVILLIM\prompt.txt")

    assert resolved == r"F:\FILES\10_ZHVILLIM\prompt.txt"


def test_files_server_unc_path_resolves_to_storage_drive() -> None:
    resolved = _resolve_files_server_path(r"\\192.168.10.8\FILES\10_ZHVILLIM\prompt.txt")

    assert resolved == r"F:\FILES\10_ZHVILLIM\prompt.txt"


def test_save_prompt_text_to_explicit_file(prompt_storage: Path) -> None:
    destination = prompt_storage / "amazon-prompt.txt"

    stored = _save_prompt_text_to_server(str(destination), "Ignored title", "Only the prompt body")

    assert stored == str(destination)
    assert destination.read_text(encoding="utf-8") == "Only the prompt body"


def test_save_prompt_text_adds_txt_extension(prompt_storage: Path) -> None:
    destination = prompt_storage / "amazon-prompt"

    stored = _save_prompt_text_to_server(str(destination), "Ignored title", "Prompt")

    assert stored == str(destination.with_suffix(".txt"))
    assert destination.with_suffix(".txt").read_text(encoding="utf-8") == "Prompt"


def test_save_prompt_text_uses_title_for_directory(prompt_storage: Path) -> None:
    stored = _save_prompt_text_to_server(str(prompt_storage), 'Amazon: bullets / "DE"', "Prompt")
    destination = prompt_storage / _prompt_filename('Amazon: bullets / "DE"')

    assert stored == str(destination)
    assert destination.read_text(encoding="utf-8") == "Prompt"


def test_save_prompt_text_rejects_non_text_extension(prompt_storage: Path) -> None:
    with pytest.raises(HTTPException) as exc_info:
        _save_prompt_text_to_server(str(prompt_storage / "prompt.pdf"), "Prompt", "Prompt")

    assert exc_info.value.status_code == 400


def test_prompt_filename_avoids_windows_reserved_names() -> None:
    assert _prompt_filename("CON") == "_CON.txt"


def test_save_prompt_text_rejects_path_outside_files_storage(
    prompt_storage: Path, tmp_path: Path
) -> None:
    outside = tmp_path.parent / f"outside-{tmp_path.name}.txt"

    with pytest.raises(HTTPException) as exc_info:
        _save_prompt_text_to_server(str(outside), "Prompt", "Prompt")

    assert exc_info.value.status_code == 400
    assert not outside.exists()


def test_new_prompt_does_not_overwrite_unowned_file(prompt_storage: Path) -> None:
    destination = prompt_storage / "existing.txt"
    destination.write_text("Original content", encoding="utf-8")

    with pytest.raises(HTTPException) as exc_info:
        _save_prompt_text_to_server(str(destination), "Prompt", "Replacement")

    assert exc_info.value.status_code == 409
    assert destination.read_text(encoding="utf-8") == "Original content"


def test_edit_updates_only_the_prompts_existing_file(prompt_storage: Path) -> None:
    destination = prompt_storage / "existing.txt"
    destination.write_text("Old prompt", encoding="utf-8")

    stored = _save_prompt_text_to_server(
        str(destination),
        "Prompt",
        "Updated prompt",
        existing_path=str(destination),
    )

    assert stored == str(destination)
    assert destination.read_text(encoding="utf-8") == "Updated prompt"
