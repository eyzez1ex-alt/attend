# Firebase SQL Connect setup

This schema uses Firebase SQL Connect with Cloud SQL for PostgreSQL. It contains no seeded employees, attendance, coordinates, vacation requests, or holiday dates.

Before deployment:

1. In Firebase Console, create a SQL Connect service for project `attend-d21ae` and choose its region, Cloud SQL instance, and database.
2. Copy `dataconnect.yaml.example` to `dataconnect/dataconnect.yaml` and replace every `REPLACE_WITH_...` value with the values shown in that service.
3. Copy `firebase.json.example` to `firebase.json`.
4. Set `VITE_DATACONNECT_SERVICE`, `VITE_DATACONNECT_LOCATION`, and `VITE_DATACONNECT_CONNECTOR` in `.env.local` to match the service and connector.
5. Generate the typed web SDK with `firebase dataconnect:sdk:generate`, then add reviewed query and mutation definitions before deploying.

Cloud SQL provisioning and SQL Connect deployment can create billable Google Cloud resources. Review the selected region and billing plan in Firebase Console before deploying.

## Attendance rules to enforce in trusted operations

- The geofence radius is fixed at exactly 600 m (area approximately 1,130,973 m²).
- A present or late day counts only after both `checkInAt` and `checkOutAt` exist.
- Official holidays, weekly holidays, and approved vacations are excluded from absence calculations.
- Client GPS is only a UI signal. A trusted server operation must validate location and attendance before recording it.
- Only a verified `yusufgibrel3@gmail.com` owner session may grant or revoke moderators. The backend must enforce this rule and assign moderator claims; hiding a menu item is not authorization.
- Monthly PDF/Excel report generation and delivery require a scheduled trusted service. Browser code cannot run reliably when employees or administrators are offline.
