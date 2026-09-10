# V1: торговый помощник Pons V2

Основание: TECHNICAL-AUDIT.md, 9 сентября 2026. Это итоговый рекомендуемый состав по проверенному коду и ТЗ для следующего этапа реализации. Продукт пока не реализован. Рабочее название отсутствует намеренно: бренд не влияет на контракт данных и исполнение.

## Цель и границы

Один пользователь на своей машине наблюдает запуски, получает объяснение фильтров, открывает позицию вручную или по правилам и сопровождает её до выхода. Каждый переход и результат остаются в журнале: FIND → ENTER → WATCH → EXIT → JOURNAL.

Полный V1 включает paper и отдельно включаемый local live. Поставляется сначала paper beta; live является следующей контрольной точкой того же V1, а не обещанием, что upstream уже безопасен. Первая поддерживаемая сеть: chainId 4663; один явно проверенный Pons V2 deployment; торговля только парами native ETH, до graduation и после в соответствующем Uniswap V4 pool. Swept/rescued и неизвестные состояния отображаются явно, без попытки неподдерживаемой маршрутизации.

Одна активная стратегия и один execution wallet на установку. Несколько открытых позиций в пределах лимита. Wallet balance discovery не нужен как основа продукта: собственные позиции и явные pins полностью задают список наблюдения. Автоматический вход V1 работает на новых curve launches; ручной вход возможен на поддерживаемой curve или pool.

## Состав

| Функция | V1 |
|---|---|
| Live launch feed, фильтры и карточка токена | Да |
| Объяснимый score, условия входа и причины пропуска | Да |
| Ручной и автоматический paper-вход | Да |
| Ручной и автоматический local live-вход | После live gate |
| TP, SL, trailing и max hold | Да |
| Частичный выход | Один автоматический TP частями + ручная доля |
| События deployer/reserve/fees/phase/pool | Да, только при валидных данных |
| Автопродажа по любому Canary LEAVE | Нет; только уведомление |
| Журнал, PnL, затраты, экспорт CSV/JSON | Да |
| Presets | Сохранение настроек и отдельный demo preset |
| Telegram | Односторонние уведомления с очередью; без торговых команд |
| Публичный сайт | Объяснение, синтетическое demo, GitHub и документация |
| AI decisions, copy trading, wallet follow, backtest-платформа | Вне V1 |
| Token launch/gating, hosted signing, multi-user SaaS | Вне V1 |

Частичный TP выбран минимальным: один take-profit порог продаёт заданную долю исходного объёма один раз; SL/trailing/time закрывают остаток. Многоступенчатые лестницы, DCA и несколько стратегий на одном токене отложены.

## Архитектура

Рекомендуется один локальный Node/TypeScript процесс и одна SQLite БД, локальный web UI через HTTP/SSE. Отдельные микросервисы и брокер сообщений не требуются.

1. **Pons adapter**: addresses/ABI, launch feed, quotes, snapshot reads. Перенос модулей Bodkin, унификация чтений Canary; никаких прямых зависимостей от getbodkin.xyz/Canary сайта.
2. **Decision engine**: чистые функции entry/exit/watch, версии правил и объяснения. Не имеет доступа к signer.
3. **Order service**: единственный путь ручных и автоматических действий; резервирование бюджета, очередь, idempotency, reconciliation.
4. **Paper executor / Live executor**: одинаковый контракт результата, физически разные зависимости. В paper signer не создаётся и секреты не читаются.
5. **Store + journal + alert outbox**: транзакционные записи, история, доставка, восстановление.
6. **Local API/UI**: список запусков, карточка сделки, controls, журнал, настройки и диагностика.

Альтернативы: два CLI рядом быстрее для демонстрации, но оставляют конкурирующие состояния и расходы RPC; полный rewrite уменьшает наследование проблем, но повторяет уже существующие protocol/quote-модули. Выбран перенос модулей с новым order/position слоем.

## Модель данных

Денежные значения — целые bigint, в SQLite/JSON как decimal strings; проценты исполнения — integer bps. Float допускается только для отображения.

