# Realization PR-01 implementation checklist

## Contract and persistence

- [x] Record the additive architecture and immutable evidence decision in an ADR.
- [x] Add Realization enums without changing existing enum values.
- [x] Add policy-version, period, observation, person-result, and
      department-result models.
- [x] Add database constraints for period shape, evidence requirements,
      suggested/final separation, and non-negative counters.
- [x] Add indexes for period, observation, person, department, repeat-key, and
      source lookups.
- [x] Add one migration on top of both current Alembic heads.
- [x] Seed version 1 of the A+/A/B/C/M/D/E decision tree and bonus guide.
- [x] Verify upgrade SQL and downgrade ordering.

## API contracts and permissions

- [x] Add Pydantic contracts for the five PR-01 resources.
- [x] Validate observation comments and category-specific evidence.
- [x] Validate complete final decisions and override reasons.
- [x] Add pure role/department/visibility authorization helpers.
- [x] Test STAFF, MANAGER, and ADMIN boundaries.

## Scope protection

- [x] Do not modify task models or task lifecycle code.
- [x] Do not modify planner/snapshot behavior.
- [x] Do not modify Reviews or diamonds behavior.
- [x] Do not add a router or expose an endpoint before tests.
- [x] Do not add frontend code.
- [x] Do not implement evidence collection, scoring, export, email, or UI.

## Verification

- [x] Run focused Realization tests (21 passing).
- [ ] Run the existing backend unit-test suite cleanly. Attempted: 211 tests
      ran; 13 unrelated pre-existing failures/errors remain outside PR-01.
- [x] Import all SQLAlchemy models and inspect metadata constraints.
- [x] Compile the migration and generate isolated offline upgrade/downgrade SQL.
- [x] Confirm the worktree contains no out-of-scope edits.
