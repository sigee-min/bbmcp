# Ashfox Worker App

This app runs async native pipeline jobs and backend health checks.

Current scope:
- Boots a worker process.
- Performs periodic backend heartbeat checks.
- Claims/completes/fails native pipeline jobs in polling loop.

Environment variables:
- `ASHFOX_WORKER_LOG_LEVEL` (default `info`)
- `ASHFOX_WORKER_HEARTBEAT_MS` (default `5000`)
- `ASHFOX_WORKER_POLL_MS` (default `1200`)
- `ASHFOX_WORKER_NATIVE_PIPELINE` (`1` to enable native pipeline job processing, default `1`)
- `ASHFOX_WORKER_ID` (optional explicit worker identifier)
