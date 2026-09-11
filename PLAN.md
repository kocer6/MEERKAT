# MEERKAT — общий план и прогресс

Обновлено: 2026-09-10. Это основной трекер работ для пользователя, Codex и Claude.

**Текущая точка: изменения Claude сохранены; paper-ядро, локальный UI и реальная read-only лента Pons работают. Следующая задача: M3.2 — обогащение и рыночные котировки. Сделки в UI пока synthetic.**
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
- [x] M2.2 Entry filters + score reasons; unknown tax блокирует вход. Готово: entryReasons в src/rules.ts разбит на явные, независимые причины (score unreadable/exceeds-100/below-threshold; tax unknown/invalid-reading/exceeds-limit; token/amount/source), каждая причина возвращается независимо, а не только первая. Доказательство: test/rules.test.ts - 11 тестов: matched (пустой список причин), rejected (по каждому фильтру отдельно), unreadable (score NaN/Infinity, opening tax null), множественные одновременные причины и явная регрессия A1. npm test 26/26 (было 15, +11 новых).
- [x] M2.3 Paper buy: резерв бюджета, проверка баланса/лимита позиций, fees и refund. Готово: конкурентные входы не превышают лимит; paper не отправляет транзакций.
- [x] M2.4 Quote-based monitoring, TP/SL/trailing и ручной полный выход. Готово: один exit на позицию при конкурентных триггерах, корректный PnL и расходы.
- [x] M2.5 Полный synthetic demo: launch → entry → watch → exit → journal. Готово: один запуск команды без ключей, ожидаемые итоговые суммы и причины.

Checkpoint: рабочее ядро с детерминированной демонстрацией; не объявлять данные реальными.

## M3 — реальные данные Pons V2

Зависит от M2; все сделки остаются симулированными.

- [x] M3.1 Проверить chainId/deployment/ABI read-only и подключить feed. Готово: записаны реальные block/tx/token примеры и источник; synthetic fallback не маскируется под live.
- [ ] M3.2 Обогащение, актуальные curve/pool quotes, фазы graduation и ограничения ETH pairs. Готово: поддерживаемые случаи читаются, неподдерживаемые явно отклоняются.
- [ ] M3.3 Canary watch rules с quality полей. Готово: reserve RPC failure не становится нулём/ложным alert, регрессия A5; LEAVE не продаёт.
- [ ] M3.4 Pin открытых позиций, bounded polling без перекрытия, reconnect/backfill/dedup, stale status. Готово: outage и повторные события не дают повторных входов или потери учёта.

Checkpoint: реальные наблюдения + paper fills, с понятными ограничениями RPC и возраста данных.

## M4 — интерфейс и продуктовая демонстрация

Зависит от M2; интерфейс можно подключать к fixtures до завершения M3.

- [ ] M4.1 Локальный сервер/API и web UI: launches, positions, journal, settings/health. Готово: запуск из README и проверка в браузере.
- [ ] M4.2 Start/pause entries, ручной paper-вход/выход, параметры стратегии, постоянные labels режима/источника. Готово: UI controls реально меняют нужное состояние, ограничения видны.
- [ ] M4.3 Timeline сделки, причины входа/выхода, realized/unrealized и экспорт. Готово: данные UI/экспорта совпадают с ledger.
- [x] M4.4 Краткая стартовая страница MEERKAT с описанием, demo и GitHub. Готово: выглядит завершённо на desktop/mobile; нет обещаний live исполнения.

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


### Evidence — M2.2 explainable entry filters, 2026-09-10

npm ci, npm run typecheck, npm run build, npm test (26/26 = 15 prior + 11 new), npm run demo all exit 0. entryReasons in src/rules.ts now returns granular, independent reasons instead of combined generic ones: score is split into "score is unreadable" (non-finite - NaN/Infinity), "score exceeds the maximum of 100", and "score below minimum threshold"; opening tax is split into "opening tax unknown" (A1 fix, unchanged wording so the existing PaperEngine-level regression test in test/paper.test.ts keeps passing), "opening tax reading is invalid" (non-integer/negative), and "opening tax exceeds limit". New test/rules.test.ts tests entryReasons directly (not only through PaperEngine): matched (empty reasons for a fully valid entry), one test per rejected filter, unreadable-data cases (non-finite score, null tax) kept distinct from threshold rejections, and one test asserting all independent failures are reported together rather than stopping at the first. M1.3/M3/M4 remain open and untouched this checkpoint.

