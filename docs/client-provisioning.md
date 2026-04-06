# Provisioning noveho klienta

Tento dokument popisuje jak pripravit devBoxNOS pro noveho klienta — od forku repozitare az po overeni bezicich sluzeb.

---

## Predpoklady

- **Apple Silicon Mac** (M1 / M2 / M3 / M4) s macOS 14 (Sonoma) nebo novejsim
- **Minimalne 16 GB RAM** (doporuceno 32+ GB pro plny stack vcetne AI agenta)
- **256+ GB disk** (doporuceno 1 TB SSD; externi SSD volitelne pro data-heavy sluzby)
- **Pristup k internetu** (Homebrew, Docker images, Ollama modely)
- **Ucet s admin pravy** (sudo)

---

## Krok 1: Fork repozitare

1. Otevri [github.com/PaznerA/mac-dev-playbook](https://github.com/PaznerA/mac-dev-playbook)
2. Klikni **Fork** → vytvor `ClientName/mac-dev-playbook`
3. Naklonuj fork na cilovy Mac:

```bash
git clone https://github.com/ClientName/mac-dev-playbook.git
cd mac-dev-playbook
```

> **Tip:** Pridej upstream remote pro budouci aktualizace:
> ```bash
> git remote add upstream https://github.com/PaznerA/mac-dev-playbook.git
> ```

---

## Krok 2: Bootstrap (prvni spusteni na novem Macu)

Na cistem Macu spust bootstrap skript, ktery nainstaluje veskere prerekvizity:

```bash
bash scripts/provision-client.sh
```

Skript provede:
1. Overeni macOS verze a Apple Silicon architektury
2. Instalaci Xcode Command Line Tools (pokud chybi)
3. Instalaci Homebrew (pokud chybi)
4. Instalaci Ansible pres pip
5. Stazeni Ansible Galaxy roli (`ansible-galaxy install -r requirements.yml`)
6. Kopirovani prikladovych konfiguracnich souboru

Po dokonceni skriptu pokracuj krokem 3.

---

## Krok 3: Konfigurace instance

Skopiruj prikladovy konfiguracni soubor a uprav dle potreby:

```bash
cp config.example.yml config.yml
nano config.yml
```

### Klicova nastaveni

| Promenna | Popis | Priklad |
|----------|-------|---------|
| `install_nginx` | Webovy server (reverse proxy) | `true` |
| `install_observability` | Grafana + Prometheus + Loki + Tempo | `true` |
| `install_mariadb` | MariaDB databaze | `false` |
| `install_nextcloud` | Self-hosted cloud | `false` |
| `install_gitea` | Self-hosted Git server | `false` |
| `install_n8n` | Workflow automation | `false` |
| `install_openwebui` | Chat UI pro Ollama AI | `false` |
| `install_tailscale` | Vzdaleny pristup pres VPN | `true` |

Kompletni seznam 50+ promennych najdes v `default.config.yml`.

### Zavislosti mezi sluzbami

Nektere sluzby vyzaduji dalsi komponenty:

- **WordPress, Nextcloud** → `install_mariadb: true`, `install_php: true`, `install_nginx: true`
- **Open WebUI** → `install_openclaw: true` (Ollama musi bezet)
- **Woodpecker CI** → `install_gitea: true` (OAuth2 z Gitey)
- **ERPNext** → `install_mariadb: true`, `redis_docker: true`
- **Outline, Superset, Metabase** → `install_postgresql: true`
- **GitLab** → minimalne 4 GB volne RAM

Playbook automaticky aktivuje zavislosti (PostgreSQL, Redis, MariaDB) pokud jsou potreba.

---

## Krok 4: Nastaveni hesel

Skopiruj prikladovy soubor s hesly:

```bash
cp credentials.example.yml credentials.yml
nano credentials.yml
```

### Dulezite:

- **`credentials.yml` je v `.gitignore`** — nikdy ho necommituj!
- Vychozi hesla maji tvar `changeme_pw_<sluzba>` — **vzdy je zmen**
- Pro generovani nahodnych hesel pouzij:
  ```bash
  openssl rand -hex 32
  ```

### Struktura hesel

Kazda sluzba ma vlastni heslo. Minimalne nastav:

```yaml
# Databaze
mariadb_root_password: "silne-heslo"

# Grafana (observability)
grafana_admin_password: "silne-heslo"

# Gitea (pokud instalujes)
gitea_admin_password: "silne-heslo"
gitea_admin_email: "admin@firma.cz"

# Tailscale (volitelne — bez nej probehne interaktivni login)
# tailscale_auth_key: "tskey-..."
```

---

## Krok 5: Spusteni playbooku

```bash
# Plne spusteni (zepta se na sudo heslo)
ansible-playbook main.yml -K

# Nebo pouze konkretni komponenty
ansible-playbook main.yml -K --tags "observability"
ansible-playbook main.yml -K --tags "nginx,php"
ansible-playbook main.yml -K --tags "stacks"
```

Prvni spusteni trva typicky **15–45 minut** (podle poctu sluzeb a rychlosti pripojeni).

### Cista reinstalace

Pro kompletni reset (smazani dat, Docker kontejneru, konfigurace):

```bash
ansible-playbook main.yml -K -e blank=true
```

> **Pozor:** `blank=true` maze vsechna data vcetne databazi! Pouzivej pouze pro ciste nasazeni.

---

## Krok 6: Overeni

Po dokonceni playbooku over, ze sluzby bezi:

### Webove rozhrani (vyzaduje `install_dnsmasq: true`)

| Sluzba | URL | Vychozi login |
|--------|-----|---------------|
| Grafana | `https://grafana.dev.local` | admin / (credentials.yml) |
| Portainer | `https://portainer.dev.local` | admin / (credentials.yml) |
| Gitea | `https://git.dev.local` | (system user) / (credentials.yml) |
| Nextcloud | `https://cloud.dev.local` | admin / (credentials.yml) |
| Open WebUI | `https://ai.dev.local` | admin@dev.local / (credentials.yml) |
| Uptime Kuma | `https://uptime.dev.local` | admin / (credentials.yml) |
| n8n | `https://n8n.dev.local` | (prvni registrace = owner) |
| WordPress | `https://wordpress.dev.local` | admin / (credentials.yml) |

### Prikazova radka

```bash
# Overeni Docker kontejneru
docker ps

# Overeni nginx
curl -sk https://grafana.dev.local

# Overeni Ollama (pokud install_openclaw: true)
ollama list

# Overeni Tailscale
tailscale status
```

---

## Krok 7: Vzdaleny pristup (Tailscale)

1. Na cilovem Macu spust:
   ```bash
   tailscale up
   ```
2. Otevri URL v prohlizeci a prihlas se do Tailscale uctu
3. Sluzby jsou pak dostupne pres porty z libovolneho zarizeni v Tailscale siti:
   ```
   http://<tailscale-hostname>:3000    # Grafana
   http://<tailscale-hostname>:3003    # Gitea
   http://<tailscale-hostname>:8085    # Nextcloud
   ```

### Pristup z LAN

Pro zpristupneni sluzeb v lokalni siti (TV, mobily) nastav v `config.yml`:

```yaml
services_lan_access: true    # Docker sluzby na 0.0.0.0
dnsmasq_lan_access: true     # DNS resolver pro klienty v LAN
```

---

## Customizace

### Pridani nove sluzby

1. Vytvor Docker Compose sablonu v `templates/stacks/<stack>/`
2. Pridej `install_<sluzba>` promennou do `default.config.yml`
3. Pridej task do `main.yml` s `when: install_<sluzba>`
4. (Volitelne) Pridej nginx vhost do `templates/nginx/sites-available/`

### Zmena domeny

Vychozi domena je `dev.local`. Pro zmenu:

1. Uprav `dnsmasq_dev_domain` v `config.yml`
2. Aktualizuj domeny jednotlivych sluzeb (napr. `grafana_domain`, `gitea_domain`)
3. Znovu spust playbook: `ansible-playbook main.yml -K --tags "dnsmasq,nginx"`

### Vlastni Homebrew balicky

Pridej do `config.yml`:

```yaml
homebrew_installed_packages:
  - nazev-balicku

homebrew_cask_apps:
  - nazev-aplikace
```

### Vlastni dotfiles

1. Nastav `configure_dotfiles: true` v `config.yml`
2. Pridej URL sveho dotfiles repa do `credentials.yml`:
   ```yaml
   dotfiles_repo: "https://github.com/user/dotfiles.git"
   ```

---

## Aktualizace

### Z upstream devBoxNOS

```bash
# Pridej upstream (jednou)
git remote add upstream https://github.com/PaznerA/mac-dev-playbook.git

# Stahni zmeny
git fetch upstream

# Merge do sve vetve
git checkout dev
git merge upstream/dev

# Vyres konflikty (pokud jsou) a spust playbook
ansible-playbook main.yml -K
```

### Aktualizace Galaxy roli

```bash
ansible-galaxy install -r requirements.yml --force
```

### Aktualizace Docker obrazu

Docker obrazy se stahnou automaticky pri spusteni playbooku. Pro vynuceni aktualizace:

```bash
docker compose -f ~/stacks/observability/docker-compose.yml pull
docker compose -f ~/stacks/iiab/docker-compose.yml pull
ansible-playbook main.yml -K --tags "stacks"
```

---

## Reseni problemu

### Playbook selze na sudo

Over, ze mas admin prava a zadavas spravne sudo heslo pri `-K` promptu.

### Docker sluzby nenastartovaly

```bash
# Zkontroluj logy konkretniho kontejneru
docker logs <container_name>

# Restartuj stack
docker compose -f ~/stacks/<stack>/docker-compose.yml down
ansible-playbook main.yml -K --tags "stacks"
```

### DNS nefunguje (*.dev.local)

```bash
# Over ze dnsmasq bezi
brew services list | grep dnsmasq

# Restartuj
brew services restart dnsmasq

# Over DNS resolver
scutil --dns | grep dev.local
```

### Port je obsazeny

```bash
# Zjisti co posloucha na portu
lsof -i :3000
```

---

## Doporucena minimalni konfigurace pro klienty

### Maly tym (1–5 lidi, 16 GB RAM)

```yaml
install_observability: true
install_gitea: true
install_nextcloud: true
install_mariadb: true
install_uptime_kuma: true
install_tailscale: true
```

### Stredni firma (5–20 lidi, 32 GB RAM)

```yaml
install_observability: true
install_gitea: true
install_nextcloud: true
install_mariadb: true
install_postgresql: true
install_n8n: true
install_openwebui: true
install_openclaw: true
install_portainer: true
install_uptime_kuma: true
install_outline: true
install_tailscale: true
```

### Plny stack (20+ lidi, 64+ GB RAM)

Zapni vsechny sluzby v `config.yml`. Doporuceno externi SSD:

```yaml
configure_external_storage: true
external_storage_root: "/Volumes/SSD1TB"
```
