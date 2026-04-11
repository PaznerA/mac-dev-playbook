# Wave 2 — Role Migration Design

Status: design, pre-implementation. Target branch: `dev`. Pilot scope: three roles (`pazny.glasswing`, `pazny.mariadb`, `pazny.grafana`).

This document describes how the devBoxNOS playbook migrates from inline `tasks/` files plus monolithic `templates/stacks/<stack>/docker-compose.yml.j2` files into per-service Ansible roles. It is the operational plan for the coordinator who will implement the Wave 2.1 pilot in a follow-up session. Wave 2.2+ (the rest of the services) is sketched at the end so the pilot leaves a usable runway.

---

## 1. Context & motivation

Wave 1 of the state-declarative refactor just landed on `dev`. The relevant commits, top to bottom of `git log dev`:

- `ec3e3c8` — refactor(verify): data-driven `stack_verify` via health-probes catalog
- `73622b8` — fix(handlers): repair stack paths and add missing `Restart boxapi`
- `8e822a2` — drift detection on mutating `occ` and `psql` tasks via stdout markers
- `10a2bae` — `install_observability` defaults to true in all referring expressions
- `5b3ec90` — `default_admin_email` var, drop `admin@dev.local` literals
- `2a5b0f0` — canonicalize `docker exec` to `compose -p <proj> exec -T <svc>`
- `57017a0` — replace dead-code `changeme_*` fallbacks with prefix templates
- `697517e` — handlers, blank hardening, prefix persistence, stateless secrets
- `4c65ba7` — state-declarative admin password reconverge across all services
- `de7c544` — Galaxy collections + idempotence smoke test (`tests/test-idempotence.sh`)
- `e0ff16e` — Authentik blueprints replace `oidc_setup`

The playbook is now idempotent end to end, secrets reconverge declaratively from `global_password_prefix`, and `tasks/iiab/stack_verify.yml` is data-driven via the P0.2 health-probes catalog. With the imperative bits stabilized, the next step is **structural**: extract services into standalone roles so they can be:

1. **Reused across client deployments.** Each Czechbot.eu client box wires together a different subset of the catalogue (HQ vs factory vs sales — see `docs/fleet-architecture.md`). A role-shaped service is something a client playbook can `include_role:` and skip the parts it does not need.
2. **Extracted to per-service Galaxy repos in Wave 3.** When `pazny.mariadb` is a self-contained directory with `defaults/`, `tasks/`, `templates/`, `meta/`, and a README, lifting it into `github.com/pazny/ansible-role-mariadb` is a `git mv` plus a `requirements.yml` entry. Today the same service is spread across `templates/stacks/infra/docker-compose.yml.j2` (lines 8-39), `tasks/iiab/mariadb_setup.yml`, the `Restart mariadb` handler in `main.yml`, and the `mariadb_*` variables in `default.config.yml` — extraction means tracing all of those by hand.
3. **Cleaner separation between orchestration and service logic.** `main.yml`, `tasks/stacks/core-up.yml`, and `tasks/stacks/stack-up.yml` are the orchestration spine. They should know about ordering, networks, and the always-first invariant — not about MariaDB users or Grafana provisioning paths.

The full wave structure lives in `~/.claude/plans/batch-refactor-roadmap.md` (out of repo, planning notes). This doc is the in-repo reference; it stays self-contained so a contributor can execute the pilot without reading the planning file.

---

## 2. Compose-include pattern (the critical architectural decision)

### Chosen strategy: Option (a) — per-role compose override files

Each role's `templates/compose.yml.j2` renders to `{{ stacks_dir }}/<stack>/overrides/<svc>.yml`. The orchestrator (`core-up.yml`, `stack-up.yml`) enumerates `overrides/*.yml` at run time with `ansible.builtin.find` and passes each match as an additional `-f` flag to `docker compose`.

Concrete example for the infra stack post-pilot:

