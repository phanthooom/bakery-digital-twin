# План: Премиальные плавные анимации дашборда и 3D-сцены в стиле VeloHub (Motion & Fluid Springs)

- **Дата**: 2026-10-30
- **Статус**: COMPLETED
- **Ответственные**:
  - Архитектор: `@architect`
  - Разработчик: `@engineer`
  - Ревьюер: `@code-reviewer`

---

## 1. Контекст и цели
- **Проблема**: Текущий интерфейс цифрового двойника содержит резкие переходы при открытии карточек (`0.18s ease-out translateY(6px)`), статический переключатель этажей без индикатора скольжения, простые строковые значения в сводке шапки (кВт, газ, СЭС, количество станков не анимируются при обновлении), а 3D-теги на карте не передают динамику технологических операций и аварий.
- **Ожидаемый результат**: Внедрение моушн-системы уровня VeloHub Logistics Management Dashboard:
  1. Скользящая плашка (Sliding Pill Indicator) с физикой пружины `cubic-bezier(0.16, 1, 0.3, 1)` для переключателя этажей в шапке.
  2. Плавные цифровые одометры (`AnimatedNumber`) для всех ключевых показателей цеха (мощность кВт, расход газа м³/ч, генерация СЭС кВт и %, счётчики статусов станков).
  3. Премиальный Glassmorphism с `backdrop-filter: blur(16px)` и пружинным каскадным появлением карточек станков (`EquipmentCard`, `GasCard`, `VehicleCard`) и модальных окон.
  4. Радарные пульсирующие волны (Radar Ping Beacons) для аварийных состояний и активных 3D-тегов на рампе и в цехе.

---

## 2. Архитектурный анализ (`@architect`)
- **Затронутые модули**:
  - [x] `web` (компоненты React, стили CSS, тесты чистых функций UI)
- **Связанные ADR**: ADR-0001 (единый источник правды), ADR-0006 (микроанимации UI без перегрузки R3F).
- **Соблюдение глоссария**: Термины из [GLOSSARY.md](GLOSSARY.md) (станок, фидер, СЭС, рампа, щитовая).
- **Выбранные TDD-стыки** (из 9 согласованных в `CLAUDE.md`):
  - [x] **Стык 8**: Чистые функции UI (`web/src/ui/animationMath.ts` и `animationMath.test.ts`).

---

## 3. Декомпозиция и чек-лист реализации (`@engineer`)

### Шаг 1. Тесты (Red) — Стык 8: Анимационная математика
- [x] Создать `web/src/ui/animationMath.test.ts` с тестами:
  - `getSlidingPillOffset(activeFloor, measurements)`: расчёт смещения и ширины скользящего индикатора.
  - `velohubSpring(t)`: расчёт коэффициента интерполяции по кривой `(0.16, 1, 0.3, 1)`.
  - `formatOdometer(val, decimals)`: форматирование цифр с фиксированной точностью для плавного счётчика.
- [x] Запустить `npm test` и подтвердить падение тестов.

### Шаг 2. Реализация (Green)
- [x] Реализовать чистые функции в `web/src/ui/animationMath.ts`.
- [x] Убедиться, что тесты `animationMath.test.ts` проходят.
- [x] Обновить `web/src/ui/Header.tsx`:
  - Добавить скользящую плашку `.floor-switch-pill` в `.floor-switch` с плавным переходом `transform: translateX(...)` при смене этажа.
  - Обернуть метрику цеха `total` в `<AnimatedNumber value={total} format={fmtKw} durationMs={450} />`.
  - Обернуть расход газа `gas.flowM3h` в `<AnimatedNumber>`.
  - Обернуть генерацию СЭС `solarGen.powerKw` в `<AnimatedNumber>`.
  - Обернуть счётчики статусов станков (`counts[st]`) в `<AnimatedNumber>`.
- [x] Обновить `web/src/styles.css`:
  - Премиальный Glassmorphism и пружинный вход для `.card`:
    ```css
    animation: card-spring-in 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
    backdrop-filter: blur(16px);
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(226, 232, 240, 0.85);
    box-shadow: 0 20px 45px -12px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.04);
    ```
  - Плавное скольжение и пружина для `.floor-switch` и `.floor-switch-pill`.
  - Радарные круговые импульсы `@keyframes radar-ping` для `.scene-tag.is-critical`, `.scene-tag.is-warning`, `.supply-tag.is-critical`.
  - Пружинное появление модальных окон `.chart-modal` и `.solar-hvac-modal`.

### Шаг 3. Рефакторинг и верификация
- [x] Проверить соблюдение 60 FPS (анимации на CSS `transform`/`opacity` и `requestAnimationFrame`).
- [x] Запустить полную верификацию:
  ```bash
  npm test
  npm run typecheck
  ```
- [x] Передать на код-ревью субагенту `@code-reviewer`.

---

## 4. Вердикт код-ревью (`@code-reviewer`)
- Статус: `APPROVED (LGTM)` 🚀
- Замечания: Отсутствуют, требования ADR-0001, Стыка 8, стандартов UI/UX и типизации соблюдены на 100%.
