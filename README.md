# Azure Fast Board

Быстрый десктоп-клиент для **Azure DevOps Server (on‑prem)** — канбан, список рабочих элементов и карточки с обсуждениями и вставкой скриншотов.

Стек: **Electron + React + TypeScript + Tailwind**.

---

## Зачем это нужно

Веб-интерфейс Azure DevOps удобен, но для повседневной работы с багами и задачами часто хочется:

- держать доску «под рукой» в трее Windows;
- создавать work item за несколько секунд по горячей клавише;
- вставлять скриншоты в комментарии через `Ctrl+V`;
- быстро фильтровать и перемещать карточки без лишних кликов в браузере.

**Azure Fast Board** — лёгкий настольный клиент именно для on‑prem Azure DevOps Server (TFS/ADO Server), с авторизацией по доменной учётке (NTLM) или PAT.

---

## Возможности

- Канбан-доска с drag-and-drop
- Список рабочих элементов с фильтрами (тип, состояние, исполнитель, теги)
- Быстрое создание (тип, Area, исполнитель, описание, скриншоты)
- Карточка work item: описание, состояние, комментарии, вложения
- Трей и глобальные горячие клавиши
- Уведомления по доске (приложение / Mattermost / почта) и API Service Hooks
- Светлая / тёмная тема
- Работа **только после успешного подключения** к серверу

---

## Скачать готовую сборку (Windows)

При каждом пуше в `main` GitHub Actions собирает установщик:

| Файл | Назначение |
| --- | --- |
| `AzureFastBoard-*-Setup.exe` | Установщик (NSIS) |
| `AzureFastBoard-*-Portable.exe` | Портативная версия — можно просто запустить |

Скачать можно на странице **[Releases](../../releases)** репозитория  
или во вкладке **Actions** → последний успешный workflow → **Artifacts**.

> Сборка без цифровой подписи: Windows может показать предупреждение SmartScreen — для внутренней/корпоративной раздачи это нормально.

---

## Требования

- Windows 10/11 (x64)
- Для разработки: **Node.js 22+** и npm
- Доступ к Azure DevOps Server (коллекция / проект / команда)

---

## Быстрый старт (разработка)

```bash
git clone https://github.com/cubersport12/azure-fast-board.git
cd azure-fast-board/frontend
npm install
npm run dev
```

После запуска откроется окно приложения. Без настроенного подключения сразу появится диалог **«Подключение к Azure DevOps Server»** — работа с доской недоступна, пока подключение не будет успешно сохранено.

---

## Подключение к Azure DevOps Server

1. Откройте **Подключение** (или дождитесь автоматического окна при старте).
2. Укажите **URL сервера**, например:
   - `https://devops.company.local/tfs`
   - `https://tfs.company.local`
3. Выберите способ входа:
   - **Логин / Пароль** (рекомендуется для on‑prem) — Windows NTLM, формат `DOMAIN\user`
   - **PAT** — Personal Access Token
4. Нажмите **Загрузить**, выберите коллекцию, проект и команду.
5. Нажмите **Сохранить и подключить**.

### Права для PAT (если используете PAT)

- **Work Items** — Read & write
- **Project and Team** — Read
- **Service Hooks** (опционально) — Edit / View subscriptions, если управляете подписками из приложения

Вставляйте **сырой** PAT или `_password` из `.npmrc` (это Base64 от сырого токена — приложение развернёт).

### Уведомления

Схема:

```text
Azure DevOps Server  --Service Hook POST-->  notifications-api  --WebSocket-->  Electron / фронты
```

У Azure DevOps **нет** клиентского WebSocket для доски. Мост — сервис [`notifications-api`](notifications-api/README.md):

1. ADO шлёт HTTP Service Hook на `POST /hooks/azure`
2. API публикует событие всем подписчикам `WS /ws`
3. Desktop-клиент показывает toast и мигает иконкой на панели задач (окно из трея не разворачивается)

Запуск API:

```bash
cd notifications-api
npm install
npm run dev
```

В **Настройках → Уведомления** укажите URL API. Service Hook в ADO (через UI или REST) должен указывать на `{apiUrl}/hooks/azure`.

Дополнительно: провайдеры Mattermost / SMTP; локальный poll — fallback, если WebSocket недоступен.

На on‑prem с IIS Basic Auth авторизация как у npm/Artifacts:

`Authorization: Basic base64("{Collection|VssSessionToken}:{pat}")`

(пустой username на таких серверах часто даёт 401).

