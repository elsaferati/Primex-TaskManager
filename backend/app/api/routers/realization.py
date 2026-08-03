from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.department import Department
from app.models.enums import (
    RealizationLevel,
    RealizationMarker,
    RealizationObservationCategory,
    RealizationObservationVisibility,
    RealizationPeriodStatus,
    RealizationScopeType,
    RealizationSymbol,
    UserRole,
)
from app.models.realization import (
    RealizationDepartmentResult,
    RealizationObservation,
    RealizationPeriod,
    RealizationPersonResult,
)
from app.models.task import Task
from app.models.user import User
from app.models.weekly_planner_snapshot import WeeklyPlannerSnapshot
from app.schemas.realization import (
    RealizationDepartmentResultOut,
    RealizationObservationCreate,
    RealizationObservationOut,
    RealizationObservationVerify,
    RealizationObservationVoid,
    RealizationPeriodOut,
    RealizationPersonResultOut,
    RealizationPersonWorkflowOut,
    RealizationReviewRequest,
    RealizationWeeklyOut,
)
from app.services.audit import add_audit_log
from app.services.realization_access import (
    can_approve_realization,
    can_lock_realization,
    can_review_realization,
    can_view_observation,
    can_view_person_result,
)
from app.services.realization_calculator import calculate_weekly_period
from app.services.realization_periods import (
    RealizationWorkflowError,
    ensure_weekly_period,
    require_unlocked,
    transition_period,
)


router = APIRouter()


def _error(exc: ValueError, code: int = status.HTTP_409_CONFLICT) -> HTTPException:
    return HTTPException(status_code=code, detail=str(exc))


