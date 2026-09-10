# MEERKAT — общий план и прогресс

Обновлено: 2026-09-10. Это основной трекер работ для пользователя, Codex и Claude.

**Текущая точка: offline paper-ядро, synthetic demo и runtime-валидация Rules работают. Следующие задачи: M1.3/M3 adapters, M2.2 richer scoring, M4 UI.**

Приоритет — работающий paper MVP в двухдневном окне пользователя. Полный V1 из docs/V1-SPEC.md шире этого релиза. Не переносить отложенные функции в MVP автоматически. Время ниже — порядок этапов, а не гарантированный срок.

## Как читать и обновлять

`[x]` — сделано и проверено; `[ ]` — не завершено. Частично выполненный пункт остаётся открытым, детали указываются в HANDOFF.md. Не отмечать этап по одному наличию файлов. Для каждого завершения записывать доказательство: команда, результат или ссылка на артефакт/commit.

PLAN.md хранит общий прогресс. HANDOFF.md — точное место остановки, последнюю проверку, текущие ошибки и следующую операцию. README.md — фактически работающий запуск. AGENTS.md/CLAUDE.md — инструкции помощнику. Git содержит историю кода. При расхождении доверять проверенному коду и свежим результатам, затем исправить документы.

## M0 — подготовка

- [x] M0.1 Определить продукт: FIND → ENTER → WATCH → EXIT → JOURNAL. Доказательство: docs/MVP-2-DAY.md.
- [x] M0.2 Проверить Bodkin/Canary, зафиксировать revisions и MIT notices. Доказательство: docs/audit/TECHNICAL-AUDIT.md. Это проверка upstream, не готовность нашего приложения.
- [x] M0.3 Выполнить upstream tests/build/typecheck и две проверки дефектов с mock RPC. Доказательство: docs/audit/evidence/; 23 + 46 тестов, два воспроизведения. Дефекты ещё не исправлены в продукте.
- [x] M0.4 Подключить GitHub и сохранить исходный checkpoint. Подтверждённый remote commit: a9be2c0e975da19b1bfca1363d1d3cce4ec6b445.
- [x] M0.5 Подготовить общий трекер, handoff и инструкции Claude. Доказательство: PLAN.md, HANDOFF.md, CLAUDE.md и docs/CONTINUE-IN-CLAUDE.md в этом checkpoint.

## M1 — минимальный запускаемый проект (первым)

- [x] M1.1 Создать Node 24 + TypeScript проект, lockfile, команды build/typecheck/test/demo, минимальный smoke test. Готово: чистая установка и команды реально проходят.
- [x] M1.2 Ввести минимальные типы launch/quote/rules/position/journal, bigint-суммы, quality unknown и явный paper mode. Готово: `validateRules`/`assertRules` в src/rules.ts проверяют Rules при построении PaperEngine (minScore/maxTaxBps/maxPositions/maxGasWei/quoteMaxAgeMs/takeProfitBps/stopLossBps/trailingBps/maxHoldMs); типы сами по себе не проверяли рантайм-вход. Доказательство: test/paper.test.ts — «constructing PaperEngine rejects malformed rules...» (14 негативных случаев), «default rules pass runtime validation», границы maxPositions/budget/balance, Ledger отклоняет отрицательный initial/budget. `npm test` 15/15. Нет signer нигде в paper dependency graph (без изменений — уже было верно).
- [ ] M1.3 Перенести только необходимые upstream-модули с LICENSE/THIRD_PARTY_NOTICES и pinned provenance. Готово: импорты собираются, права сохранены; чужие токены/реферальные ссылки/бренд не попадают в наш интерфейс.

Checkpoint: воспроизводимый запуск каркаса и точная инструкция установки.

## M2 — полный автономный paper-цикл на fixtures

Зависит от M1. До работы с реальной сетью получить один проверяемый цикл.

- [x] M2.1 SQLite: позиции, orders, fills, виртуальный баланс, журнал; транзакционные изменения. Готово: сохранение/перезапуск и корректные bigint round trips.
- [ ] M2.2 Entry filters + score reasons; unknown tax блокирует вход. Готово: matched/rejected/unreadable сценарии, регрессия A1.
- [x] M2.3 Paper buy: резерв бюджета, проверка баланса/лимита позиций, fees и refund. Готово: конкурентные входы не превышают лимит; paper не отправляет транзакций.
- [x] M2.4 Quote-based monitoring, TP/SL/trailing и ручной полный выход. Готово: один exit на позицию при конкурентных триггерах, корректный PnL и расходы.
- [x] M2.5 Полный synthetic demo: launch → entry → watch → exit → journal. Готово: один запуск команды без ключей, ожидаемые итоговые суммы и причины.

Checkpoint: рабочее ядро с детерминированной демонстрацией; не объявлять данные реальными.

## M3 — реальные данные Pons V2

Зависит от M2; все сделки остаются симулированными.

- [ ] M3.1 Проверить chainId/deployment/ABI read-only и подключить feed. Готово: записаны реальные block/tx/token примеры и источник; synthetic fallback не маскируется под live.
- [ ] M3.2 Обогащение, актуальные curve/pool quotes, фазы graduation и ограничения ETH pairs. Готово: поддерживаемые случаи читаются, неподдерживаемые явно отклоняются.
- [ ] M3.3 Canary watch rules с quality полей. Готово: reserve RPC failure не становится нулём/ложным alert, регрессия A5; LEAVE не продаёт.
- [ ] M3.4 Pin открытых позиций, bounded polling без перекрытия, reconnect/backfill/dedup, stale status. Готово: outage и повторные события не дают повторных входов или потери учёта.

