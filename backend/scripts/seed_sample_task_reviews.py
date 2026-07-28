from __future__ import annotations

import asyncio
import random
import sys
from collections import defaultdict
from pathlib import Path

from sqlalchemy import delete, func, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.models.enums import TaskStatus, UserRole
from app.models.project import Project
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_review import TaskReview
from app.models.user import User


SAMPLE_COMMENTS = [
    "Shembull: Rezultat i qartë dhe i përfunduar me kujdes.",
    "Shembull: Punë shumë e mirë dhe komunikim korrekt.",
    "Shembull: Detyra u realizua mirë; ka pak hapësirë për përmirësim.",
    "Shembull: Cilësi e lartë dhe përfundim i rregullt.",
    "Shembull: Rezultat i mirë dhe bashkëpunim i suksesshëm.",
]


async def main() -> None:
    rng = random.Random(20260727)
    replace_samples = "--replace" in sys.argv[1:]
    async with SessionLocal() as db:
        if replace_samples:
            deleted = await db.execute(delete(TaskReview).where(TaskReview.is_sample.is_(True)))
            await db.commit()
            print(f"sample_reviews_deleted={deleted.rowcount or 0}")

        sample_stats = (
            await db.execute(
                select(
                    func.count(TaskReview.id),
                    func.min(Task.completed_at),
                    func.max(Task.completed_at),
                    func.count(TaskReview.id).filter(Task.system_template_origin_id.is_not(None)),
                )
                .select_from(TaskReview)
                .outerjoin(Task, Task.id == TaskReview.task_id)
                .where(TaskReview.is_sample.is_(True))
            )
        ).one()
        if sample_stats[0]:
            print(
                f"sample_reviews_created=0 already_existing={sample_stats[0]} "
                f"completed_from={sample_stats[1]} completed_to={sample_stats[2]} "
                f"system_linked={sample_stats[3]}"
            )
            return

        reviewers = (
            await db.execute(
                select(User)
                .where(
                    User.is_active.is_(True),
                    User.role.in_([UserRole.ADMIN, UserRole.MANAGER]),
                )
                .order_by(User.full_name)
            )
        ).scalars().all()
        if not reviewers:
            raise RuntimeError("No active admin or manager exists to own sample reviews")

        tasks = (
            await db.execute(
                select(Task)
                .where(
                    Task.status == TaskStatus.DONE.value,
                    Task.completed_at.is_not(None),
                    Task.is_active.is_(True),
                    Task.system_template_origin_id.is_(None),
                )
                .order_by(Task.completed_at.desc())
                .limit(300)
            )
        ).scalars().all()
        if not tasks:
            print("sample_reviews_created=0 reason=no_completed_tasks")
            return

        task_ids = [task.id for task in tasks]
        assignment_rows = (
            await db.execute(
                select(TaskAssignee.task_id, User)
                .join(User, User.id == TaskAssignee.user_id)
                .where(TaskAssignee.task_id.in_(task_ids), User.is_active.is_(True))
            )
        ).all()
        assignments: dict = defaultdict(dict)
        for task_id, assigned_user in assignment_rows:
            assignments[task_id][assigned_user.id] = assigned_user

        fallback_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
        fallback_users = (
            (await db.execute(select(User).where(User.id.in_(fallback_ids), User.is_active.is_(True)))).scalars().all()
            if fallback_ids
            else []
        )
        fallback_map = {user.id: user for user in fallback_users}
        for task in tasks:
            if task.assigned_to in fallback_map:
                assignments[task.id][task.assigned_to] = fallback_map[task.assigned_to]

        existing_pairs = {
            (task_id, reviewee_user_id)
            for task_id, reviewee_user_id in (
                await db.execute(
                    select(TaskReview.task_id, TaskReview.reviewee_user_id).where(
                        TaskReview.task_id.in_(task_ids)
                    )
                )
            ).all()
        }
        project_ids = {task.project_id for task in tasks if task.project_id is not None}
        projects = (
            (await db.execute(select(Project).where(Project.id.in_(project_ids)))).scalars().all()
            if project_ids
            else []
        )
        project_map = {project.id: project for project in projects}

        candidates_by_user: dict = defaultdict(list)
        for task in tasks:
            for reviewee in assignments.get(task.id, {}).values():
                if (task.id, reviewee.id) in existing_pairs:
                    continue
                eligible_reviewers = [reviewer for reviewer in reviewers if reviewer.id != reviewee.id]
                if not eligible_reviewers:
                    continue
                candidates_by_user[reviewee.id].append((task, reviewee, eligible_reviewers))

        user_ids = list(candidates_by_user)
        rng.shuffle(user_ids)
        chosen = []
        # Round-robin selection gives the preview variety across users instead
        # of filling all examples from one prolific assignee.
        for round_index in range(3):
            for user_id in user_ids:
                candidates = candidates_by_user[user_id]
                rng.shuffle(candidates)
                if round_index < len(candidates):
                    chosen.append(candidates[round_index])
                if len(chosen) >= 12:
                    break
            if len(chosen) >= 12:
                break

        created: list[TaskReview] = []
        for index, (task, reviewee, eligible_reviewers) in enumerate(chosen):
            reviewer = eligible_reviewers[index % len(eligible_reviewers)]
            project = project_map.get(task.project_id)
            review = TaskReview(
                task_id=task.id,
                reviewee_user_id=reviewee.id,
                reviewer_user_id=reviewer.id,
                diamond_score=1,
                comment=rng.choice(SAMPLE_COMMENTS),
                is_sample=True,
                task_title_snapshot=task.title,
                project_title_snapshot=project.title if project else None,
                reviewee_name_snapshot=reviewee.full_name or reviewee.username or reviewee.email,
                reviewer_name_snapshot=reviewer.full_name or reviewer.username or reviewer.email,
            )
            db.add(review)
            created.append(review)

        await db.commit()
        print(f"sample_reviews_created={len(created)}")
        for review in created:
            print(
                f"- {review.reviewee_name_snapshot}: {review.task_title_snapshot} "
                "(diamond)"
            )


if __name__ == "__main__":
    asyncio.run(main())
