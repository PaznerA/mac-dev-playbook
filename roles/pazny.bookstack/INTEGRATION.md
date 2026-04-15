# INTEGRATION: pazny.bookstack

Mechanicke patche, ktere musi parent agent aplikovat po merge role do `dev`.
Zadny soubor mimo `roles/pazny.bookstack/` a `templates/nginx/sites-available/bookstack.conf` jsem nemenil.

---

## 1. `default.config.yml` — install toggle

Insert do B2B sekce (~radek 148, za `install_outline:`):

```yaml
install_bookstack: false         # BookStack – wiki (Shelf/Book/Chapter/Page) [vyžaduje: MariaDB, Redis Docker]
```

## 2. `default.config.yml` — authentik_oidc_apps entry

Append do `authentik_oidc_apps:` listu (pred helper-vars blok, viz `authentik_oidc_outline` entry jako vzor):

```yaml
  - name: "BookStack"
    slug: "bookstack"
    enabled: "{{ install_bookstack | default(false) }}"
    client_id: "devboxnos-bookstack"
    client_secret: "{{ global_password_prefix }}_pw_oidc_bookstack"
    redirect_uris: "https://{{ bookstack_domain | default('bookstack.dev.local') }}/oidc/callback"
    launch_url: "https://{{ bookstack_domain | default('bookstack.dev.local') }}"
```

## 3. `default.config.yml` — helper vars (OIDC native)

Insert vedle ostatnich `authentik_oidc_*_client_id` promennych (za `authentik_oidc_gitlab_client_secret`, ~radek 1657):

```yaml
authentik_oidc_bookstack_client_id: "{{ (authentik_oidc_apps | selectattr('slug', 'equalto', 'bookstack') | first).client_id }}"
authentik_oidc_bookstack_client_secret: "{{ (authentik_oidc_apps | selectattr('slug', 'equalto', 'bookstack') | first).client_secret }}"
```

## 4. `default.config.yml` — authentik_app_tiers entry

Add do `authentik_app_tiers:` mezi tier-3 sluzby (~radek 1475):

```yaml
  bookstack: 3
```

## 5. `default.credentials.yml` — nove secrets

Insert po `outline_utils_secret:` (~radek 211):

```yaml
# ==============================================================================
# BOOKSTACK (pouze pokud install_bookstack: true)
# Default login: OIDC pres Authentik (nebo lokalni admin@admin.com / password pri prvni inicializaci)
# Vyžaduje: MariaDB
# ==============================================================================

bookstack_db_password: "{{ global_password_prefix }}_pw_bookstack"
bookstack_app_key: "{{ global_password_prefix }}_pw_bookstack_app_key"   # prepsano v main.yml pres openssl rand
```

## 6. `main.yml` — auto-generovani APP_KEY

BookStack vyzaduje Laravel-style `APP_KEY` ve formatu `base64:<32-byte-base64>`.
Pridej do bloku **"Auto-regenerate stateless secrets (every run — safe group)"** (~radek 372-380):

```yaml
        bookstack_app_key: "base64:{{ lookup('pipe', 'openssl rand -base64 32') }}"
```

> Pozn.: Je v **safe group**, protoze APP_KEY sifruje jen sessions/remember-tokeny a reset vynuti relogin — nerozbije perzistentni data (stranky/knihy v DB zustavaji). Pokud by se v buducnu zacalo pouzivat app-level encryption jinych polozek, presun do destructive group.

## 7. `main.yml` — Redis auto-enable

Pridej `install_bookstack` do podminky `Auto-enable Redis Docker for services that require it` (~radek 352-362):

```yaml
      when: >
        (install_authentik | default(false)) or
        (install_infisical | default(false)) or
        (install_jsos | default(false)) or
        (install_erpnext | default(false)) or
        (install_outline | default(false)) or
        (install_superset | default(false)) or
        (install_bookstack | default(false))
```

## 8. `default.config.yml` — MariaDB DB provision entries

V **IIAB – MARIADB (pokracovani)** bloku (~radek 736-758):

`mariadb_databases:` — pridej:
```yaml
  - name: "bookstack"
```