```yaml
- name: "[Core] Discover infra compose overrides from roles"
  ansible.builtin.find:
    paths: "{{ stacks_dir }}/infra/overrides"
    patterns: "*.yml"
  register: _infra_overrides
  failed_when: false

- name: "[Core] Build infra compose -f flag list"
  ansible.builtin.set_fact:
    _infra_compose_files: >-
      -f "{{ stacks_dir }}/infra/docker-compose.yml"
      {% for f in (_infra_overrides.files | default([]) | sort(attribute='path')) -%}
      -f "{{ f.path }}"
      {% endfor %}

- name: "[Core] Start INFRA stack (docker compose up --wait)"
  ansible.builtin.shell: >
    {{ docker_bin }} compose
    {{ _infra_compose_files }}
    -p infra
    up -d --remove-orphans --wait --wait-timeout 120
```

Properties of this approach:

- **Base file shrinks.** `templates/stacks/infra/docker-compose.yml.j2` shrinks as services migrate out. Eventually it may contain only the `networks:` declaration (the `infra_net` bridge plus the external `{{ stacks_shared_network }}` reference). That is the steady state — the base file becomes a network declaration the per-service overrides attach to.
- **Backward compatible.** An empty `overrides/` directory means the `find` registers `_infra_overrides.files == []`, no extra `-f` flags are added, and `docker compose` runs with the base file alone — exactly how things work today pre-migration. The pilot can land one role at a time without breaking the others.
- **Sorted enumeration.** `sort(attribute='path')` keeps the merge order deterministic across runs — important for compose key precedence (later `-f` files override earlier ones for scalar fields, deep-merge for maps/lists).
- **Per-service ordering** is still controlled by `core-up.yml` (see Section 5). Compose itself does not promise startup order beyond `depends_on`, and merging files does not change that.

### Option (b) — single merged compose rendered by an orchestrator (REJECTED)

Have a top-level Ansible task collect per-role compose fragments via `lookup('file', ...)` or `include_tasks` and assemble one big `docker-compose.yml` per stack.

Rejected because:
- It adds a rendering layer that has to understand YAML merging semantics, which `docker compose -f` already handles natively.
- It still tightly couples roles to their parent stack — the orchestrator has to know which fragments belong to `infra` vs `observability`.
- It reintroduces the monolithic file under a new name. The whole point of Wave 2 is that no single file should describe more than one service.

### Option (c) — per-service compose projects (REJECTED)

Run each service as its own compose project (`docker compose -p mariadb up`, `docker compose -p grafana up`, …).

Rejected because:
- It explodes the number of running compose projects from ~8 (one per stack) to ~40 (one per service). That breaks `docker compose ls`, Portainer's stack view, and the operator's mental model of "infra is up / iiab is up".
- Cross-service networking would require explicit `external: true` networks linked into every project, instead of the current `stacks_shared_network` that all stacks join. Today a service in `iiab` reaching `mariadb` in `infra` works because both compose projects attach to the same external bridge — Wave 2 must preserve that.
- Volume names and project labels would become the per-service unique key, breaking the assumption that `docker compose -p infra down -v` cleans up everything infra-related.

---

## 3. Canonical role skeleton

Target directory layout for one role. `pazny.mariadb` is the exemplar because it has all the interesting pieces — compose fragment, post-start task, handlers, cross-service consumers.

```
roles/pazny.mariadb/
├── defaults/
│   └── main.yml             # mariadb_* variables sourced from default.config.yml
├── tasks/
│   ├── main.yml             # orchestrator: create dirs, render compose override
│   └── post.yml             # post-start: DB users, grants, drop test DB
├── templates/
│   └── compose.yml.j2       # mariadb service block, lifted from infra base
├── handlers/
│   └── main.yml             # service-specific handlers (none needed for mariadb today)
├── meta/
│   └── main.yml             # collections: community.mysql
├── files/                   # empty for mariadb; grafana uses it for provisioning/
└── README.md                # variables, dependent services, usage notes
```

File-by-file source map for the pilot roles:

