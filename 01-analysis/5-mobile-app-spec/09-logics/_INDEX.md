# 09. Логики — индекс

> Переиспользуемая бизнес- и UI-логика клиентского веб-приложения «Вертикаль». Выносится один раз и
> подключается на экранах через секцию «Применяемые логики» по ссылке (принцип DRY).
> Шаблон — [_LOGIC_TEMPLATE.md](../_LOGIC_TEMPLATE.md).

**Статус:** Черновик · **Дата:** 2026-07-05

---

## Реестр логик

| ID | Логика | Приоритет | Назначение | Применяется на |
|----|--------|-----------|------------|----------------|
| **LOGIC-001** | [Идемпотентность мутаций](LOGIC-001-idempotency.md) | Critical | `Idempotency-Key` при создании брони; защита от дублей при retry/таймауте | [SCR-004](../SCR-004-booking.md) |
| **LOGIC-002** | [Правило ранней/поздней отмены](LOGIC-002-cancellation-rule.md) | Critical | Отмена ≥2 ч / <2 ч; сервер — источник истины по статусу | [SCR-006](../SCR-006-booking-details.md), [BS-003](../BS-003-cancel-confirm.md) |
| **LOGIC-003** | [Раздельная доступность мест и проката](LOGIC-003-seats-rental-separation.md) | Critical | Независимый учёт `free_seats` и `rental.*`; плашка о нехватке проката | [SCR-003](../SCR-003-slot-card.md), [SCR-004](../SCR-004-booking.md) |
| **LOGIC-004** | [Сессия: access/refresh, 401-flow](LOGIC-004-session-401-refresh.md) | Critical | Access в памяти, refresh в httpOnly-cookie; тихое обновление и редирект на вход | Все экраны АЗ |
| **LOGIC-005** | [Web Push подписка](LOGIC-005-web-push-subscription.md) | Medium | Запрос `Notification.requestPermission()` после первой брони | [BS-002](../BS-002-booking-success.md) |
| **LOGIC-006** | [Loading/Content/Empty/Error](LOGIC-006-loading-content-empty-error.md) | High | Единый паттерн состояний + офлайн-кэш Service Worker | Все экраны с запросами |
| **LOGIC-007** | [Комбинирование фильтров](LOGIC-007-filter-combination.md) | High | ИЛИ внутри группы, И между группами; черновик/применённые фильтры | [SCR-002](../SCR-002-slot-list.md), [BS-001](../BS-001-filters.md) |

---

## Карта «экран → логики»

| Экран | Логики |
|-------|--------|
| [SCR-001 Регистрация / Вход](../SCR-001-registration.md) | L-004 |
| [SCR-002 Список тренировок](../SCR-002-slot-list.md) | L-006, L-007 |
| [BS-001 Фильтры](../BS-001-filters.md) | L-007 |
| [SCR-003 Карточка тренировки](../SCR-003-slot-card.md) | L-003, L-006 |
| [SCR-004 Оформление записи](../SCR-004-booking.md) | L-001, L-003 |
| [BS-002 Подтверждение записи](../BS-002-booking-success.md) | L-005 |
| [SCR-005 Мои бронирования](../SCR-005-my-bookings.md) | L-006 |
| [SCR-006 Детали брони + отмена](../SCR-006-booking-details.md) | L-002, L-006 |
| [BS-003 Подтверждение отмены](../BS-003-cancel-confirm.md) | L-002 |
| [BS-004 Оценка инструктора](../BS-004-rate-instructor.md) | — |
| [SCR-007 Профиль клиента](../SCR-007-profile.md) | L-004, L-006 |