### Evidence — M3.1 and local dashboard, 2026-09-10

Claude main through 9bf67b9 integrated without overwriting rules/tests. Node v24.20.0: 33/33 tests, typecheck and build pass. Added immutable validated rules, local authenticated dashboard, persistent synthetic scenario/positions/journal/export, read-only Pons discovery with bounded single-flight polling and start/pause. M3.1 real evidence: docs/evidence/market-read-2026-09-10.json; chain 4663, factory bytecode and latest event/record ABI match, block 59541655. Browser displayed newer real launches and completed a synthetic scenario; desktop and 390x844 mobile inspected, console clean. M4.4 local starter/dashboard with description, demo and GitHub is verified; not publicly hosted.

M1.3 partial: selected ABI/constants with MIT notices only. M4.1 partial: server, launches, positions, journal and rules summary exist; editable settings/complete health remain. M4.3 partial: journal/realized PnL/export exist; position-specific timeline and unrealized PnL remain. M3.4 partial: bounded single-flight polling/dedup/error age exist, durable backfill and pinned positions do not. All these partial IDs remain unchecked. Next: M3.2.

### Evidence — brandkit redesign, 2026-09-10
- [x] B1 Apply supplied MEERKAT brandkit to local dashboard: generated pixel-art hero, sand/amber palette, local pixel font with OFL license, five-step route, responsive navigation. Desktop and 390x844 mobile checked; paper scenario completed. 33 tests plus build/typecheck pass. Details: docs/BRAND.md. M3.2 remains the next engineering task.

### Evidence — real curve inspection, 2026-09-10
M3.2 partial: native-ETH pre-graduation curve inspection, taxes, fee-aware buy/refund and independent sell estimates at one verified block. Authenticated API and input form integrated, no ledger mutations. Real evidence: docs/evidence/curve-quote-2026-09-10.json. 40 tests, typecheck/build and JS syntax check pass; browser form checked on a real token. M3.2 remains unchecked: pool quotes, full enrichment/score and trade integration still pending. Next: scoring/quality + paper gas model, then manual market-based paper entry/exit. Design work paused by user.

### Evidence — manual market paper lifecycle, 2026-09-11
M3.2/M4.2 partial: authenticated market paper buy/update/full close, five mandatory curve liquidity/cost checks, 0.0001 ETH fixed modeled gas per side, persistent entry-block/check evidence, CHAIN labels and unrealized PnL. 45 tests, typecheck/build/JS syntax pass. Real cycle: docs/evidence/market-paper-cycle-2026-09-11.json. Manual position updates only; background monitoring, pool quotes, strategy settings and richer risk analysis remain open. Next M3.4 monitoring + M3.3 watch quality.

### Evidence — background position monitoring, 2026-09-11
M3.4 partial: persisted open chain positions monitored sequentially every 15s after completion, shared in-flight tick, pause/resume, per-position RPC error/last success, graceful shutdown. Negative-net liquidation now triggers stop-loss and charges modeled gas correctly. 49 tests + build/typecheck/JS syntax pass; browser pause/resume verified. Backfill/reorg discovery remains open. Next M3.3 quality-aware reserve watch and pool graduation support.

### Reserve watch checkpoint (2026-09-11)
M3.3 partial: durable real ETH reserve baseline and historical warnings (>15%, same curve, increasing blocks, <=60s). Unknown reads break comparison; no alert-triggered sale. API/export/position journal connected. 53 tests and build pass. Remaining: other Canary signals, pool support, durable discovery, cross-block order replay handling.

### Graduation exits checkpoint (2026-09-11)
M3.2/M4.2 partial: exact-quantity native ETH v4 pool quotes now support existing positions after phase 2, monitoring and paper close. 56 tests/build pass; live block 60099012 evidence saved. New pool entries and other pairs remain blocked. Next: cross-block order replay reliability.

### Order replay checkpoint (2026-09-11)
Completed market order replay now works without RPC and across restart, using stable request identity. Changed requests and failed/pending orders reject; closed positions stay closed. UI retry retains the ID until reload/reinspection. 59 tests/build/typecheck/JS checks pass. Next durable discovery and additional risk signals.

### Durable scanner checkpoint (2026-09-11)
M3.4 partial: SQLite cursor/history restored on restart, 2,000-block catch-up chunks, 64-block replacement overlap, errors preserve checkpoint, shutdown awaits read. UI scanned/head progress. 62 tests/build/JS pass. Deep reorgs and scalable history storage remain open.
