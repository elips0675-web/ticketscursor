# Load Testing (k6)

## Установка

```bash
# Windows (choco)
choco install k6

# macOS
brew install k6

# Linux
sudo apt install k6
# или скачать с https://k6.io/docs/get-started/installation/
```

## Запуск

```bash
# 1. Получить токен (админский):
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/dev-login | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data?.token||JSON.parse(d).token))")

# 2. Тест чатов (50 concurrent, 1 min ramp)
k6 run -e TOKEN=$TOKEN -e CHAT_ID=1 test/load/chat.k6.js

# 3. Тест тикетов (200 concurrent, список + создание)
k6 run -e TOKEN=$TOKEN test/load/tickets.k6.js
```

## Метрики

| Метрика | Порог | Описание |
|---------|-------|----------|
| `chat_msg_errors` | < 5% | Ошибки отправки сообщений |
| `ticket_errors` | < 1% | Ошибки списка/создания тикетов |
| `http_req_duration p(95)` | < 500ms чат / < 1s тикеты | Задержка ответа |
