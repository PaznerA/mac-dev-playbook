# pazny.miniflux

Ansible role for deploying **Miniflux** (minimalistic RSS reader) as a compose override fragment in the devBoxNOS `iiab` stack.

Part of devBoxNOS Wave 2.x role extraction.

## What it does

Single `miniflux` service with native Authentik OIDC SSO (env-var based). No post-start setup — user accounts are provisioned on first OIDC login (`OAUTH2_USER_CREATION=1`). A fallback local admin account (`admin` / `miniflux_admin_password`) is created via `CREATE_ADMIN=1` for bootstrap scenarios without Authentik.

Single invocation from `tasks/stacks/stack-up.yml`:

- **Main (`tasks/main.yml`)** — runs *before* `docker compose up iiab`:
  - Creates `{{ miniflux_data_dir }}` on the host (used only for optional media attachments — PostgreSQL is single source of truth)
  - Renders `templates/compose.yml.j2` into `{{ stacks_dir }}/iiab/overrides/miniflux.yml`
  - Notifies `Restart miniflux` if the override changed

## Requirements

- Docker Desktop for Mac (ARM64)
- `install_postgresql: true` (Miniflux uses Postgres as primary datastore)
- `stacks_shared_network` defined at the play level
- Optional: `install_authentik: true` enables native OIDC env vars

## Variables

| Variable | Default | Description |
|---|---|---|
| `miniflux_version` | `2.2.19` | `miniflux/miniflux` image tag |
| `miniflux_domain` | `rss.{{ instance_tld }}` (fallback `rss.dev.local`) | Public hostname |
| `miniflux_port` | `3011` | Exposed on `127.0.0.1` only (or LAN if `services_lan_access`) |
| `miniflux_data_dir` | `~/miniflux/data` | Host bind mount for attachments/uploads |
| `miniflux_db_name` | `miniflux` | PostgreSQL database name |
| `miniflux_db_user` | `miniflux` | PostgreSQL user |
| `miniflux_mem_limit` | `512m` | Container memory limit (lightweight Go binary) |

Secrets (`miniflux_db_password`, `miniflux_admin_password`) stay in the top-level `default.credentials.yml`.

OIDC client id/secret come from the centralized `authentik_oidc_apps` list in `default.config.yml` via the derived `authentik_oidc_miniflux_client_id` / `authentik_oidc_miniflux_client_secret` variables.

## Usage

From `tasks/stacks/stack-up.yml`, gate on `install_miniflux`:

```yaml
- name: "[Stack] Miniflux render (pazny.miniflux role)"
  ansible.builtin.include_role:
    name: pazny.miniflux
  when: install_miniflux | default(false)
```

## SSO tier

Tier 3 (user) — `devboxnos-users`, `devboxnos-managers`, `devboxnos-admins`.

## Rollback

Revert the commit and delete the dead `~/stacks/iiab/overrides/miniflux.yml`.
