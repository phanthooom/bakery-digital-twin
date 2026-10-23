# Правила и оркестрация агентов: Цифровой двойник хлебопекарни

Этот файл содержит руководящие указания для ИИ-агентов Antigravity при работе в проекте `bakery-digital-twin`.

---

## 1. Архитектура и зоны ответственности

Проект представляет собой 3D-двойник цеха с визуализацией энергопотребления, линий питания, учета газа и цепочки поставок:
- `config/equipment.json` — **единственный источник правды** о цехе (станки, фазы, номиналы, координаты, пороги, тарифы, сырье).
- `packages/shared/` — предметная логика на чистом TypeScript (`TwinEngine`, `lineHealth`, `energy`, `inventory`, `gas`, `feeder`). Без зависимостей от React/DOM.
- `web/` — интерфейс на React + Vite + React Three Fiber (R3F). Компоненты получают данные **только** через интерфейс `DataSource` (`web/src/data/DataSource.ts`).
- `simulator/` — автономная публикация в MQTT по контракту `docs/mqtt-contract.md`.
- `GLOSSARY.md` — терминология предметной области (строго соблюдать).
- `docs/adr/` — архитектурные решения (ADR-0001 — ADR-0006).

---

## 2. Оркестрация через субагентов (.agents/)

В проекте настроен оркестр субагентов:
- **Мастер-агент (Master Orchestrator)**: Дирижирует процессом, ставит задачи, обновляет планы в `plans/` и проверяет результат.
- **`architect`** (`.agents/agents/architect/agent.md`): Архитектурный анализ, сверка с ADR и глоссарием, декомпозиция.
- **`engineer`** (`.agents/agents/engineer/agent.md`): Разработка модулей строго по TDD на согласованных стыках.
- **`code-reviewer`** (`.agents/agents/code-reviewer/agent.md`): Аудит кода, контроль типов, производительности 3D и соблюдения стандартов.

Подробный регламент взаимодействия описан в [.agents/rules/multi-agent-workflow.md](file:///d:/bakery-digital-twin/.agents/rules/multi-agent-workflow.md).

---

## 3. Разработка по TDD и согласованные стыки

Любые изменения логики вносятся **строго по TDD** только на 9 согласованных стыках:
1. `TwinEngine` (`ingest`, `tick`, `history`, `getStates`).
2. `parseReading` (MQTT контракт с ESP32).
3. `MachineSim` → `toPayload` → `parseReading` (симулятор соблюдает контракт).
4. `MockDataSource` (фасад данных фронтенда).
5. Линии питания: `feederFor` и `assessLine` в `packages/shared`.
6. Учёт энергии: `packages/shared/src/energy.ts` и `web/src/ui/energyReport.ts`.
7. Цепочка поставок: `Inventory` (FEFO, списания, сроки), `logistics.ts`, `supplyView.ts`.
8. Чистые функции UI: `format.ts`, `chartMath.ts`, `useChartViewport.ts`, `gestures.ts`.
9. Газ: `GasMonitor` и `expectedGasFlow` (`packages/shared/src/gas.ts`), газ в `MockDataSource`.

Перед сдачей любого изменения обязателен запуск:
```bash
npm test
npm run typecheck
```
Тексты интерфейса, комментарии к неочевидным местам и коммиты — на русском языке.
