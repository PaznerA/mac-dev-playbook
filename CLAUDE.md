# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**devBoxNOS** — Ansible playbook pro automatizované macOS development environment (Apple Silicon M1+). Kompletní self-hosted **Agentic Home Lab** s 40+ Docker službami, SSO (Authentik), secrets vault (Infisical), webovým desktopem (Puter), AI agentem (OpenClaw + Ollama MLX), observability (LGTM stack), a Tailscale remote access. Všechny služby jsou FOSS, data zůstávají lokálně. Replikovatelné — `blank=true` smaže vše a nainstaluje znovu.

Fork of geerlingguy/mac-dev-playbook → přejmenované role pod `pazny.*` namespace.

## Git Workflow

**Veškerý vývoj probíhá ve větvi `dev`.** Branch `master` je release branch — merge do masteru provádí výhradně uživatel ručně. NIKDY necommituj, nepushuj, nevytvářej PR ani worktree z `master`. Všechny operace MUSÍ vycházet z `dev`.

## Commit Convention

- Formát: **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:` atd.)
- **Žádný Co-Authored-By, žádný --author flag, žádné jméno autora.** Git autor se vyplní automaticky z git configu.
- Commit message: stručný, anglicky, imperativ. Tělo volitelné.

## Vision

OS-agnostic "All-in-One PC" pod pracovním názvem **devBoxNOS / Czechbot.eu**. Celá logika a data běží na replikovatelných self-hosted FOSS technologiích. Ansible playbook je single source of truth. OpenClaw (Inspektor Klepítko) je autonomní DevOps agent.

## Key Commands

```bash
# Full playbook run (prompts for sudo + password prefix)
ansible-playbook main.yml -K

# Clean reinstall (wipes data, resets all services, prompts for password prefix)
ansible-playbook main.yml -K -e blank=true

# Run specific component by tag
ansible-playbook main.yml -K --tags "stacks,nginx"
ansible-playbook main.yml -K --tags "observability"
ansible-playbook main.yml -K --tags "ssh,iiab-terminal"