def _ensure_department_scope(user: User, department_id: uuid.UUID) -> None:
    if user.role == UserRole.ADMIN:
        return
    if user.department_id != department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def _period(
    db: AsyncSession, period_id: uuid.UUID, *, for_update: bool = False
) -> RealizationPeriod:
    statement = select(RealizationPeriod).where(RealizationPeriod.id == period_id)
    if for_update:
        statement = statement.with_for_update()
    row = (
        await db.execute(statement)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Realization period not found")
    return row


async def _pinned_snapshots(
    db: AsyncSession, period: RealizationPeriod
) -> tuple[WeeklyPlannerSnapshot | None, WeeklyPlannerSnapshot | None]:
    ids = [item for item in (period.planned_snapshot_id, period.final_snapshot_id) if item]
    rows = (
        (
            await db.execute(
                select(WeeklyPlannerSnapshot).where(WeeklyPlannerSnapshot.id.in_(ids))
            )
        ).scalars().all()
        if ids
        else []
    )
    by_id = {row.id: row for row in rows}
    return by_id.get(period.planned_snapshot_id), by_id.get(period.final_snapshot_id)


def _visible_facts(user: User, result: RealizationPersonResult) -> dict:
    facts = dict(result.facts_json or {})
    if user.role != UserRole.STAFF:
        return facts
    facts["observations"] = [
        item
        for item in facts.get("observations") or []
        if item.get("visibility") != RealizationObservationVisibility.PRIVATE_MANAGER.value
    ]
    questions = []
    for question in facts.get("questions") or []:
        item = dict(question)
        if item.get("key") == "comments":
            for value_key in ("auto_value", "final_value"):
                value = item.get(value_key)
                if isinstance(value, dict):
                    value = dict(value)
                    value["manager_comment"] = None
                    value["override_reason"] = None
                    item[value_key] = value
        questions.append(item)
    facts["questions"] = questions
    return facts


async def _weekly_response(
    db: AsyncSession,
    *,
    period: RealizationPeriod,
    user: User,
    department_name: str | None,
) -> RealizationWeeklyOut:
    rows = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.period_id == period.id
            )
        )
    ).scalars().all()
    visible = [
        row
        for row in rows
        if can_view_person_result(
            user,
            subject_user_id=row.user_id,
            subject_department_id=row.department_id,
        )
    ]
    names = {
        row.id: row.full_name
        for row in (
            await db.execute(
                select(User).where(User.id.in_([item.user_id for item in visible]))
            )
        ).scalars().all()
    } if visible else {}
    active_observations = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.period_id == period.id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalars().all()
    verified_ids: set[uuid.UUID] = set()
    for observation in active_observations:
        evidence = observation.evidence_json or {}
        if (
            observation.source_type == "realization_observation_verification"
            and evidence.get("verified") is True
        ):
            try:
                verified_ids.add(
                    uuid.UUID(str(evidence.get("verification_of") or observation.source_id))
                )
            except (TypeError, ValueError):
                pass
    live_by_user: dict[uuid.UUID, list[dict]] = {}
    for observation in active_observations:
        if (
            observation.source_type == "realization_observation_verification"
            or observation.user_id is None
        ):
            continue
        visibility = RealizationObservationVisibility(observation.visibility)
        if not can_view_observation(
            user,
            subject_user_id=observation.user_id,
            department_id=observation.department_id or period.department_id,
            visibility=visibility,
        ):
            continue
        live_by_user.setdefault(observation.user_id, []).append(
            {
                "id": str(observation.id),
                "marker": observation.marker,
                "category": observation.category,
                "comment": observation.comment,
                "task_id": str(observation.task_id) if observation.task_id else None,
                "evidence_json": observation.evidence_json or {},
                "verified": observation.id in verified_ids
                or (
                    observation.is_system_generated
                    and (observation.evidence_json or {}).get("verified") is True
                ),
                "visibility": observation.visibility,
            }
        )
    people: list[RealizationPersonWorkflowOut] = []
    for row in visible:
        payload = RealizationPersonResultOut.model_validate(row).model_dump()
        payload["facts_json"] = _visible_facts(user, row)
        payload["facts_json"]["observations"] = live_by_user.get(row.user_id, [])
        if user.role == UserRole.STAFF:
            payload["manager_comment"] = None
            payload["override_reason"] = None
        payload["user_name"] = names.get(row.user_id, "Employee")
        people.append(RealizationPersonWorkflowOut.model_validate(payload))
    department_result = (
        await db.execute(
            select(RealizationDepartmentResult).where(
                RealizationDepartmentResult.period_id == period.id
            )
        )
    ).scalar_one_or_none()
    has_planned = period.planned_snapshot_id is not None
    has_final = period.final_snapshot_id is not None
    has_reviewed_result = any(row.reviewed_at is not None for row in rows)
    message = None
    if not has_planned:
        message = "Nuk ka PLANNED snapshot zyrtar për këtë javë."
    elif not has_final:
        message = "Plani ekziston; FINAL snapshot mungon. Ruaje në Weekly Planner."
    return RealizationWeeklyOut(
        period=RealizationPeriodOut.model_validate(period),
        department_name=department_name,
        has_planned_snapshot=has_planned,
        has_final_snapshot=has_final,
        can_calculate=(
            has_planned
            and has_final
            and period.status in {
                RealizationPeriodStatus.OPEN.value,
                RealizationPeriodStatus.CALCULATED.value,
            }
            and not has_reviewed_result
            and user.role in {UserRole.MANAGER, UserRole.ADMIN}
        ),
        message=message,
        people=people,
        department_result=(
            RealizationDepartmentResultOut.model_validate(
                {
                    **RealizationDepartmentResultOut.model_validate(
                        department_result
                    ).model_dump(),
                    "final_comment": None,
                }
            )
            if department_result and user.role == UserRole.STAFF
            else (
                RealizationDepartmentResultOut.model_validate(department_result)
                if department_result
                else None
            )
        ),
        unassigned=(department_result.facts_json or {}).get("unassigned", [])
        if department_result
        else [],
    )


