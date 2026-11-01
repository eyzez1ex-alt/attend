# Firebase SQL Connect setup

This schema uses Firebase SQL Connect with Cloud SQL for PostgreSQL. It contains no seeded employees, attendance, coordinates, vacation requests, or holiday dates. The web app now calls the named connector operations through Firebase's Data Connect SDK and reads no local/mock records.

Before deployment:

1. In Firebase Console, create a SQL Connect service for project `attend-d21ae` and choose its region, Cloud SQL instance, and database.
2. Copy `dataconnect.yaml.example` to `dataconnect/dataconnect.yaml` and replace every `REPLACE_WITH_...` value with the values shown in that service.
3. The active Firebase project alias is `attend-d21ae`. The current `firebase.json` deploys the restrictive Storage rules only. Add the Data Connect source to it after the service config exists, or use `firebase.json.example` as a combined template.
4. Set `VITE_DATACONNECT_SERVICE`, `VITE_DATACONNECT_LOCATION`, and `VITE_DATACONNECT_CONNECTOR` in `.env.local` to match the service and connector.
5. Generate the typed web SDK with `firebase dataconnect:sdk:generate`, then deploy after reviewing SQL schema migrations and operation authorization: `firebase deploy --only dataconnect`.
6. Deploy the Storage rules separately with `firebase deploy --only storage` after confirming the project shown by the CLI.

## Access policy

- SQL Connect operations require a verified Firebase Authentication account.
- Employee profile, attendance, and vacation reads filter by `auth.uid`.
- Manager reads and vacation/holiday/location changes require the verified owner email or a backend-assigned moderator/admin claim.
- Only the verified owner email can read the moderator access list. Grant/revoke operations are intentionally absent from the browser and must be implemented by a trusted Admin SDK service that checks this owner identity.
- The sole workplace record uses the key `primary`; the save operation writes the exact 600 m radius and does not accept a radius from the browser.
- Storage lets verified managers read files below `monthly-reports/`; browser writes and all other Storage access are denied.
- Attendance registration and edits are not writable from the browser. A trusted operation must validate GPS, enforce 600 m, require sign-in/out for a completed day, and record the audit entry.

Cloud SQL provisioning and SQL Connect deployment can create billable Google Cloud resources. Review the selected region and billing plan in Firebase Console before deploying.

## Attendance rules to enforce in trusted operations

- The geofence radius is fixed at exactly 600 m (area approximately 1,130,973 m²).
- A present or late day counts only after both `checkInAt` and `checkOutAt` exist.
- Official holidays, weekly holidays, and approved vacations are excluded from absence calculations.
- Client GPS is only a UI signal. A trusted server operation must validate location and attendance before recording it.
- Only a verified `yusufgibrel3@gmail.com` owner session may grant or revoke moderators. The backend must enforce this rule and assign moderator claims; hiding a menu item is not authorization.
- Monthly PDF/Excel report generation and delivery require a scheduled trusted service. Browser code cannot run reliably when employees or administrators are offline. The web app can query the protected report archive and download stored files when the scheduled service publishes them.
