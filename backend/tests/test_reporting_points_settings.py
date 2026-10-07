import asyncio
import uuid
from datetime import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_mock_engine
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.api.routers import m2_reporting_points as m2_api, m3_reporting_points as m3_api
from app.models.enums import UserRole
from app.services import reporting_points_settings as settings
from tests.test_migration_graph import migration_scripts


def payload(**updates):
    value = dict(is_active=True, send_time="12:30", weekdays=[0, 1, 2, 3, 4],
                 recipients={"to": ["ga@primexeu.com", "info@primexeu.com"], "cc": [], "bcc": []},
                 manual_recipients={"to": ["manual@example.com"], "cc": [], "bcc": []})
    return {**value, **updates}


@pytest.mark.parametrize("updates", [
    {"weekdays": []}, {"weekdays": [7]}, {"weekdays": [-1]},
    {"send_time": "25:00"}, {"send_time": "12:30:10"}, {"send_time": "12:30:00+02:00"},
    {"recipients": {"to": []}}, {"recipients": {"to": ["invalid-email"]}},
    {"manual_recipients": {"to": []}}, {"unexpected": True},
])
def test_delivery_settings_validate_addresses_days_and_local_minute(updates):
    with pytest.raises(ValidationError):
        settings.DeliverySettingsPayload(**payload(**updates))


@pytest.mark.parametrize("kind,expected", [("M2", "12:15"), ("M3", "16:20")])
def test_initial_settings_preserve_automatic_defaults_and_legacy_manual_recipients(kind, expected):
    async def scenario():
        db = AsyncMock()
        absent, legacy = MagicMock(), MagicMock()
        absent.scalars.return_value.first.return_value = None
        legacy.scalars.return_value.first.return_value = SimpleNamespace(recipients={"to": ["previous@example.com"], "cc": ["copy@example.com"]})
        db.execute.side_effect = [absent, legacy]
        result = await settings.read_settings(db, kind)
        assert result["send_time"] == expected and result["is_active"] is True
        assert result["weekdays"] == [0, 1, 2, 3, 4]
        assert result["recipients"]["to"] == ["ga@primexeu.com", "info@primexeu.com"]
        assert result["manual_recipients"]["to"] == ["previous@example.com"]
        assert result["manual_recipients"]["cc"] == ["copy@example.com"]
        db.commit.assert_not_awaited()
    asyncio.run(scenario())


@pytest.mark.parametrize("kind", ["M2", "M3"])
def test_saved_settings_roundtrip_without_updating_other_reports_or_sending_email(kind):
    async def scenario():
        row = settings.default_settings(kind)
        row.manual_recipients = {"to": ["previous@example.com"]}
        other = settings.default_settings("M3" if kind == "M2" else "M2")
        db = AsyncMock()
        selected = MagicMock()
        selected.scalars.return_value.first.return_value = row
        db.execute.return_value = selected
        user_id = uuid.uuid4()
        update = settings.DeliverySettingsPayload(**payload(is_active=False, send_time="17:00", weekdays=[5, 1, 5],
            recipients={"to": ["changed@example.com", "changed@example.com"], "cc": ["copy@example.com"], "bcc": ["hidden@example.com"]}))
        with patch.object(settings, "add_audit_log") as audit, patch("app.services.primeflow_report.GmailService") as gmail:
            result = await settings.save_settings(db, kind, update, user_id)
            reread = await settings.read_settings(db, kind)
        assert result == reread
        assert result["is_active"] is False and result["send_time"] == "17:00" and result["weekdays"] == [1, 5]
        assert result["recipients"] == {"to": ["changed@example.com"], "cc": ["copy@example.com"], "bcc": ["hidden@example.com"]}
        assert result["manual_recipients"]["to"] == ["manual@example.com"]
        assert row.updated_by == user_id
        assert other.is_active is True and other.weekdays == [0, 1, 2, 3, 4]
        assert all(query.args[0].compile().params.get("report_type_1", kind) == kind for query in db.execute.call_args_list)
        assert isinstance(audit.call_args.kwargs["entity_id"], uuid.UUID)
        assert audit.call_args.kwargs["after"] == result
        gmail.assert_not_called()
        db.commit.assert_awaited_once()
    asyncio.run(scenario())


