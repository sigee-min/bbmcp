# Ashfox Environment Presets

Keep runtime preset examples under this folder to avoid cluttering the repository root.

Preset files:
- `deploy/env/presets/local.env.example`
- `deploy/env/presets/selfhost.env.example`
- `deploy/env/presets/ashfox.env.example`
- `deploy/env/presets/appwrite.env.example`

Usage:
1. Pick a preset file.
2. Copy it to your secure runtime environment store (for example, `deploy/.env` outside source control).
3. Set `ASHFOX_PERSISTENCE_PRESET` and fill only matching preset credentials.
4. Run docker compose with that environment loaded.

Compose files:
- `deploy/docker-compose.yml`: deployment-first file (image tags only)
- `deploy/docker-compose.build.yml`: local source-build override
- `deploy/.env.example`: runtime variables and image tags template
- `docker/Dockerfile.workspace-deps`: shared dependency image for local source builds
