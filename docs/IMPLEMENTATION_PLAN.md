# Offline Laboratory Management System

## What is implemented now

This scaffold turns the project into a workflow-oriented offline LMS with:

- Role-based login using server-side session tokens.
- Admin user management.
- Doctor catalog with referral and commission summary.
- Dynamic test catalog with configurable parameters.
- Reception visit registration with patient, doctor, billing, and test selection.
- Technician worklist with result entry and report finalization.
- Report view and download restrictions enforced by backend.
- Technician one-time print rule with audit logging.
- Local SQLite backup endpoint for admins.

## Backend structure

```text
server.js
src/
  app.js
  config/constants.js
  db/
    connection.js
    helpers.js
    init.js
  middleware/auth.js
  routes/
    authRoutes.js
    backupRoutes.js
    dashboardRoutes.js
    doctorRoutes.js
    testRoutes.js
    userRoutes.js
    visitRoutes.js
  services/
    authService.js
    logService.js
  utils/
    id.js
    reportFormatter.js
```

## Frontend structure

```text
frontend/
  login.html
  admin.html
  reception.html
  technician.html
  styles/app.css
  scripts/
    common.js
    login.js
    admin.js
    reception.js
    technician.js
```

## Database schema

- `users`: credentials, roles, activation.
- `patients`: reusable patient identity.
- `doctors`: referral doctors and commission setup.
- `tests`: lab master catalog.
- `test_parameters`: parameter template for multi-value tests.
- `visits`: one bill per patient visit.
- `visit_tests`: per-test workflow status and technician assignment.
- `reports`: final report lifecycle and print counters.
- `results`: actual reported values.
- `logs`: audit trail for login, report actions, creation events, and backup.

## API overview

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `GET /api/doctors`
- `POST /api/doctors`
- `PUT /api/doctors/:id`
- `GET /api/tests`
- `POST /api/tests`
- `PUT /api/tests/:id`
- `GET /api/visits`
- `GET /api/visits/:id`
- `POST /api/visits`
- `POST /api/visits/:id/results`
- `POST /api/visits/:id/finalize-report`
- `POST /api/visits/:id/print`
- `GET /api/visits/:id/report`
- `GET /api/dashboard/overview`
- `POST /api/backup`

## Workflow mapping

1. Reception logs in and creates a visit.
2. System stores billing, patient, and selected tests.
3. Tests are assigned to active technicians in round-robin mode.
4. Technician opens assigned visit and enters results.
5. Technician or admin finalizes report.
6. Technician can print once; admin can reprint without limit.
7. Reception and admin can open or download printable report output.
8. Every important action writes an audit log entry.

## Recommended next phases

1. Replace in-memory tokens with persisted sessions or LAN-safe JWT rotation.
2. Add real PDF generation using a local library such as `pdfkit`.
3. Add sample collection timestamps, barcode labels, and specimen status.
4. Add report editing history and admin override reason capture.
5. Add scheduled auto-backup and restore UI.
6. Package with Electron for single-click desktop deployment.