> Если PAT всё равно не проходит на Work Item API, используйте **Логин / Пароль (NTLM)**. Artifacts/npm и WIT REST иногда ведут себя по-разному на одном IIS.

Учётные данные хранятся через Electron `safeStorage` (на Windows — DPAPI). В renderer-процесс секрет не передаётся.

### Корпоративный SSL / самоподписанный сертификат

Если сервер использует внутренний CA или self-signed сертификат, включите в форме подключения:

**«Разрешить небезопасный TLS»**

Используйте только в доверенной сети.

---

## Горячие клавиши

| Сочетание | Действие |
| --- | --- |
| `Ctrl+Shift+Space` | Показать / скрыть окно |
| `Ctrl+Shift+N` | Глобальное быстрое создание |
| `C` | Быстрое создание (когда окно в фокусе) |
| `Ctrl+K` | Командная палитра |
| `/` | Фокус на поиск |
| `Esc` | Закрыть диалоги |
| `Ctrl+V` | Вставить скриншот (в создании / комментариях) |
| `?` (`Shift+/`) | Справка по горячим клавишам |

Сочетания можно изменить в **Настройках**. Раскладка RU/EN учитывается (привязка к физическим клавишам).

---

## Скрипты

Все команды запускаются из каталога `frontend`:

```bash
cd frontend

npm run dev          # разработка (Vite + Electron)
npm run typecheck    # проверка TypeScript
npm test             # unit-тесты
npm run build        # production-сборка + Windows .exe (Setup + Portable)
npm run build:dir    # сборка без упаковки в установщик
npm run lint         # ESLint
```

Готовые файлы появятся в:

```text
frontend/release/<версия>/
```

Например:

- `AzureFastBoard-0.1.0-Setup.exe`
- `AzureFastBoard-0.1.0-Portable.exe`

---

## Вклад и Pull Request

Ветка **`main`** — главная. Прямой push в неё запрещён: работайте в отдельных ветках и мержите через PR.

Подробности: [CONTRIBUTING.md](CONTRIBUTING.md).

Кратко:

```bash
git checkout main && git pull
git checkout -b feat/my-change
# …правки, коммиты…
git push -u origin HEAD
gh pr create --base main --fill
```

Защиту `main` (ruleset «только через PR») один раз включает владелец:

```bash
./scripts/enable-branch-protection.sh
```

---

## CI / автосборка

| Workflow | Когда | Что делает |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | PR и push в `main` | typecheck, lint, unit-тесты |
| [`.github/workflows/release-windows.yml`](.github/workflows/release-windows.yml) | push в `main` / вручную | Windows `.exe` + GitHub Release |

---

## Структура репозитория

```text
azure-fast-board/
├── .github/workflows/     # CI + Windows-релизы
├── .github/PULL_REQUEST_TEMPLATE.md
├── CONTRIBUTING.md        # ветки и PR
├── scripts/               # enable-branch-protection.sh
├── notifications-api/     # Service Hooks → WebSocket fan-out
├── frontend/              # Electron-приложение
│   ├── electron/main/     # трей, hotkeys, IPC, Azure REST, NTLM, WS-клиент
│   ├── electron/preload/  # мост window.azureFastBoard
│   ├── shared/            # типы и контракты IPC
│   ├── src/features/      # UI: board, work items, connection, …
│   └── electron-builder.json
└── README.md
```

---

## Архитектура (кратко)

- **Main process** — безопасное хранение секретов, вызовы Azure DevOps REST, трей, глобальные shortcut’ы
- **Preload** — типизированный IPC API
- **Renderer (React)** — доска, список, карточки, диалоги

Поддержано для on‑prem:

- URL вида collection / project / team
- WIQL + batch-загрузка work items
- JSON Patch с учётом revision
- колонки доски и маппинг состояний
- типы work item, Area Path, комментарии и вложения

---

## Типичные проблемы

| Проблема | Что проверить |
| --- | --- |
| 401 / не пускает | Логин `DOMAIN\samAccountName` + пароль; для PAT — что токены разрешены на сервере |
| Ошибка сертификата | Включить «Разрешить небезопасный TLS» |
| Пустая доска | Фильтры (по умолчанию Bug/Task, свои элементы) — сбросьте или расширьте |
| Hotkey не срабатывает | Запуск от имени администратора / конфликт с другими программами; проверьте Настройки |
| SmartScreen на .exe | «Подробнее» → «Выполнить в любом случае» (сборка без code signing) |

---

## Лицензия

MIT — см. [`frontend/LICENSE`](frontend/LICENSE).