Checkpoint: реальные наблюдения + paper fills, с понятными ограничениями RPC и возраста данных.

## M4 — интерфейс и продуктовая демонстрация

Зависит от M2; интерфейс можно подключать к fixtures до завершения M3.

- [ ] M4.1 Локальный сервер/API и web UI: launches, positions, journal, settings/health. Готово: запуск из README и проверка в браузере.
- [ ] M4.2 Start/pause entries, ручной paper-вход/выход, параметры стратегии, постоянные labels режима/источника. Готово: UI controls реально меняют нужное состояние, ограничения видны.
- [ ] M4.3 Timeline сделки, причины входа/выхода, realized/unrealized и экспорт. Готово: данные UI/экспорта совпадают с ledger.
- [ ] M4.4 Краткая стартовая страница MEERKAT с описанием, demo и GitHub. Готово: выглядит завершённо на desktop/mobile; нет обещаний live исполнения.

Checkpoint: пользователь может самостоятельно пройти демонстрацию через интерфейс.

## M5 — проверка и поставка MVP

Зависит от M1–M4. Ошибки, влияющие на правдивость данных и учёт, не переносить ради косметики.

- [ ] M5.1 Сценарии restart, budget concurrency, duplicate close, RPC unknown/stale, unsupported phase и отсутствия signer. Готово: регрессии проходят, результаты записаны.
- [ ] M5.2 Проверка локального control API, секретов и файлов поставки. Готово: чужие Origin/неавторизованные команды отклоняются, ключи и runtime data не коммитятся.
- [ ] M5.3 Чистая установка из GitHub checkout, build/typecheck/tests/demo и визуальная QA. Готово: README команды воспроизведены; реальные ограничения перечислены.
- [ ] M5.4 Финальный checkpoint, changelog релиза, инструкция пользователя и точный следующий backlog. Готово: remote SHA проверен и handoff соответствует коду.
- [ ] M5.5 Публичное размещение стартовой страницы, если выбран хостинг. Готово: URL открыт и проверен. При отсутствии хостинга явно указать «готово локально, не опубликовано»; не блокировать этим локальную поставку.

## После MVP — не выполнять в двухдневном релизе

- [ ] L1 Local live executor только после исправлений A1–A9 и отдельной проверки исполнения.
- [ ] L2 Частичные TP/продажи и полноценный учёт остаточной себестоимости.
- [ ] L3 Telegram outbox и устойчивые уведомления.
- [ ] L4 Hosted watch/history, token utility/gating — отдельное продуктовое решение.

Copy trading, AI trading и многопользовательский SaaS не являются обязательствами текущего плана.

## Протокол остановки и передачи

После каждого законченного блока и перед завершением сессии:

1. Отметить выполненные ID здесь, с доказательствами; не менять открытые пункты на выполненные без проверки.
2. Обновить HANDOFF.md: текущий ID, изменённые файлы, команды/результаты, известные ошибки, следующая операция, необходимые доступы.
3. Закоммитить код и документы вместе. Проверенный checkpoint отправить в main; незавершённый код — в явно названную WIP ветку с описанием поломок.
4. Проверить remote SHA. При недоступной отправке сообщить об этом и сохранить локальный checkpoint.
5. Не ждать «последнего токена»: контрольные точки нужны во время работы. Незаписанные изменения при внезапном обрыве сессии не гарантированно доступны следующему ИИ.

### Evidence — offline core checkpoint, 2026-09-10

M1.1/M2.1/M2.3/M2.4/M2.5: `npm ci`, `npm run typecheck`, `npm run build`, `npm test` (9/9), `npm run demo`. Tests cover reservations, refunds/gas, idempotency, concurrent exits, restart and exact demo amounts. Fills are journal events rather than a separate table. Demo starts from an explicit synthetic fixture; real launch discovery is not implemented. No GUI controls yet. M1.2/M2.2 stay open pending runtime validation and richer scoring.

### Evidence — M1.2 runtime rules validation, 2026-09-10

`npm ci` (Node 22.22.2 in this sandbox; package.json pins `>=24 <25`, node:sqlite ran fine on 22.22.2 here but has not been re-verified on Node 24 in this session — treat as a gap, not a pass, for the pinned engine). `npm run typecheck`, `npm run build`, `npm test` (15/15), `npm run demo` all exit 0. New: `validateRules`/`assertRules` in src/rules.ts; `PaperEngine` constructor now calls `assertRules` so a malformed Rules object (bad minScore/maxTaxBps/maxPositions/maxGasWei/quoteMaxAgeMs/takeProfitBps/stopLossBps/trailingBps/maxHoldMs — wrong type, out of range, non-integer, zero where positive is required) throws at construction instead of silently reaching budget/exit logic. Added tests: 14-case malformed-rules matrix, default-rules-pass check, maxPositions boundary (limit vs limit+1), budget boundary (exact vs +1 wei), balance boundary (exact vs +1 wei), Ledger negative-initial/negative-budget rejection. M2.2 (entry filters + score reasons, richer than current entryReasons) stays open — not touched this checkpoint.