| Role file | Source in current repo |
|-----------|------------------------|
| `roles/pazny.mariadb/defaults/main.yml` | `mariadb_*` block in `default.config.yml`, plus the `mariadb_databases` / `mariadb_users` lists currently defined there |
| `roles/pazny.mariadb/tasks/main.yml` | New thin orchestrator: ensure `{{ mariadb_data_dir }}` exists, render `templates/compose.yml.j2` to `{{ stacks_dir }}/infra/overrides/mariadb.yml` |
| `roles/pazny.mariadb/tasks/post.yml` | Verbatim move from `tasks/iiab/mariadb_setup.yml` |
| `roles/pazny.mariadb/templates/compose.yml.j2` | Lines 8–39 of `templates/stacks/infra/docker-compose.yml.j2` (the `mariadb:` service block plus its `{% if install_mariadb %}` guard), wrapped in a top-level `services:` map and a matching `networks:` stanza copied verbatim from the base file |
| `roles/pazny.mariadb/handlers/main.yml` | `Restart mariadb` from `main.yml` (line 118) |
| `roles/pazny.mariadb/meta/main.yml` | `collections: [community.mysql]` (currently declared globally in `requirements.yml`) |
| `roles/pazny.mariadb/README.md` | New file: variables, dependent services (`mariadb_databases` / `mariadb_users`), example invocation |

| Role file | Source in current repo (for `pazny.glasswing`) |
|-----------|-----------------------------------------------|
| `roles/pazny.glasswing/tasks/main.yml` | Verbatim move from `tasks/glasswing.yml` |
| `roles/pazny.glasswing/defaults/main.yml` | `glasswing_*` variables from `default.config.yml` |
| `roles/pazny.glasswing/handlers/main.yml` | none — `notify: Restart php-fpm` continues to fire the play-level handler |
| `roles/pazny.glasswing/templates/` | none — Glasswing is non-Docker, no compose fragment |

| Role file | Source in current repo (for `pazny.grafana`) |
|-----------|---------------------------------------------|
| `roles/pazny.grafana/tasks/main.yml` | Directory + provisioning template renders currently in `core-up.yml` lines ~71–73, ~184–198 (Grafana datasources / dashboards / data dirs) |
| `roles/pazny.grafana/tasks/post.yml` | Verbatim move from `tasks/iiab/grafana_admin.yml` |
| `roles/pazny.grafana/templates/compose.yml.j2` | Grafana service block from `templates/stacks/observability/docker-compose.yml.j2` lines 11–76, plus the `networks:` stanza |
| `roles/pazny.grafana/files/provisioning/` | Pulled from `files/observability/grafana/provisioning/` (datasources + dashboards `.j2` files) |
| `roles/pazny.grafana/handlers/main.yml` | `Restart grafana` from `main.yml` (line 141) |

### What stays in the main repo

Stays put — do not move into roles:

- **`files/project-glasswing/`** — Glasswing application source (PHP, composer.json, Latte templates). The role rsyncs this from the playbook directory; treating it as role `files/` would force every consumer to vendor the app.
- **`default.credentials.yml` and `credentials.yml`** — central secrets. Role defaults reference variables (`{{ mariadb_root_password }}`) that resolve through the central credentials file. This is a deliberate decision; see Section 7.
- **`requirements.yml`** — authoritative install list for Ansible Galaxy collections. Per-role `meta/main.yml` is documentation and a soft assert; CI/CD installs from `requirements.yml`.
- **`main.yml`** — play-level handlers (`Restart nginx`, `Restart php-fpm`) and the role wiring itself.

---

## 4. Per-service migration order

### Wave 2.1 — pilot (this session, coordinator implements)

1. **`pazny.glasswing`** — first because it is the simplest. Non-Docker, no compose override, no post-start surprises, no shared-network coupling. The pilot exists to prove the role wiring (`include_role` from inside `tasks:`, handler visibility, tag inheritance) without also fighting compose semantics. If glasswing is green, the role-vs-include-tasks plumbing works.
2. **`pazny.mariadb`** — second because it introduces the compose-override pattern and the post-start task pattern. MariaDB is a foundation service: a successful migration here is the template for every Docker role to come. It is also the simplest Docker service in the stack (no provisioning files, no SSO env vars, no host-side configs).
3. **`pazny.grafana`** — third because it adds the two pieces glasswing and mariadb skipped: provisioning files (`files/observability/grafana/provisioning/*.yml.j2`) shipped through the role, and the `stacks_shared_network` external network gotcha. Grafana also has the post-start admin password reconverge, so it exercises the same `tasks/post.yml` slot mariadb introduced.

### Wave 2.2 — follow-up sprints (out of pilot scope)

