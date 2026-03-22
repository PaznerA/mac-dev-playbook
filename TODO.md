# TODO

## Modernizace / tech-debt

### Deprecation: `ansible_env` → `ansible_facts`

Ansible-core 2.24 odstraní auto-injekci top-level facts přes `INJECT_FACTS_AS_VARS`.
Všechna místa kde se používá `ansible_env.HOME`, `ansible_env.PATH` apod. je třeba
nahradit za `ansible_facts['env']['HOME']` (nebo equivalent).

Dotčené soubory (neúplný seznam):
- `tasks/golang.yml` – proměnné prostředí v Install Go development tools
- `tasks/node.yml` – NVM_DIR environment
- `tasks/python.yml` – PYENV_ROOT, PATH environment bloky

Doporučený postup: grep po repozitáři `ansible_env\.` a nahradit.
