# Changelog

All notable changes to devBoxNOS will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-07

### Added
- Initial release as devBoxNOS platform
- 40+ self-hosted FOSS services across 8 Docker stacks
- OpenClaw AI agent (Inspektor Klepitko) with 10 sub-agents
- Authentik SSO with automated OIDC onboarding for 12 services
- Infisical CE secrets vault
- Observability stack (Grafana, Prometheus, Loki, Tempo)
- IIAB Terminal (SSH TUI hub)
- jsOS web desktop
- Puter cloud OS
- Blank reset mechanism (full reinstall with `blank=true`)
- Service registry with Grafana dashboard
- Tailscale remote access
- Per-system AGENTS.md and SKILLS.md documentation

### Changed
- Fork diverged from geerlingguy/mac-dev-playbook
- Roles renamed to `pazny.*` namespace
- All services optimized for Apple Silicon (ARM64)

## [Unreleased]

### Planned
- Instance identity system (custom TLD per client)
- Box Management API (FastAPI)
- Backup/restore via Restic
- State export/import for hardware migration
- Local CI via Woodpecker
- Heartbeat/fleet reporting
