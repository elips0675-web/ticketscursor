# Service Desk — Makefile
# Быстрый запуск команд разработки и деплоя

.PHONY: help install dev dev-server dev-client build test test-server test-client lint typecheck docker-up docker-down e2e clean

help: ## Показать справку
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Установить все зависимости
	npm install
	cd server && npm install

dev: ## Запустить fullstack (сервер + клиент)
	@echo "Запуск API (порт 4000) и Frontend (порт 5173)..."
	cd server && npm run dev &
	npm run dev

dev-server: ## Только сервер (порт 4000)
	cd server && npm run dev

dev-client: ## Только клиент (порт 5173)
	npm run dev

build: ## Сборка production
	npm run build

test: ## Все тесты (клиент + сервер)
	npm test
	cd server && npm test

test-client: ## Только клиентские тесты
	npm test

test-server: ## Только серверные тесты
	cd server && npm test

test-e2e: ## E2E тесты Playwright
	npm run test:e2e

lint: ## Линтинг
	npm run lint
	cd server && npx eslint src --max-warnings 50 || true

typecheck: ## TypeScript проверка
	npm run type-check

check: ## Быстрая проверка консоли (Playwright)
	node check-console.mjs

docker-up: ## Запустить Docker Compose
	docker compose up -d --build

docker-down: ## Остановить Docker Compose
	docker compose down

docker-logs: ## Логи Docker Compose
	docker compose logs -f

clean: ## Очистить зависимости и сборку
	rm -rf node_modules
	rm -rf server/node_modules
	rm -rf dist
	rm -rf server/dist
	rm -rf coverage
	rm -rf server/coverage
	rm -rf test-results
