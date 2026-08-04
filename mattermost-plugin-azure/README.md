# Mattermost plugin: Azure DevOps Work Items

Плагин для **локального Mattermost**: создание **Bug** и **Task** в **Azure DevOps Server (on‑prem)** прямо из чата — по тем же полям, что и быстрое создание в `frontend` (Azure Fast Board).

## Команды

| Команда | Действие |
|--------|----------|
| `/bug [название]` | Форма создания Bug (Repro Steps) |
| `/task [название]` | Форма создания Task (Description) |
| `/ado login` | Вход NTLM → выбор коллекции / проекта / команды |
| `/ado logout` | Удалить сохранённые учётные данные |
| `/ado status` | Показать текущее подключение |
| `/ado help` | Справка |

## Как это работает

1. Пользователь пишет `/bug` / `/task` или `/ado login`.
2. Если не авторизован — диалог **входа**: URL + `DOMAIN\user` + пароль (только NTLM, без PAT).
3. После успешного входа плагин подтягивает списки из Azure и ведёт wizard:
   - коллекция → проект → команда (выпадающие списки, как в Azure Fast Board).
4. Учётные данные **шифруются** и сохраняются в KV — следующий раз входить не нужно.
5. Открывается форма создания: название, Area, итерация, исполнитель, тэги, описание / шаги воспроизведения.
6. Work item создаётся тем же JSON Patch API, что и в `frontend`:

```
POST {server}/{collection}/{project}/_apis/wit/workitems/$Bug|Task
Content-Type: application/json-patch+json
```

## Сборка

Нужен **Go 1.22+** (Windows: `build-bundle.ps1`).

```powershell
cd mattermost-plugin-azure
go mod tidy
.\build-bundle.ps1
```

Рекомендуемый артефакт (только linux-amd64, меньше размер):

`dist/com.azurefastboard.ado-0.1.0.tar.gz`

Также собирается multi-arch: `dist/com.azurefastboard.ado-0.1.0-multi.tar.gz`.

Структура архива (как у официальных плагинов MM):

```text
com.azurefastboard.ado/
  plugin.json
  server/dist/plugin-linux-amd64
```

## Установка в Mattermost

1. System Console → **Plugins** → Upload `dist/com.azurefastboard.ado-0.1.0.tar.gz`.
2. Если ошибка *Encountered an error when extracting the plugin*:
   - убедитесь, что грузите **`.tar.gz`**, не исходники;
   - увеличьте лимит размера файла: `FileSettings.MaxFileSize` (например `104857600` = 100 MB) и при nginx — `client_max_body_size 100m`;
   - используйте именно `*-linux-amd64` / основной `0.1.0.tar.gz`, не огромный multi, если лимит маленький.
3. Если *permission denied* / `fork/exec ... plugin-linux-amd64`:
   - нужен бандл, собранный через `.\build-bundle.ps1` (выставляет Unix mode `0755` на бинарь);
   - не упаковывайте вручную через Explorer/`tar` на Windows без режима исполнения.
4. Включите плагин.
5. В настройках плагина укажите:
   - **Default Azure DevOps URL** — например `https://devops.company.local/tfs`
   - **Collection / Project / Team** — значения по умолчанию для формы входа
   - **Encryption key** — свой секрет (обязательно в проде)
   - при необходимости **Allow insecure TLS**
6. В чате: `/ado login`, затем `/bug` / `/task`.

Сервер Mattermost должен иметь сетевой доступ до Azure DevOps Server (плагин ходит в ADO **с машины MM**, не из браузера пользователя).

Если ошибка `no such host` / `lookup ... on 127.0.0.53` — на **сервере Mattermost** не резолвится DNS-имя TFS (на вашем ПК оно может работать). Варианты:

```bash
# на сервере MM
nslookup opo-tfs.zav.mir
# или добавьте в /etc/hosts:
# <IP-TFS>  opo-tfs.zav.mir
```

Либо укажите в URL IP-адрес TFS (при необходимости с insecure TLS).

## Соответствие полям Azure Fast Board

| Поле в диалоге | Azure DevOps |
|----------------|--------------|
| Название | `System.Title` |
| Area | `System.AreaPath` |
| Итерация | `System.IterationPath` |
| Исполнитель | `System.AssignedTo` |
| Тэги | `System.Tags` (`a; b`) |
| Описание (Task) | `System.Description` |
| Шаги воспроизведения (Bug) | `Microsoft.VSTS.TCM.ReproSteps` |

Авторизация: **NTLM** (`DOMAIN\user` + пароль) или **PAT** — как в `frontend/electron/main/azure`.

> В чате Mattermost нет rich-text / Ctrl+V скриншотов как в Electron. Текст описания уходит как простой HTML (`<div>`-строки). Вложения можно добавить уже в ADO или через Azure Fast Board.

## Безопасность

- Пароли/PAT не пишутся в канал — только в interactive dialog.
- В KV хранится ciphertext (AES-GCM), ключ — из настроек плагина.
- `/ado logout` удаляет запись пользователя.
- Смените **Encryption key** сразу после установки.

## Структура

```
mattermost-plugin-azure/
  plugin.json          # манифест + настройки System Console
  Makefile
  server/
    main.go            # точка входа плагина
    plugin.go          # activate / HTTP routes
    command.go         # /bug /task /ado
    dialog_auth.go     # форма входа
    dialog_create.go   # форма создания WI
    store.go           # KV + шифрование
    azure/             # NTLM/PAT клиент ADO
```
