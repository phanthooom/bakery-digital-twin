# CLAUDE.md — Цифровой двойник хлебопекарни

3D-схема цеха с живыми данными энергопотребления станков. Монорепо на npm workspaces, Node.js 20+, TypeScript.

## Структура
- `config/equipment.json` — единственный источник правды по цеху: этапы, станки (id, название, этап, `nominalKw`, `phases`, `position`, `rotationY`, `kind`, `meterId`, `model`), пороги статусов и ИИ-проверки.
- `packages/shared` (`@bakery/shared`) — чистая логика с тестами: типы, парсинг MQTT (`parseReading`), электрика (`imbalancePct`, `ratedCurrentA`, `pctOfNominal`), статус (`computeStatus`), базовая линия (`HourlyBaseline`), `aiCheck`. TS-исходники импортируются напрямую (без сборки).
- `simulator/` — публикует в MQTT `bakery/{equipmentId}/power` раз в 5 с. Профили по `kind` в `src/profiles.ts`.
- `api/` — Fastify: MQTT → InfluxDB, состояние станков в памяти, REST + WebSocket (`/ws`). Порт 3001.
- `web/` — React + Vite + React Three Fiber + drei. Порт 5173, проксирует `/api` и `/ws` на API.
- `infra/` — конфиги Mosquitto и provisioning Grafana (датасорс + дашборд «3D Пекарня»).
- `docs/` — `PLAN.md`, `mqtt-contract.md`.

## Команды
```bash
docker compose up -d      # Mosquitto :1883/:9001, InfluxDB :8086, Grafana :3000
npm install               # один раз, из корня
npm run dev               # симулятор + API + web (concurrently)
npm test                  # все unit-тесты (vitest)
npm run typecheck         # tsc по всем пакетам
npm run dev:sim | dev:api | dev:web   # по отдельности
```
Windows: `scripts\start-dev.bat` делает всё по порядку (docker compose, npm install, npm run dev).

## Доступы (только для разработки)
- InfluxDB: http://localhost:8086, admin / bakery-admin-pass, token `bakery-dev-token`, org/bucket `bakery`.
- Grafana: http://localhost:3000, admin / admin (анонимный просмотр включён).
- MQTT: без авторизации.

## Правила работы
- Логику расчётов менять только через тесты: сначала тест в `packages/shared/src/*.test.ts`, потом код (TDD).
- Формат MQTT-сообщения — контракт с прошивкой ESP32. Любое изменение — сначала в `docs/mqtt-contract.md` и `parseReading` + тесты, с обратной совместимостью.
- Новый станок = запись в `config/equipment.json` (симулятор, API и web подхватят сами). Новый тип формы — `kind` + компонент в `web/src/scene/machines/`.
- GLB-модель: положить файл в `web/public/models/`, указать `"model": "/models/имя.glb"` у станка.
- Коммиты небольшие, сообщения на русском в повелительном наклонении («Добавить…», «Исправить…»).
