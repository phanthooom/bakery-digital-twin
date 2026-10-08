# Навыки агента (vendored)

Скопированы из [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, © Matt Pocock),
коммит `f3fc563` от 2026-10-07: папки `skills/engineering/*` и `skills/productivity/*`.
Лицензия — `LICENSE-mattpocock-skills`.

Claude Code подхватывает их автоматически из `.claude/skills/`. Обновить: заново скопировать из репозитория
или поставить плагин `claude plugins install mattpocock-skills` (тогда эту папку удалить, чтобы не было дублей).

Настройки для этого репозитория: `docs/agents/*.md`, словарь — `GLOSSARY.md`, решения — `docs/adr/`.

## hairline-create

`hairline-create/` — навык из [lucasmarkes/hairline](https://github.com/lucasmarkes/hairline) (MIT, © Lucas Marques),
коммит `bc78224` от 2026-10-05: рисует новую изометрическую фигуру в стиле библиотеки `@lucasmarkes/hairline`
(например, свою печь или тестомес для пустых состояний). Сама библиотека подключена в `web` (версия зафиксирована: 0.3.0).
