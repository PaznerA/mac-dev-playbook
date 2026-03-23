# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ansible playbook for automated macOS development environment setup (Apple Silicon). Configures dev stacks, web server, CLI tools, self-hosted AI agent (OpenClaw + Ollama), observability (LGTM stack), and 25+ IIAB Docker services. Fork of geerlingguy/mac-dev-playbook.

## Key Commands

```bash
# Full playbook run (prompts for sudo password)
ansible-playbook main.yml -K

# Run specific component by tag
ansible-playbook main.yml -K --tags "observability"
ansible-playbook main.yml -K --tags "nginx,php"

# Dry run
ansible-playbook main.yml -K --check

# Syntax validation
ansible-playbook main.yml --syntax-check

# Linting (must pass before merge)
yamllint .
ansible-lint

# Install/update Galaxy dependencies
ansible-galaxy install -r requirements.yml
```

## CI Pipeline

GitHub Actions runs three stages: **Lint** (yamllint + ansible-lint on Linux) → **Syntax Check** (on Linux) → **Integration** (full playbook + idempotence check on macOS 14/15). Integration runs on pushes to `master` and `claude/**` branches, and on non-draft PRs. CI uses `tests/config.yml` which disables heavy services (Docker, Ollama, Tailscale).

The idempotence check runs the playbook twice — the second run must produce `changed=0 failed=0`.

## Architecture

### Configuration Layering (later overrides earlier)

1. **`default.config.yml`** — all variables with defaults (read-only reference, ~50KB)
2. **`config.yml`** — feature toggles (gitignored, created from `config.example.yml`)
3. **`credentials.yml`** — secrets only (gitignored, created from `credentials.example.yml`)

Variables are loaded in `main.yml` via `vars_files` + `pre_tasks` `include_vars`.

### Playbook Execution Flow (`main.yml`)

1. Loads config layers and gathers facts
2. Runs Galaxy **roles**: osx-command-line-tools → homebrew → dotfiles → mas → dock
3. Runs **tasks** in order: macOS system → languages/runtimes (PHP → Nginx → Node → Bun → Python → Go → .NET) → external storage → IIAB Docker services → networking → shell extras → AI agent → observability → IIAB stack compose up → post-provision hooks

**Ordering matters**: PHP must run before Nginx (socket dependency), external-storage before IIAB/observability (data paths), IIAB stack compose up after individual service configs, mariadb_setup after stack is running.

### Handlers

15 centralized handlers in `main.yml` (nginx, php-fpm, mariadb, grafana, alloy, prometheus, dnsmasq, ssh, openclaw, etc.). Any task file can `notify:` these by name.

### Feature Toggle Pattern

Every component is gated by an `install_*` or `configure_*` boolean variable with a default. The `when:` condition on each `import_tasks` controls inclusion. Tags allow CLI-level filtering on top of this.

### Static Files vs Templates

- **`files/`** — static configs copied as-is (nginx.conf, observability configs, openclaw persona)
- **`templates/`** — Jinja2 templates (`.j2`) rendered with variables (nginx vhosts, docker-compose, starship.toml)

### IIAB Services

Docker-based services managed via a single `docker-compose.yml.j2` template. Individual task files in `tasks/iiab/` configure each service, then `tasks/iiab/stack.yml` runs `docker compose up`. MariaDB setup (`mariadb_setup.yml`) runs last to create databases after the container is up.

## Linting Rules

- **yamllint**: max line length 180 (warning), extends default (`.yamllint`)
- **ansible-lint**: skips `schema[meta]`, `role-name`, `fqcn`, `name[missing]`, `no-changed-when`, `risky-file-permissions`, `yaml` (`.ansible-lint`)

## Documentation Language

README.md, TLDR.md, inline comments, and task names are in **Czech**. Maintain this convention.

## Known Tech Debt

`ansible_env` usage needs migration to `ansible_facts` before Ansible-core 2.24 (see `TODO.md`).