@router.get("/weekly", response_model=RealizationWeeklyOut)
async def get_weekly_realization(
    department_id: uuid.UUID,
    week_start: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationWeeklyOut:
    _ensure_department_scope(user, department_id)
    department = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    try:
        period, _, _ = await ensure_weekly_period(
            db,
            department_id=department_id,
            week_start=week_start,
            created_by=user.id,
        )
        await db.commit()
        await db.refresh(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    return await _weekly_response(
        db, period=period, user=user, department_name=department.name
    )


@router.post("/weekly/calculate", response_model=RealizationWeeklyOut)
async def calculate_realization(
    department_id: uuid.UUID,
    week_start: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationWeeklyOut:
    _ensure_department_scope(user, department_id)
    if user.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    department = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    try:
        period, _, _ = await ensure_weekly_period(
            db,
            department_id=department_id,
            week_start=week_start,
            created_by=user.id,
        )
        period = await _period(db, period.id, for_update=True)
        planned, final = await _pinned_snapshots(db, period)
        before = {"status": period.status}
        await calculate_weekly_period(
            db,
            period=period,
            planned_snapshot=planned,
            final_snapshot=final,
            actor_id=user.id,
        )
        add_audit_log(
            db=db,
            actor_user_id=user.id,
            entity_type="realization_period",
            entity_id=period.id,
            action="calculated",
            before=before,
            after={
                "status": period.status,
                "planned_snapshot_id": str(period.planned_snapshot_id),
                "final_snapshot_id": str(period.final_snapshot_id),
            },
        )
        await db.commit()
        await db.refresh(period)
    except (ValueError, RealizationWorkflowError) as exc:
        await db.rollback()
        raise _error(exc)
    return await _weekly_response(
        db, period=period, user=user, department_name=department.name
    )


@router.post(
    "/periods/{period_id}/results/{result_id}/review",
    response_model=RealizationPersonWorkflowOut,
)
async def review_person_result(
    period_id: uuid.UUID,
    result_id: uuid.UUID,
    payload: RealizationReviewRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationPersonWorkflowOut:
    period = await _period(db, period_id, for_update=True)
    if not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if period.status != RealizationPeriodStatus.CALCULATED.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Period is not awaiting review")
    result = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.id == result_id,
                RealizationPersonResult.period_id == period.id,
            )
        )
    ).scalar_one_or_none()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person result not found")
    final_symbol = payload.final_symbol or RealizationSymbol(result.suggested_symbol)
    final_level = payload.final_level or RealizationLevel(result.suggested_level)
    final_bonus = payload.final_bonus if payload.final_bonus is not None else result.suggested_bonus
    decision = payload.model_copy(
        update={
            "final_symbol": final_symbol,
            "final_level": final_level,
            "final_bonus": final_bonus,
        }
    )
    try:
        decision.validate_against_suggestion(
            suggested_symbol=RealizationSymbol(result.suggested_symbol),
            suggested_level=RealizationLevel(result.suggested_level),
            suggested_bonus=result.suggested_bonus,
        )
    except ValueError as exc:
        raise _error(exc, status.HTTP_422_UNPROCESSABLE_ENTITY)
    before = {
        "final_symbol": result.final_symbol,
        "final_level": result.final_level,
        "final_bonus": result.final_bonus,
    }
    result.final_symbol = final_symbol.value
    result.final_level = final_level.value
    result.final_bonus = final_bonus
    result.manager_comment = payload.manager_comment
    result.override_reason = payload.override_reason
    result.reviewed_by = user.id
    result.reviewed_at = datetime.now(timezone.utc)
    facts = dict(result.facts_json or {})
    known_question_keys = {
        str(question.get("key"))
        for question in facts.get("questions") or []
        if question.get("key")
    }
    unknown_question_keys = set(payload.question_values) - known_question_keys
    if unknown_question_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown question keys: {', '.join(sorted(unknown_question_keys))}",
        )
    questions = []
    for question in facts.get("questions") or []:
        item = dict(question)
        key = item.get("key")
        if key == "suggested_evaluation_level":
            item["final_value"] = final_level.value
            item["source_status"] = "MANAGER_CONFIRMED"
        elif key == "weekly_bonus":
            item["final_value"] = final_bonus
            item["source_status"] = "MANAGER_CONFIRMED"
        elif key == "evaluation":
            item["final_value"] = final_symbol.value
            item["source_status"] = "MANAGER_CONFIRMED"
        elif key == "comments":
            item["final_value"] = {
                "automatic_narrative": result.auto_narrative,
                "manager_comment": payload.manager_comment,
                "override_reason": payload.override_reason,
            }
            item["source_status"] = "MANAGER_CONFIRMED"
        elif key in payload.question_values:
            item["final_value"] = payload.question_values[key]
            item["source_status"] = "MANAGER_CONFIRMED"
        questions.append(item)
    facts["questions"] = questions
    result.facts_json = facts
    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="realization_person_result",
        entity_id=result.id,
        action="reviewed",
        before=before,
        after={
            "final_symbol": result.final_symbol,
            "final_level": result.final_level,
            "final_bonus": result.final_bonus,
            "override_reason": result.override_reason,
        },
    )
    await db.flush()
    remaining = (
        await db.execute(
            select(RealizationPersonResult.id).where(
                RealizationPersonResult.period_id == period.id,
                RealizationPersonResult.reviewed_at.is_(None),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if remaining is None:
        transition_period(period, RealizationPeriodStatus.REVIEWED, actor_id=user.id)
    await db.commit()
    await db.refresh(result)
    subject = (
        await db.execute(select(User).where(User.id == result.user_id))
    ).scalar_one()
    out = RealizationPersonResultOut.model_validate(result).model_dump()
    out["user_name"] = subject.full_name
    return RealizationPersonWorkflowOut.model_validate(out)


@router.post("/periods/{period_id}/approve", response_model=RealizationPeriodOut)
async def approve_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationPeriodOut:
    if not can_approve_realization(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    period = await _period(db, period_id, for_update=True)
    try:
        transition_period(period, RealizationPeriodStatus.APPROVED, actor_id=user.id)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    now = datetime.now(timezone.utc)
    results = (
        await db.execute(
            select(RealizationPersonResult).where(
                RealizationPersonResult.period_id == period.id
            )
        )
    ).scalars().all()
    for result in results:
        result.approved_by = user.id
        result.approved_at = now
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_period",
        entity_id=period.id, action="approved",
        before={"status": "REVIEWED"}, after={"status": "APPROVED"},
    )
    await db.commit()
    await db.refresh(period)
    return RealizationPeriodOut.model_validate(period)


@router.post("/periods/{period_id}/lock", response_model=RealizationPeriodOut)
async def lock_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationPeriodOut:
    if not can_lock_realization(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    period = await _period(db, period_id, for_update=True)
    try:
        transition_period(period, RealizationPeriodStatus.LOCKED, actor_id=user.id)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_period",
        entity_id=period.id, action="locked",
        before={"status": "APPROVED"}, after={"status": "LOCKED"},
    )
    await db.commit()
    await db.refresh(period)
    return RealizationPeriodOut.model_validate(period)


@router.post("/observations", response_model=RealizationObservationOut)
async def create_observation(
    payload: RealizationObservationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationObservationOut:
    if payload.period_id is None:
        raise HTTPException(status_code=422, detail="period_id is required")
    period = await _period(db, payload.period_id, for_update=True)
    try:
        require_unlocked(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    _ensure_department_scope(user, period.department_id)
    subject_id = payload.user_id
    if user.role == UserRole.STAFF:
        if subject_id != user.id:
            raise HTTPException(status_code=403, detail="Staff may submit only their own observations")
        if payload.marker == RealizationMarker.NEGATIVE:
            raise HTTPException(status_code=403, detail="Only managers may create negative or private evidence")
        if payload.visibility == RealizationObservationVisibility.PRIVATE_MANAGER:
            raise HTTPException(status_code=403, detail="Only managers may create private evidence")
    elif not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    if payload.department_id is not None and payload.department_id != period.department_id:
        raise HTTPException(status_code=422, detail="Observation department must match its period")
    if payload.scope_type in {RealizationScopeType.TASK, RealizationScopeType.SYSTEM_TASK}:
        if subject_id is None:
            raise HTTPException(status_code=422, detail="Task observations require user_id attribution")
        task = (
            await db.execute(select(Task).where(Task.id == payload.task_id))
        ).scalar_one_or_none()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
    if subject_id is not None:
        subject = (
            await db.execute(select(User).where(User.id == subject_id))
        ).scalar_one_or_none()
        if subject is None or subject.department_id != period.department_id:
            raise HTTPException(
                status_code=422,
                detail="Observation subject must belong to the period department",
            )
    observation_data = payload.model_dump(mode="python")
    observation_data["department_id"] = period.department_id
    observation = RealizationObservation(
        **observation_data,
        is_system_generated=False,
        created_by=user.id,
    )
    db.add(observation)
    await db.flush()
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_observation",
        entity_id=observation.id, action="created", after={"period_id": str(period.id)},
    )
    await db.commit()
    await db.refresh(observation)
    return RealizationObservationOut.model_validate(observation)


@router.post("/observations/{observation_id}/verify", response_model=RealizationObservationOut)
async def verify_observation(
    observation_id: uuid.UUID,
    payload: RealizationObservationVerify,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationObservationOut:
    original = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.id == observation_id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if original is None or original.period_id is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    if original.source_type == "realization_observation_verification":
        raise HTTPException(status_code=422, detail="Verification events cannot be verified")
    period = await _period(db, original.period_id, for_update=True)
    try:
        require_unlocked(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    if not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    existing = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.period_id == period.id,
                RealizationObservation.source_type == "realization_observation_verification",
                RealizationObservation.source_id == original.id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existing:
        return RealizationObservationOut.model_validate(existing)
    verification = RealizationObservation(
        period_id=period.id,
        scope_type=original.scope_type,
        task_id=original.task_id,
        user_id=original.user_id,
        project_id=original.project_id,
        department_id=period.department_id,
        marker=RealizationMarker.NEUTRAL.value,
        category=RealizationObservationCategory.OTHER.value,
        comment=payload.comment,
        evidence_json={"verified": True, "verification_of": str(original.id)},
        source_type="realization_observation_verification",
        source_id=original.id,
        is_system_generated=False,
        visibility=original.visibility,
        created_by=user.id,
    )
    db.add(verification)
    await db.flush()
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_observation",
        entity_id=original.id, action="verified", after={"verification_id": str(verification.id)},
    )
    await db.commit()
    await db.refresh(verification)
    return RealizationObservationOut.model_validate(verification)


@router.post("/observations/{observation_id}/void", response_model=RealizationObservationOut)
async def void_observation(
    observation_id: uuid.UUID,
    payload: RealizationObservationVoid,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RealizationObservationOut:
    observation = (
        await db.execute(
            select(RealizationObservation).where(
                RealizationObservation.id == observation_id,
                RealizationObservation.voided_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if observation is None or observation.period_id is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    period = await _period(db, observation.period_id, for_update=True)
    try:
        require_unlocked(period)
    except RealizationWorkflowError as exc:
        raise _error(exc)
    if not can_review_realization(user, department_id=period.department_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    observation.voided_at = datetime.now(timezone.utc)
    observation.voided_by = user.id
    observation.void_reason = payload.reason
    add_audit_log(
        db=db, actor_user_id=user.id, entity_type="realization_observation",
        entity_id=observation.id, action="voided",
        before={"voided_at": None}, after={"reason": payload.reason},
    )
    await db.commit()
    await db.refresh(observation)
    return RealizationObservationOut.model_validate(observation)