| Сущность | Обязательные поля |
|---|---|
| Deployment | chainId, factory, hook, router/quoter/StateView, ABI version, checked block, validation status |
| Observation | token, blockNumber/blockHash, observedAt, source, field values, quality/error по полям |
| RuleSet | id/version, mode, entry filters, exit policy, max spend/open positions, createdAt |
| Order | UUID, idempotencyKey, positionId, chainId, walletId, mode, side, size, requestedAt, ruleVersion, reason, state, txHash/nonce |
| Fill | orderId, actual input/output, quote, minOut, block/receipt, fees, gas, refund, simulation assumptions |
| Position | UUID, chainId, walletId, mode, token, quantityRemaining, costRemaining, realizedPnl, peak, partialTpDone, lifecycle state |
| JournalEvent | monotonic id, order/position/token, timestamp, type, evidence, reason, before/after |
| AlertDelivery | eventId, destination, attempts, nextAttempt, delivery status |

Идентичность позиции не выводится из token+секунда. UNIQUE idempotencyKey предотвращает повтор одного действия; network+wallet+mode проверяются независимо от UI. Все изменения позиции, fill и журнала фиксируются одной транзакцией.

## Состояния исполнения

Order: proposed → reserved → submitted → confirmed; отдельные rejected/failed/unknown. Для paper reserved → confirmed без network submission. Unknown означает неизвестный результат отправки/receipt, а не разрешение повторно купить.

Position: opening → open → closing → closed; interrupted/error остаются видимыми до reconciliation. Partial fill уменьшает остаток и возвращает open. При рестарте сначала разрешаются submitted/unknown и сверяются остатки; auto-entry остаётся paused до окончания восстановления. Одна очередь отправки на wallet и один close-lock на позицию.

Запись intent предшествует отправке. Tx hash сохраняется сразу после получения. После неопределённого результата не отправляется новая экономическая операция вслепую: проверяются nonce/hash/receipt и фактический баланс. Замена транзакции должна сохранять тот же order identity.

## Правила и расчёты

**Вход.** Score, dev share, creator tax, socials, exemptions, разрешённая пара, фаза и бюджет проверяются явно. Недоступное обязательное поле блокирует auto-entry. Источник и давность каждого используемого поля доступны в журнале. До входа — повторная проверка фазы, opening tax для actual recipient и свежая котировка.

**Бюджет.** Настраиваемый лимит общей суммы входов на явно созданный пользователем run; переживает рестарт. Учитываются spent и reserved. Продажи не восстанавливают этот лимит. Отдельно требуется доступный баланс с запасом на gas. Сброс run — явная операция при отсутствии неопределённых приказов. MaxOpenPositions включает opening и closing.

**Paper.** Виртуальный ETH баланс; нулевой баланс не может финансировать вход. Котировка учитывает известные protocol/creator/opening fees и clamp/refund. Gas и моделируемое проскальзывание явно помечены как оценки; quote-only режим нельзя выдавать за фактическое исполнение. При недоступной котировке fill не создаётся. Simulated fills не изменяют on-chain рынок; backtest/replay исполнения всей сети не заявляется.

**Выход.** PnL пороги определяются по liquidation quote остатка относительно его cost basis; оценка gas показывается отдельно. При одновременных условиях порядок: ручной принятый close, SL, trailing, max hold, partial TP. Закрытие проходит общий lock и повторную проверку остатка. Trailing активируется после роста net quote выше cost basis. При частичном выходе себестоимость и peak масштабируются пропорционально оставшейся доле; partial TP флаг устанавливается только по подтверждённому fill. До полной продажи округление не теряет учёт dust.

**PnL.** Realized = выручка подтверждённых/симулированных fills минус выделенная себестоимость и относящиеся расходы. Unrealized = текущая ликвидационная оценка минус остаточная себестоимость, с отдельно показанными estimated exit costs. Нельзя складывать fees дважды, если они уже включены в quoted output. Каждое число имеет определение в UI.

**События Canary.** Падение deployer balance не называется доказанной продажей; active liquidity не называется полным TVL; fees moved не называется кражей. Сравнение только двух валидных снимков совместимой фазы и denomination. Неизвестный reserve никогда не 0. Сигналы не вызывают автоматический выход V1.

## Данные и восстановление

Снимок использует общий block tag либо явно фиксирует диапазон и неполноту. При устаревшей котировке авто-вход блокируется; для первой реализации maxQuoteAge=3 s, maxSnapshotAge=15 s, настраиваемые в конфигурации и проверяемые интеграционным тестом. Эти значения — исходные инженерные настройки, не обещание скорости RPC.

