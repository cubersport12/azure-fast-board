# Notifications API

Node.js сервис, который:

1. принимает **Azure DevOps Service Hooks** (`POST /hooks/azure`);
2. раздаёт события по **WebSocket** (`/ws`) всем подписанным фронтам / Electron-клиентам.

Azure DevOps сам WebSocket для досок не отдаёт — только HTTP Service Hooks. Этот API и есть мост.

## Быстрый старт

```bash
cd notifications-api
npm install
cp .env.example .env   # опционально
npm run dev
```

По умолчанию: `http://0.0.0.0:8787`.

## Эндпоинты

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/health` | liveness + число клиентов |
| `GET` | `/events?limit=20` | последние события (нужен токен, если задан) |
| `POST` | `/hooks/azure` | webhook для Azure DevOps Service Hooks |
| `WS` | `/ws` | подписка фронтов на события |

### Авторизация

Если задан `AUTH_TOKEN`:

- HTTP: `Authorization: Bearer <token>` или заголовок `x-afb-token`, или `?token=`
- WebSocket: тот же токен в query/`Authorization`/`x-afb-token` на upgrade

В Azure DevOps при создании Service Hook укажите URL вида:

`https://notifications.company.local/hooks/azure?token=SECRET`

(сервер ADO должен достучаться до этого хоста).

### WebSocket протокол

Клиент подключается:

```text
ws://host:8787/ws?token=SECRET&projectId=<guid>&eventType=workitem.updated
```

Сервер сразу шлёт:

```json
{ "type": "hello", "clientId": "...", "history": [ /* последние подходящие */ ] }
```

События:

```json
{
  "type": "event",
  "event": {
    "id": "...",
    "source": "azure-service-hook",
    "eventType": "workitem.updated",
    "workItemId": 101,
    "workItemTitle": "...",
    "projectId": "...",
    "createdAt": "..."
  }
}
```

Переподписка:

```json
{
  "type": "subscribe",
  "filters": {
    "projectIds": ["proj-guid"],
    "eventTypes": ["workitem.created", "workitem.updated", "workitem.commented"]
  }
}
```

## Переменные окружения

См. `.env.example`.

## Связка с Azure Fast Board

В настройках десктоп-клиента укажите URL API (`http://host:8787`). Electron подключается к `/ws` и показывает классические уведомления (toast + мигание панели задач) без разворачивания окна из трея.

Service Hook в ADO создайте на `POST {apiUrl}/hooks/azure` (через UI приложения или REST `_apis/hooks/subscriptions`).