Group the remaining services by risk so the coordinator can stage them. Each tier introduces a new class of concern; finish a tier before starting the next.

**Low risk** (single container, no post-start, no SSO, single consumer):
- `pazny.uptime_kuma`, `pazny.calibreweb`, `pazny.jellyfin`, `pazny.kiwix`

These follow the mariadb template almost verbatim. The only thing to check per service is that the nginx vhost in `templates/nginx/sites-available/` still references the right hostname after the role declares its compose port.

**Medium risk** (foundation services, multiple consumers, post-start setup):
- `pazny.postgresql`, `pazny.redis`, `pazny.prometheus`, `pazny.loki`, `pazny.tempo`

Generic gotcha: every service that uses these as a backend (Authentik on Postgres, Outline on Redis, Grafana on Loki/Tempo as datasources) reads connection details from variables that today live next to the consumer's compose block. The role default needs to expose the connection string in a way the consumer can pick up — usually as `<svc>_connection_uri` published via `set_fact` in the role's `tasks/post.yml`.

**High risk** (blueprints, provisioning, post-start hair, cross-role secrets):
- `pazny.authentik`, `pazny.nextcloud`, `pazny.gitea`, `pazny.erpnext`, `pazny.openwebui`

Generic gotcha: these services bind OIDC clients, render blueprints, run schema migrations, and require provisioning before the first compose up (Authentik blueprints) or after (Nextcloud `occ`, Gitea Admin API, ERPNext `bench migrate`). The role boundary has to be drawn carefully so post-start scripts that touch the central `authentik_oidc_apps` registry stay declarative. Sequencing inside `core-up.yml` matters more here than for the medium tier.

**Very high risk** (stateful, destructive on rotation, bridge scripts):
- `pazny.infisical`, `pazny.bluesky_pds`, `pazny.paperclip`

Generic gotcha: these own first-boot state that cannot be re-derived from `credentials.yml` alone. Infisical's encryption key rotation invalidates every existing secret. Bluesky PDS's PLC rotation key is a one-shot identity. Paperclip's S3 credentials are baked into a sub-database. Migrating these last gives the rest of the pattern time to settle so the irreversible operations happen against a known-good role layout.

For each tier, write a checklist before migration begins. Do not start tier N+1 until tier N is fully merged and a clean `blank=true` smoke run is green.

---

## 5. Post-start sequencing strategy

The current `core-up.yml` orchestrates a strict sequence that other roles depend on:

1. Render compose templates (infra + observability).
2. `docker compose up infra --wait`.
3. MariaDB post-start (databases, users, grants).
4. PostgreSQL post-start (databases, users, extensions).
5. `docker compose up observability --wait`.
6. Grafana admin password reconverge.
7. Authentik / Infisical / Bluesky PDS post-start.

This ordering matters. Grafana's compose env vars assume the Postgres `grafana` user exists (otherwise the container restart-loops on first boot). Authentik needs the schema ready before its bootstrap user can be created. Bluesky PDS post-start needs the container running before `goat` can hit it. Any sequencing change risks a cascade of first-boot failures that take a `blank=true` rerun to clear.

### Option A — `core-up.yml` keeps sequencing authority (RECOMMENDED for pilot)

The role's `tasks/main.yml` handles everything that has to happen *before* compose up: directory creation, compose fragment rendering, provisioning file rendering. The role's `tasks/post.yml` handles everything that has to happen *after* compose up: DB users, password reconverge, OIDC client registration.

`core-up.yml` continues to call them in order, explicitly:

```yaml
- name: "[Core] MariaDB post-start: create databases and users"
  ansible.builtin.include_role:
    name: pazny.mariadb
    tasks_from: post.yml
  when:
    - install_mariadb | default(false)
    - _core_infra_enabled | bool
  tags: ['mariadb']
```

Pros:
- Explicit, debuggable. The orchestration spine still answers "what runs in what order" without consulting role metadata.
- Matches the current mental model. The diff against today's `core-up.yml` is a one-line swap (`include_tasks` becomes `include_role`).
- Tags work the same way they did before — no surprise about which tasks `--tags mariadb` selects.

Cons:
- `core-up.yml` still grows as roles land. Each new role with a `post.yml` adds an `include_role` line.