def test_m3_cannot_be_scheduled_before_realization_capture():
    db = AsyncMock()
    with pytest.raises(ValueError, match="16:15"):
        asyncio.run(settings.save_settings(db, "M3", settings.DeliverySettingsPayload(**payload(send_time="16:14")), uuid.uuid4()))
    db.execute.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.parametrize("api,kind", [(m2_api, "M2"), (m3_api, "M3")])
def test_settings_routes_require_manager_and_save_to_correct_report(api, kind):
    app = FastAPI()
    app.include_router(api.router, prefix="/points")
    db = AsyncMock()
    user = SimpleNamespace(id=uuid.uuid4(), role=UserRole.STAFF, full_name="Staff")
    app.dependency_overrides[api.get_db] = lambda: db
    app.dependency_overrides[api.get_current_user] = lambda: user
    with TestClient(app) as client:
        assert client.get("/points/settings").status_code == 403
        assert client.put("/points/settings", json=payload()).status_code == 403
        user.role = UserRole.MANAGER
        expected = settings.settings_payload(settings.default_settings(kind), {"to": ["manual@example.com"], "cc": [], "bcc": []})
        with patch.object(api, "read_settings", new=AsyncMock(return_value=expected)) as read, \
             patch.object(api, "save_settings", new=AsyncMock(return_value=expected)) as save:
            assert client.get("/points/settings").json() == expected
            assert client.put("/points/settings", json=payload(send_time="16:20")).json() == expected
        read.assert_awaited_once_with(db, kind)
        assert save.await_args.args[0] is db and save.await_args.args[1] == kind and save.await_args.args[3] == user.id
        with patch.object(api, "save_settings", new=AsyncMock(side_effect=ValueError("Ora e pavlefshme"))):
            assert client.put("/points/settings", json=payload()).json()["detail"] == "Ora e pavlefshme"
        del app.dependency_overrides[api.get_current_user]
        assert client.get("/points/settings").status_code == 401
    db.commit.assert_not_awaited()


def test_migration_seeds_exact_defaults_and_preserves_manual_configurations():
    module = migration_scripts().get_revision("0145_reporting_points_settings").module
    with patch.object(module, "op") as op:
        module.upgrade()
    assert op.create_table.call_args.args[0] == "reporting_points_settings"
    rows = op.bulk_insert.call_args.args[1]
    assert [(row["report_type"], row["send_time"]) for row in rows] == [("M2", time(12, 15)), ("M3", time(16, 20))]
    assert all(row["recipients"]["to"] == ["ga@primexeu.com", "info@primexeu.com"] for row in rows)
    assert all("manual_recipients" not in row for row in rows)
    op.execute.assert_not_called()
    op.add_column.assert_not_called()


def test_migration_compiles_postgresql_table_and_binds_seed_rows():
    statements = []
    def execute(statement, *parameters, **kwargs):
        statements.append((str(statement.compile(dialect=connection.dialect)), parameters))
    connection = create_mock_engine("postgresql://", execute)
    module = migration_scripts().get_revision("0145_reporting_points_settings").module
    with patch.object(module, "op", Operations(MigrationContext.configure(connection))):
        module.upgrade()
    ddl = statements[0][0]
    assert "CREATE TABLE reporting_points_settings" in ddl
    assert "weekdays INTEGER[] NOT NULL" in ddl
    assert "manual_recipients JSONB" in ddl
    assert "FOREIGN KEY(updated_by) REFERENCES users (id) ON DELETE SET NULL" in ddl
    assert len(statements) == 2 and "INSERT INTO reporting_points_settings" in statements[1][0]
    rows = statements[1][1][0]
    assert [row["report_type"] for row in rows] == ["M2", "M3"]
    assert rows[0]["send_time"] == time(12, 15) and rows[1]["send_time"] == time(16, 20)
