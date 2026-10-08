# MQTT-контракт: счётчик → цифровой двойник

Этот формат шлёт симулятор (`simulator/`), и ровно его же должна слать прошивка ESP32 со счётчиком
(PZEM-004T / SDM120 / SDM630 и т. п.). Разбор и валидация — `parseReading()` в
`packages/shared/src/reading.ts`, тесты — `reading.test.ts`.

## Брокер
- Хост: `localhost:1883` (Mosquitto из `docker-compose.yml`), WebSocket — `:9001`.
- Сейчас без авторизации (только для разработки). В продакшне: `password_file` + TLS (8883), отдельный логин на каждый счётчик.

## Топик
```
bakery/{equipmentId}/power
```
- `equipmentId` — `id` станка из `config/equipment.json` (`a-z 0-9 - _`), например `oven-1`.
- Префикс `bakery` меняется переменной `MQTT_TOPIC_PREFIX`.
- QoS 0 (или 1, если счётчик досылает буфер), `retain: false`.
- Частота: раз в 5 секунд.

## Сообщение (JSON, UTF-8)
```json
{
  "ts": "2026-10-08T05:59:55.000Z",
  "meterId": "ESP32_Dala_Meter_01",
  "powerKw": 0.77,
  "currentsA": [1.03, 2.25, 0.24],
  "voltageV": [229.1, 231.4, 230.2],
  "powerFactor": 0.91,
  "energyKwh": 1532.4,
  "order": "Батон нарезной ×120"
}
```

| Поле | Тип | Обяз. | Описание |
|------|-----|:-----:|----------|
| `powerKw` | number ≥ 0 | да* | Активная мощность, кВт (сумма по фазам). *Можно вместо неё `powerW` в ваттах. |
| `currentsA` | number[1] или number[3], ≥ 0 | да | Токи L1/L2/L3, А. Для однофазного — один элемент. |
| `ts` | ISO-8601 строка, unix-секунды или unix-мс | нет | Время измерения (UTC). Нет поля — берётся время получения. Числа < 10¹² считаются секундами. Не больше чем на 5 мин в будущем. |
| `meterId` | string | нет | ID счётчика/платы, показывается в карточке. |
| `voltageV` | number[1] или number[3] | нет | Фазные напряжения, В. |
| `powerFactor` | 0…1 | нет | cos φ. |
| `energyKwh` | number ≥ 0 | нет | Накопленная энергия, кВт·ч (счётчик-накопитель). |
| `order` | string ≤ 120 | нет | Текущий заказ/партия, если известен. Нет — в карточке «Заказа нет». |

Неизвестные поля игнорируются. Некорректные необязательные поля отбрасываются, сообщение принимается.
Сообщение отклоняется (и пишется в лог API) при: невалидном JSON, отсутствии/отрицательной мощности,
неправильном числе токов, мусорном `ts`.

## Что считается на стороне двойника (не нужно слать)
- `% от номинала` = `powerKw / nominalKw` из конфига.
- Несимметрия фаз (NEMA) = макс. отклонение тока от среднего / среднее × 100 %.
- Статус: `running` (зелёный), `idle` (жёлтый, < 10 % номинала), `alarm` (красный: > 115 % номинала,
  обрыв фазы, несимметрия > 40 % при нагрузке ≥ 30 %, аномалия ИИ-проверки), `offline` (серый, нет данных > 30 с).
  Пороги — `thresholds` в `config/equipment.json`.
- `ai_check`: среднее за 15 мин сравнивается с медианой минутных средних того же часа суток за 7 дней.

## Пример прошивки ESP32 (Arduino, PubSubClient + ArduinoJson)
```cpp
StaticJsonDocument<256> doc;
doc["ts"] = (uint32_t) time(nullptr);          // секунды, после NTP-синхронизации
doc["meterId"] = "ESP32_Dala_Meter_01";
doc["powerKw"] = pzem.power() / 1000.0;
JsonArray i = doc.createNestedArray("currentsA");
i.add(l1.current()); i.add(l2.current()); i.add(l3.current());
doc["energyKwh"] = pzem.energy();
char buf[256];
size_t n = serializeJson(doc, buf);
mqtt.publish("bakery/oven-1/power", buf, n);
```
Проверить вручную (из контейнера Mosquitto):
```bash
docker exec -it bakery-mosquitto mosquitto_pub -t bakery/oven-1/power \
  -m '{"powerKw":34.2,"currentsA":[55.1,54.0,56.3]}'
docker exec -it bakery-mosquitto mosquitto_sub -t 'bakery/#' -v
```