### Option B — meta-dependency-driven sequencing (DEFERRED to Wave 2.2+)

Roles declare `meta/main.yml` dependencies (`pazny.grafana` depends_on `pazny.postgresql`). Post-start moves into `tasks/main.yml` with `wait_for` guards on the upstream service's health endpoint. Ansible's role dependency resolver handles ordering.

Pros:
- Orchestration disappears from `core-up.yml`. The dependency graph lives next to the services.

Cons:
- Subtle race conditions. `wait_for` against a healthcheck endpoint is not the same as "the post-start of the upstream role has completed" — the endpoint may be reachable while the user creation step is still running.
- The Ansible dependency graph mirrors nothing Docker knows about. Healthchecks, `depends_on: condition: service_healthy`, and the actual schema state are all separate signals.
- Hard to debug. When a sequence breaks, the error surfaces deep inside a role with no obvious link to the dependency that was supposed to satisfy it.

**Recommendation: Option A for the pilot.** Document Option B as a non-goal until Wave 2.2 has converted all medium-risk roles. Re-evaluate then with real data on how big `core-up.yml` has grown.

---

## 6. Testing workflow per role

Run these commands in order for each role as it lands. None of them require a clean machine until the final smoke test.

```bash
# 1. Syntax check — fails fast on YAML / Jinja errors
ansible-playbook main.yml --syntax-check

# 2. Static analysis — role-scoped lint
ansible-lint roles/pazny.<svc>/
yamllint roles/pazny.<svc>/

# 3. Dry-run with --check --diff to preview what would change
ansible-playbook main.yml -K --tags <svc> --check --diff

# 4. Live run with the role's tag (non-destructive for most services)
#    Caveat: mariadb and grafana restart their containers; do not run during
#    business hours unless you know the data dir is in a known state
ansible-playbook main.yml -K --tags <svc>

# 5. Full blank smoke test — only after all 3 pilot roles have landed
ansible-playbook main.yml -K -e blank=true
```

After step 5, run the regression harness at the repo root:

```bash
./tests/test-idempotence.sh
```

This script runs the playbook twice and asserts the second run reports zero changed tasks. Wave 1 added it; Wave 2 must keep it green.

---

## 7. Open questions (resolved)

These three decisions are locked. Do not re-litigate them mid-pilot.

### Role location

Roles live in `roles/` inside this repo, alongside the existing `pazny.dotfiles`, `pazny.mac.homebrew`, `pazny.mac.mas`, `pazny.mac.dock`. Moving each role to a separate `ansible-role-<svc>` repo on Galaxy is **Wave 3**, not Wave 2. The Wave 3 lift is a `git filter-repo` per role, which is mechanical once each role is self-contained — that is exactly what Wave 2 produces.

### Vault and secrets

Credentials stay in the top-level `default.credentials.yml` plus the user-overridable `credentials.yml`. Role defaults reference variables (`mariadb_root_password`) that resolve through the central files. Per-role `vars/vault.yml` is **deferred** — introducing per-role encryption creates a key-distribution problem that does not exist today. The state-declarative password reconverge added in Wave 1 depends on every service resolving its password through the same `global_password_prefix`; per-role vaults would shard that.

### Module dependencies

Each role declares its required collections in `meta/main.yml` under `collections:`. Example for `pazny.mariadb`:

```yaml
---
dependencies: []

collections:
  - community.mysql

galaxy_info:
  role_name: mariadb
  description: MariaDB container + post-start DB/user provisioning
  min_ansible_version: 2.10
```

The top-level `requirements.yml` remains the authoritative install list that CI uses. `meta/main.yml` is documentation and a graceful-failure hint — if a contributor `include_role`s `pazny.mariadb` from a different playbook without `community.mysql` installed, Ansible will surface the missing collection at run time rather than crashing inside the post-start task.

---

## 8. Rollback plan

Each role lands as a single commit. The commit must touch **everything** the role ships:

- The new `roles/pazny.<svc>/` directory and all of its files.
- The rewire in `main.yml` and/or `tasks/stacks/core-up.yml` (`include_tasks` -> `include_role`).
- The deletion of the now-orphaned source file (`tasks/iiab/<svc>_setup.yml`, `tasks/<svc>.yml`, etc.).
- The shrink of the base compose template (`templates/stacks/<stack>/docker-compose.yml.j2`) — remove the migrated service block.