Целевой опрос позиций — каждые 5 s без перекрытия; при перегрузке видны возраст и очередь. Cursor feed сохраняется на диск. Reconnect делает overlap/backfill и dedup по chain+txHash+logIndex с blockHash; удалённые reorg события отмечаются и пересчитываются. Новые входы по устаревшим backfill-событиям запрещены. Открытая позиция наблюдается даже если вышла из окна последних запусков.

Pause entries останавливает новые входы, но оставляет наблюдение и выходы. Отдельный stop execution запрещает новые отправки, не отменяет уже отправленные транзакции, продолжает их reconciliation. Во время swept UI показывает временную невозможность сделки; TP/SL не гарантируют исполнение в неторгуемой фазе.

## Интерфейс

Пять представлений: Launches, Positions, Position detail, Journal, Settings/Health. Вверху постоянно mode, wallet, chain, RPC status и состояние auto-entry. Position detail показывает исходные условия, timeline, остаток, realised/unrealised, источники данных и manual close/partial.

Preset — версия набора правил; изменение применяется к новым входам. Уже открытые позиции сохраняют exit policy, изменение её пользователем создаёт journal event. Demo preset использует синтетические fixtures; производственная автоматическая стратегия не включается автоматически при первом запуске.

Local control требует session token и Host/Origin validation. Секрет не возвращается в API и логи. Live использует выделенный локальный signer; хранение ключа в явном локальном env в ранней версии документируется честно, как у upstream, без заявления об encrypted vault. Paper не требует env с ключом. Открытый hosted control запрещён.

Публичный сайт: короткое описание, один полный synthetic demo cycle, ограничения, документация, GitHub. Общий публичный live feed и платный 24/7 хостинг можно добавить позже; их инфраструктура не нужна для первого локального V1.

## Критерии приёмки

1. Чистая установка Windows/Node 24: build/typecheck/tests проходят, demo запускается без ключей и внешних отправок.
2. Synthetic цикл: launch → rule match → paper buy → valid watch event → partial TP → final exit → export; суммы ledger сходятся до минимальной единицы.
3. Ошибка tax RPC не разрешает вход; ошибка reserve RPC не создаёт ложный reserve-drop. Частичная ошибка вызывает quality/fallback, а не подстановку 0.
4. При общем каталоге данных paper не закрывает live и live не исполняет paper; тесты wallet/chain mismatch также отклоняются.
5. Два конкурентных входа не превышают budget с учётом reservations; рестарт сохраняет лимит.
6. Долгий receipt и одновременные manual/auto close создают не более одного активного exit order; unknown не повторяется вслепую.
7. Прерывание процесса до/после submit/receipt/write восстанавливает однозначное состояние без потери confirmed fill.
8. Clamp/refund, partial exit, gas, approval costs и dust учитываются корректно; посторонний ETH transfer не становится торговой прибылью.
9. WS outage/reconnect, duplicate logs, reorg и устаревшие snapshots проходят сценарии; исторический backfill не покупается автоматически.
10. Фазы curve → swept → pool обрабатываются; unsupported pair/phase не отправляет транзакцию.
11. Неавторизованные HTTP control-запросы и чужой Origin отклоняются; приватный ключ отсутствует в ответах/экспорте/логах.
12. Telegram failure не теряет событие из outbox, retries ограничены; dedup переживает рестарт.
13. Перед live: chain/code/ABI/deployment проверены read-only; котировки и transactions проверены на подходящем fork/test fixture по обоим venues, затем отдельно согласован ограниченный live smoke. Проверка реальными средствами не входит в текущий аудит.

## Порядок реализации и готовность

Сначала исправления A1/A2/A5 и общий ledger/order contract; затем discovery/snapshots/strategy; затем paper и partial exits; после — UI/journal/alerts и тестирование отказов. Paper beta считается готовой после критериев 1–12 в соответствующем paper/mock объёме. Live release добавляет фактический executor и полный критерий 13 плюс повтор ключевых concurrency/recovery проверок с реальными receipt fixtures.

До реализации нельзя считать проверенными: актуальные адреса/ABI deployment, экономическую точность quote-модели относительно контрактов и устойчивую пропускную способность RPC. Это конкретные интеграционные задачи, включённые в оценку аудита. Название, маскот и token economics не блокируют начало engineering работ.