# Syntax validation
ansible-playbook main.yml --syntax-check
```

## Architecture

### Configuration Layering (later overrides earlier)

1. **`default.config.yml`** — all variables with defaults (committed)
2. **`default.credentials.yml`** — all secrets with `changeme_pw_*` defaults (committed)
3. **`config.yml`** — feature toggles override (gitignored)
4. **`credentials.yml`** — secrets override (gitignored)

Passwords follow pattern `{global_password_prefix}_pw_{service}`. Blank run prompts for prefix.

### Playbook Execution Flow (`main.yml`)

1. **Password prefix prompt** (if `blank=true`)
2. **Blank reset** — wipes Docker, data, configs
3. **Auto-enable dependencies** — PostgreSQL, Redis, MariaDB based on `install_*` flags
4. **Auto-generate secrets** — Outline, Bluesky, Authentik, Infisical, Vaultwarden, Paperclip, jsOS
5. **Roles**: osx-command-line-tools → pazny.mac.homebrew → pazny.dotfiles → pazny.mac.mas → pazny.mac.dock
6. **Tasks**: macOS system → SSH/IIAB Terminal → languages/runtimes → nginx → external storage → Docker prereqs → service configs → stack-up → post-start (Authentik OIDC, ERPNext, Bluesky, Superset) → service-side OIDC (Gitea API, Nextcloud occ) → post-provision (Nextcloud, Gitea, WordPress) → stack_verify → jsOS → service registry

### Docker Stacks (8 compose files in `~/stacks/`)

| Stack | Services |
|-------|----------|
| **infra** | MariaDB, PostgreSQL, Redis, Portainer, Traefik, Bluesky PDS, Authentik (server+worker), Infisical |
| **observability** | Grafana, Prometheus, Loki, Tempo |
| **iiab** | WordPress, Nextcloud, n8n, Kiwix, Jellyfin, Open WebUI, Uptime Kuma, Calibre-Web, Home Assistant, RustFS, Puter, Vaultwarden |
| **devops** | Gitea, Woodpecker CI, GitLab, Paperclip |
| **b2b** | ERPNext, FreeScout, Outline |
| **voip** | FreePBX (Asterisk) |
| **engineering** | QGIS Server |
| **data** | Metabase, Apache Superset |

### Non-Docker Applications

- **jsOS** — webový desktop (OS.js v3), Node.js via PM2 (port 8070)
- **OpenClaw** — AI agent daemon via launchd, Ollama 0.19+ s MLX backendem
- **IIAB Terminal** — Python Textual TUI, SSH ForceCommand pro `home` user

### IAM & SSO (Authentik)

Centrální SSO přes Authentik (auth.dev.local). OIDC auto-setup vytváří providery + aplikace pro každou službu automaticky. Single source of truth: `authentik_oidc_apps` list v `default.config.yml`.

**Native OIDC (env vars):** Grafana, Outline, Open WebUI, n8n, GitLab (omniauth)
**Native OIDC (API/CLI):** Gitea (Admin API), Nextcloud (occ), Portainer (UI)
**Proxy auth (nginx forward_auth — access control only):** Uptime Kuma, Calibre-Web, Home Assistant, Jellyfin, Kiwix, WordPress, ERPNext, FreeScout, Infisical, Vaultwarden, Paperclip, Superset, Puter, Metabase
**No SSO:** FreePBX, QGIS, Bluesky PDS

Proxy auth = gates access (Authentik login required), but service shows its own login form. Native OIDC = true SSO ("Login with Authentik" button). Embedded outpost auto-assigned to proxy providers in `authentik_oidc_setup.yml`. Cookie domain `.dev.local` enables cross-subdomain session sharing. Nginx `proxy_redirect` rewrites outpost Location header to public `auth.dev.local` URL.

### Secrets Management

- **Infisical CE** (vault.dev.local) — centrální vault pro infra secrets, REST API + CLI
- **Vaultwarden** (pass.dev.local) — Bitwarden-kompatibilní personal vault pro tenants

### Observability (Apple Silicon optimized)

- **Metrics**: Grafana Alloy (`prometheus.exporter.unix` ARM64-safe) → Prometheus
- **Logs**: Alloy tails nginx/php/agent logs → Loki
- **Traces**: OTLP receiver (gRPC :4317, HTTP :4318) → Tempo

### Nginx Auto-Enable

38 vhost templates in `templates/nginx/sites-available/`. Activate automatically based on `install_*` flags. Override with `nginx_sites_enabled` or extend with `nginx_sites_extra`.

### OIDC Service Registry Pattern (DRY)

Přidání nové služby do SSO = 2 kroky:
1. Entry v `authentik_oidc_apps` list (default.config.yml)
2. OIDC env vars v compose template (gated by `{% if install_authentik %}`)

### Feature Toggle Pattern

51 `install_*` / `configure_*` boolean proměnných. `when:` condition + Tags pro CLI filtering.

## Linting Rules

- **yamllint**: max line length 180 (warning)
- **ansible-lint**: skips `schema[meta]`, `role-name`, `fqcn`, `name[missing]`, `no-changed-when`, `risky-file-permissions`, `yaml`

## Documentation Language

README.md, TLDR.md, inline comments, and task names are in **Czech**.

## Apple Silicon Constraints

- Target: ARM64 only (M1+). `homebrew_prefix: /opt/homebrew`
- Ollama 0.19+: nativní MLX backend (57% faster prefill, 93% faster decode)
- Docker Desktop for Mac (not Colima/Lima)

## Known Tech Debt

- `ansible_env` needs migration to `ansible_facts` before Ansible-core 2.24
- Mattermost removed (no ARM64 FOSS image), config retained for future
- Portainer OIDC requires manual UI setup (no env var support)
- ERPNext migration sometimes fails on first blank run (auto-retry implemented)
