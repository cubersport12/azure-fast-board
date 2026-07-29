# Как вносить изменения

Ветка **`main`** — основная и защищённая.

- Прямой `git push` в `main` **запрещён**
- Все изменения идут через **feature-ветку → Pull Request → merge в `main`**
- Релиз Windows собирается автоматически после мержа в `main`

## Рабочий процесс

```bash
# 1. Актуальный main
git checkout main
git pull origin main

# 2. Ветка под задачу
git checkout -b feat/short-description
# или: fix/..., chore/..., docs/...

# 3. Коммиты
git add .
git commit -m "feat: краткое описание"

# 4. Пуш ветки (не main!)
git push -u origin HEAD

# 5. Pull Request в main
gh pr create --base main --fill
# или через GitHub UI: Compare & pull request
```

После ревью (или самопроверки) мержите PR в `main` и удаляйте ветку.

## Именование веток

| Префикс | Назначение |
| --- | --- |
| `feat/` | новая функция |
| `fix/` | исправление |
| `chore/` | инфраструктура, зависимости, CI |
| `docs/` | документация |

## Перед открытием PR

Из каталога `frontend`:

```bash
npm run typecheck
npm test
npm run lint
```

На PR автоматически запускается CI (`.github/workflows/ci.yml`).

## Включить защиту `main` (один раз, владелец репо)

Токен Cursor/cloud agent **не может** менять branch protection. Владелец репозитория запускает локально (нужен `gh` с правами admin):

```bash
./scripts/enable-branch-protection.sh
```

Скрипт создаёт ruleset: в `main` можно попасть только через PR, force-push и удаление ветки запрещены.

Вручную то же самое:  
**Settings → Rules → Rulesets → New branch ruleset** → target `main` → включить **Require a pull request before merging**.
