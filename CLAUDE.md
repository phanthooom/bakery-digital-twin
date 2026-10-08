# CLAUDE.md — цифровой двойник хлебопекарни

3D-схема цеха с живыми данными энергопотребления станков. Сейчас работает только фронт на мок-данных (бэкенд отложен, ADR-0001). Монорепо на npm workspaces; команды — в `package.json` (`npm run dev` → http://localhost:5173, `npm test`, `npm run typecheck`). Словарь предметной области — `GLOSSARY.md`, решения — `docs/adr/`.

## Где что
- `config/equipment.json` — единственный источник правды о цехе: этапы, станки, пороги. Новый станок = новая запись; сцена, мок и симулятор подхватят её сами.
- `packages/shared` — вся предметная логика (чистый TS, импортируется исходниками без сборки). Ядро — `TwinEngine` (`engine.ts`); `status`, `baseline`, `aiCheck`, `electrical` — его внутренние модули. Модель станков для мока и симулятора — `sim/machine.ts`. `node/` — только для Node (чтение конфига, `.env`).
- `web` — React + Vite + React Three Fiber. Данные приходят только через интерфейс `DataSource` (`web/src/data/`); сцена и карточки не знают, мок это или живые данные.
- `web/src/scene/machines/` — процедурные формы по `kind` (+ высоты и место сигнальной колонны в `specs.ts`). GLB: файл в `web/public/models/`, у станка `"model": "/models/x.glb"`.
- `simulator` — публикует показания в MQTT по `docs/mqtt-contract.md` (нужен `docker compose up -d`). Фронт от него сейчас не зависит.

## Правила
- Логику меняем по TDD (`.claude/skills/tdd`), только на согласованных стыках — см. «Стыки для TDD» ниже.
- Формат MQTT-сообщения — контракт с прошивкой ESP32: сначала `docs/mqtt-contract.md` и тест `parseReading`, затем код; только обратно совместимые изменения.
- Цвета статусов (`web/src/ui/statusMeta.ts`) зарезервированы под статус и всегда идут с иконкой и подписью.
- Тексты интерфейса, коммиты и документация — на русском. Коммит — повелительное наклонение («Добавить…», «Исправить…»).

## Agent skills

Навыки [mattpocock/skills](https://github.com/mattpocock/skills) лежат в `.claude/skills/` (см. `.claude/skills/README.md`).

### Issue tracker

Задачи — markdown-файлы в `.scratch/<feature>/issues/NN-<slug>.md`. See `docs/agents/issue-tracker.md`.

### Triage labels

Стандартные пять ролей (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) как строка `Status:` в файле задачи. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` в корне + `docs/adr/`. See `docs/agents/domain.md`.

### Стыки для TDD (согласованы 2026-10-08)

Тесты пишутся только на этих seams, вертикальными срезами (один тест → минимальный код):
1. `TwinEngine` — `ingest` / `tick` / `history` / `getStates`: статус, длительность статуса, «нет связи», ИИ-проверка.
2. `parseReading` — контракт MQTT с ESP32.
3. `MachineSim` → `toPayload` → `parseReading` — симулятор соблюдает контракт.
4. `MockDataSource` — то, что видит фронт (`start`, `getStates`, `getHistory`, `simulate`).
5. Чистые функции фронта: `web/src/ui/format.ts`, `web/src/ui/chartMath.ts`, `web/src/scene/gestures.ts` (жесты тачпада и колесо → камера).

Внутренние модули движка (`status`, `baseline`, `aiCheck`, `electrical`) — internal seams `TwinEngine`, их тесты допустимы. 3D-сцену и React-компоненты проверяем в браузере (скриншоты Playwright), без unit-тестов.
