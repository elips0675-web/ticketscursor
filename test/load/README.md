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

# 2. Тест тикетов (200 concurrent, список + создание)
k6 run -e TOKEN=$TOKEN test/load/tickets.k6.js

# 3. Тест чатов (100 concurrent)
k6 run -e TOKEN=$TOKEN -e CHAT_ID=1 test/load/chat.k6.js

# 4. Тест wiki (100 concurrent, список + поиск)
k6 run -e TOKEN=$TOKEN test/load/wiki.k6.js

# 5. Тест поиска (100 concurrent, случайные запросы)
k6 run -e TOKEN=$TOKEN test/load/search.k6.js

# 6. Тест новостей (100 concurrent)
k6 run -e TOKEN=$TOKEN test/load/news.k6.js
```

## Метрики

| Тест | Метрика | Порог | Описание |
|------|---------|-------|----------|
| tickets | `ticket_errors` | < 1% | Ошибки списка/создания тикетов |
| tickets | `http_req_duration p(95)` | < 1000ms | Задержка ответа |
| chat | `chat_msg_errors` | < 5% | Ошибки отправки сообщений |
| chat | `http_req_duration p(95)` | < 500ms | Задержка ответа |
| wiki | `wiki_errors` | < 1% | Ошибки списка/поиска wiki |
| wiki | `http_req_duration p(95)` | < 500ms | Задержка ответа |
| search | `search_errors` | < 2% | Ошибки поиска |
| search | `http_req_duration p(95)` | < 1000ms | Задержка ответа |
| news | `news_errors` | < 1% | Ошибки списка новостей |
| news | `http_req_duration p(95)` | < 500ms | Задержка ответа |
