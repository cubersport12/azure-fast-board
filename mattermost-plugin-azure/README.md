# Mattermost plugin: Azure DevOps Work Items

Плагин для **локального Mattermost**: создание **Bug** и **Task** в **Azure DevOps Server (on‑prem)** — поля и Ctrl+V скриншоты как в `frontend` (Azure Fast Board).

## Команды

| Команда | Действие |
|--------|----------|
| `/bug [название]` | Модалка создания Bug (Repro Steps + Ctrl+V) |
| `/task [название]` | Модалка создания Task (Description + Ctrl+V) |
| `/ado login` | Вход NTLM → выбор коллекции / проекта / команды |
| `/ado logout` | Удалить сохранённые учётные данные |
| `/ado status` | Показать текущее подключение |
| `/ado help` | Справка |

## Как это работает

1. `/ado login` — диалог входа (NTLM) и форма коллекции / проекта / команды.
2. Учётные данные шифруются в KV на сервере Mattermost.
3. `/bug` / `/task` открывают **webapp-модалку** плагина (не interactive dialog): Area, итерация, исполнитель, тэги, TipTap-редактор.
4. **Ctrl+V / drag-drop** скринов в редакторе — превью и вложения к work item.
5. Сервер плагина создаёт WI в ADO тем же JSON Patch API, что и Electron-клиент.

```
POST {server}/{collection}/{project}/_apis/wit/workitems/$Bug|Task
Content-Type: application/json-patch+json
```

## Сборка

Нужны **Go 1.22+** и **Node.js 18+**.

```powershell
cd mattermost-plugin-azure
.\build-bundle.ps1
```

Рекомендуемый артефакт:

`dist/com.azurefastboard.ado-0.2.0.tar.gz`

Структура архива:

```text
com.azurefastboard.ado/
  plugin.json
  server/dist/plugin-linux-amd64
  webapp/dist/main.js
```

## Установка в Mattermost

1. System Console → **Plugins** → Upload `dist/com.azurefastboard.ado-0.2.0.tar.gz`.
2. Включите плагин, задайте Default URL / Encryption key / при необходимости Insecure TLS.
3. В чате: `/ado login`, затем `/bug` / `/task`.

Сервер Mattermost должен иметь сетевой доступ до Azure DevOps Server.

## Поля

| Поле | Azure DevOps |
|------|--------------|
| Название | `System.Title` |
| Area | `System.AreaPath` |
| Итерация | `System.IterationPath` |
| Исполнитель | `System.AssignedTo` |
| Тэги | `System.Tags` |
| Описание (Task) | `System.Description` |
| Шаги воспроизведения (Bug) | `Microsoft.VSTS.TCM.ReproSteps` |
| Скриншоты | вложения `AttachedFile` |

Авторизация: **NTLM** (`DOMAIN\user` + пароль). Логин — interactive dialog; создание — React webapp.
