# Сторонние 3D-модели

## tesla-semi.glb, tesla-semi-van.glb

`tesla-semi-van.glb` — та же модель: только кабина (рама тягача за ней отрезана), передние колёса
и одна пара задних спарок, уменьшена под будку фургона.

«Tesla semi truck» — автор [iZnoGouD](https://sketchfab.com/izznogoud),
[Sketchfab](https://sketchfab.com/3d-models/tesla-semi-truck-0a7e0ae8315f4fa1b4444b34a947f746),
лицензия [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).

Изменения: меши объединены в один, текстура-палитра заменена цветами вершин
(кабина и прицеп перекрашены в белый), масштаб приведён к метрам, геометрия сжата meshopt.
Сборка — `scripts/build-tesla-semi.mjs`.

## worker.glb, baker.glb

«Finley — 3D Person, Warehouse worker with pallet jack» — Innerscene по ассетам MakeHuman,
[CC0](https://creativecommons.org/publicdomain/zero/1.0/) (указывать автора не обязательно).

Изменения: убраны зубы, ресницы, брови и карта нормалей, текстуры запечены в цвета вершин,
всё объединено в один меш и упрощено с 39,8 тыс. до 2,8 тыс. треугольников, геометрия сжата meshopt
(22,7 МБ → 34 КБ). `baker.glb` — тот же человек без рохли и каски, жилет и рубашка перекрашены в белую куртку,
джинсы — в тёмные брюки (1,7 тыс. треугольников, 22 КБ); колпак рисует сцена. Сборка обоих — `scripts/build-finley.mjs`.

Остальные модели в этой папке (`mixer.glb`, `moulder.glb`, `proofer.glb`, `oven.glb`, `blastfreezer.glb`, `conveyor.glb`, `packer.glb`, `icemaker.glb`, `coldroom.glb`, `hvac.glb`, `silo-25t.glb`, `silo-15t.glb`) сгенерированы по стандарту промышленных PBR-материалов (SimReady-совместимая иерархия узлов со статическим слиянием геометрии `mergeStatic` и выделенными анимируемыми группами `anim_*`) скриптами `scripts/generate-all-machines.js` и `scripts/generate-simready-models.js`.