`mariadb_users:` — pridej:
```yaml
  - name: "bookstack"
    password: "{{ bookstack_db_password }}"
    priv: "bookstack.*:ALL"
```

Tim se DB + user automaticky vytvori v `pazny.mariadb` post-start kroku v `tasks/stacks/core-up.yml` (volano PRED spustenim b2b stacku).

## 9. `tasks/stacks/stack-up.yml` — role include

Insert do **`# B2B roles`** bloku (~radek 88-91, za `pazny.outline render`):

```yaml
- { name: "[Stacks] pazny.bookstack render", ansible.builtin.include_role: { name: pazny.bookstack, apply: { tags: ['bookstack'] } }, when: "install_bookstack | default(false)", tags: ['bookstack'] }
```

## 10. `tasks/stacks/stack-up.yml` — `_remaining_stacks` update

V `Build list of remaining (non-core) active stacks` set_fact (~radek 109) rozsir b2b podminku:

```yaml
        ((install_erpnext | default(false) or install_freescout | default(false) or install_outline | default(false) or install_bookstack | default(false)) | ternary(['b2b'], []))
```

## 11. `tasks/stacks/stack-up.yml` — b2b compose deploy condition

V tasku `[Stacks] Deploy b2b compose` (~radek 35-40) rozsir `when:`:

```yaml
  when: install_erpnext | default(false) or install_freescout | default(false) or install_outline | default(false) or install_bookstack | default(false)
```

## 12. `tasks/nginx.yml` — auto-enable vhost

V `_nginx_sites_auto` set_fact (~radek 107-144) pridej radek (napr. za `outline.conf`):

```yaml
         + ((install_bookstack | default(false)) | ternary(['bookstack.conf'], []))
```

A do seznamu template loop (~radek 80-84, za `freescout.conf`/`outline.conf`):

```yaml
    - bookstack.conf
```

## 13. Nginx vhost (dokumentace)

Soubor: `templates/nginx/sites-available/bookstack.conf`
Aktivuje se automaticky pres `install_bookstack: true` (viz sekce 12). Native OIDC — bez `forward_auth`, bez `authentik-proxy-auth` include. `client_max_body_size 50m` pro BookStack gallery/cover uploads.

## 14. Smoke test

Po `ansible-playbook main.yml -K -e install_bookstack=true --tags bookstack,b2b,mariadb` ověř:

```bash
# kontejner bezi
docker ps | grep bookstack                         # Up, healthy

# HTTP 200/302 na login
curl -k -I https://bookstack.dev.local             # 302 -> /login nebo 200

# DB je dostupna
docker compose -p infra exec mariadb \
  mariadb -u bookstack -p"${PREFIX}_pw_bookstack" -e 'SHOW DATABASES;' \
  | grep bookstack

# Authentik OIDC discovery endpoint (pokud install_authentik=true)
curl -k https://auth.dev.local/application/o/bookstack/.well-known/openid-configuration | jq .issuer

# OIDC login redirect (prohlizec): https://bookstack.dev.local -> "Login with Authentik" tlacitko
```

## 15. Poznamky

- **Image verze**: `lscr.io/linuxserver/bookstack:v26.03.3-ls256` (aktualni stable k datu vytvoreni role). Pro upgrade prepis `bookstack_version` v `defaults/main.yml` nebo v `config.yml`.
- **Domena**: `bookstack.dev.local` — NE `wiki.dev.local` (kolize s Outline).
- **Pri prvni inicializaci (bez OIDC)** BookStack ma default admin `admin@admin.com` / `password`. Pokud je `install_authentik=true`, prihlaseni jde pres Authentik (OIDC user se automaticky zaregistruje a pripoji k Authentik groups).
- **OIDC scopes**: `openid profile email groups` — skupina `groups` vyzaduje Authentik `Group Membership Scope Mapping` (typicky uz soucasti `authentik_oidc_setup.yml` blueprintu; pokud ne, bez `groups` BookStack stale funguje, jen `OIDC_USER_TO_GROUPS` nebude mapovat role).