Done atomically, `git revert <commit>` restores the pre-role state cleanly: the role directory disappears, the inline tasks come back, the compose block is reinstated. No half-merged state, no manual cleanup.

Partial reverts (keep the role directory, restore the inline task) are error-prone and should be avoided. If a role lands and turns out to need rework, revert the whole commit and reland with the fix — do not try to patch the role in place while leaving the inline copy as a fallback.

---

## 9. Known gotchas (forward-looking)

Pre-flight list of traps the Wave 2.1 pilot will hit. Read this before starting.

### `roles:` vs `tasks:` execution order

Ansible runs the play's `roles:` section *before* its `tasks:` section. If `pazny.glasswing` is wired in as a top-level role (`- role: pazny.glasswing` in the play's `roles:` list), it runs before `tasks/php.yml` has installed the PHP runtime — and the `composer install` step fails with "command not found".

**Mitigation:** keep pilot roles inside the existing `tasks:` block via `include_role` or `import_role`. Do **not** add them to the play's `roles:` list until the whole role migration is done and the dependency order has been re-shuffled deliberately.

### Handler visibility

`notify: Restart php-fpm` works from a role only if the handler is defined at the play level (which it is, in `main.yml` line 115). Handlers inside a role's `handlers/main.yml` are visible only to tasks in that same role unless `listen:` is used.

**Mitigation:** for the pilot, leave shared handlers (`Restart php-fpm`, `Restart nginx`, `Reload nginx`) in `main.yml`. Only move service-specific handlers (`Restart mariadb`, `Restart grafana`) into the role's own `handlers/main.yml`. Cross-role notifies should continue to fire the play-level handler.

### Tag inheritance

`--tags mariadb` must still select the role's tasks. Ansible does **not** propagate tags from a parent `include_tasks` to the role's tasks the same way it does from `import_tasks`.

**Mitigation:** add `tags: ['mariadb']` (or whatever tag set you want) to the `include_role` / `import_role` invocation in `main.yml` or `core-up.yml`. Verify with `ansible-playbook main.yml --list-tags` before pushing.

### `stacks_shared_network` reference

Role compose templates **must** declare the external network the same way the base compose does. If `roles/pazny.mariadb/templates/compose.yml.j2` has `networks: [infra_net]` but the base compose declares both `infra_net` and `{{ stacks_shared_network }}`, `docker compose -f base -f override` will complain about a mismatch ("network ... not found" or "network ... declared as external in one file but bridge in another").

**Mitigation:** copy the exact `networks:` stanza from `templates/stacks/infra/docker-compose.yml.j2` (lines 359–363 today) into every infra role compose template, and the equivalent `observability_net` block into every observability role. Sanity check with `docker compose -f base -f override config` — if compose can render the merged file without errors, the networks line up.

### Password variable templating

Wave 1's state-declarative password reconverge depends on every `*_password` variable resolving via the same `global_password_prefix`. Today `mariadb_root_password` in `default.credentials.yml` is a Jinja template:

```yaml
mariadb_root_password: "{{ global_password_prefix }}_pw_mariadb"
```

When this variable moves into `roles/pazny.mariadb/defaults/main.yml`, the templating must be preserved. **Do not** convert it to a literal default like `mariadb_root_password: "changeme_pw_mariadb"` — that breaks the prefix reconverge that Wave 1 just stabilized. Role defaults can reference globals (`global_password_prefix` is set at the play level), and Ansible will resolve them at run time.

### Compose `services:` map merging

When `docker compose -f base.yml -f override.yml` merges two files, the `services:` keys are deep-merged: if both files declare `services.mariadb`, the override wins on scalar fields (image, restart, mem_limit) and lists are concatenated (volumes, networks, depends_on). For the pilot this means: do **not** leave a stub `mariadb:` block in the base file after the role takes over — delete it entirely. Otherwise the operator will be debugging a phantom merged config that does not match either file alone.

---

When the pilot is green, open a Wave 2.2 roadmap issue listing the next wave of services and their risk tier.
