# pazny.bookstack

BookStack wiki platform (knihovna/kniha/kapitola struktura) jako Docker compose override v devBoxNOS **b2b** stacku.

- **Image**: `lscr.io/linuxserver/bookstack` (LinuxServer.io, ARM64 native)
- **Stack**: `b2b` (`docker compose -p b2b`)
- **Port**: `3013` (host → kontejner `:80`)
- **Doména**: `bookstack.{{ instance_tld | default('dev.local') }}` (Outline uz drzi `wiki.dev.local`)
- **DB**: MariaDB `bookstack` user/db, sdilena z infra stacku pres `{{ stacks_shared_network }}`
- **Cache/Session/Queue**: Redis (auto-enabled pokud `redis_docker: true`)
- **SSO**: nativni OIDC pres Authentik (env vars) — `install_authentik: true` zapne

Role renderuje compose override do `{{ stacks_dir }}/b2b/overrides/bookstack.yml`, ktery `tasks/stacks/stack-up.yml` sesbira pres `find` a prida jako `-f` flag k `docker compose up b2b`.

Podrobny integracni checklist (install toggle, authentik_oidc_apps, mariadb_databases, nginx vhost, secrets) viz `INTEGRATION.md`.
