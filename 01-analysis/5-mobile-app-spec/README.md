# ТЗ на клиентское веб-приложение «Вертикаль» — 5-mobile-app-spec

> **Статус:** Черновик · **Версия:** 0.1 · **Дата:** 2026-07-05

Этот раздел — комплект детальных ТЗ на экраны/шторки (bottom sheet) клиентского веб-приложения
скалодрома «Вертикаль» (React + Tailwind CSS), написанных по шаблонам
[`_SCREEN_TEMPLATE.md`](_SCREEN_TEMPLATE.md) и [`_LOGIC_TEMPLATE.md`](_LOGIC_TEMPLATE.md).

Верхнеуровневые документы (не дублируются здесь, только ссылки):
- Бизнес-требования — `../2-requirements/business-requirements.md`
- Функциональные требования (FR-*) — `../2-requirements/functional-requirements.md`
- Нефункциональные требования (NFR-*) — `../2-requirements/non-functional-requirements.md`
- Use cases (UC-*) — `../2-requirements/use-cases.md`
- User stories (US-*) — `../2-requirements/user-stories.md`
- Домен — `../1-elicitation/domain-description.md`
- Дизайн-бриф и сквозные правила — `../3-design-brief/00-foundations.md`, `design-brief.md`
- API-контракт — `../api/openapi.yaml`
- Модель данных / состояний — `../4-design/data-model.md`
- Sequence-диаграммы API — `../4-design/api-sequence.md`, `er-model-and-sequences.md`

## Важное отличие от шаблона-примера

Шаблоны `_SCREEN_TEMPLATE.md` / `_LOGIC_TEMPLATE.md` унаследованы от другого (мобильного,
React Native, REST+GraphQL, `rigla_network/*`) проекта. Для «Вертикали» адаптировано:

| В шаблоне | В «Вертикали» |
|---|---|
| REST (`rigla_network/rest/domains/*.yaml`) + GraphQL (`schema_rigla.graphql`) | Единый REST-контракт [`openapi.yaml`](../api/openapi.yaml) (без GraphQL) |
| `REQ-FUNC-XXX`, `REQ-INT-XXX`, `REQ-UI-XXX`, `REQ-DATA-XXX` (отдельная нумерация) | Прямые ссылки на уже существующие ID: **FR-*** (функциональные), **NFR-*** (интеграции/данные/безопасность), **UC-*** / **US-*** — отдельная REQ-нумерация не вводится, чтобы не плодить параллельную систему ID (см. пометки о разрывах нумерации в functional-requirements.md) |
| Мобильное приложение (React Native, deep link, push через FCM/APNs) | Адаптивное веб-приложение (SPA), Web Push (Service Worker + Push API) + Telegram-дублирование (NFR-17) |
| Figma-макеты обязательны | Макетов Figma нет (бренд не зафиксирован) — вместо `Дизайн-макет` указывается ссылка на текстовый wireframe из `../3-design-brief/{ID}.md` |
| Домены `01. Просмотр прогулок` и т.п. (тематика — прогулки на теплоходе) | Домены адаптированы под тематику скалодрома (см. схему ниже) |

## Схема доменов

| Домен | Название | Документы |
|---|---|---|
| 01 | Авторизация | SCR-001 |
| 02 | Просмотр тренировок | SCR-002, SCR-003, BS-001 |
| 03 | Запись на тренировку | SCR-004, BS-002 |
| 04 | Мои бронирования | SCR-005, SCR-006, BS-003 |
| 05 | Оценка инструктора | BS-004 |
| 06 | Профиль | SCR-007 |
| 09 | Логики (сквозные, переиспользуемые) | LOGIC-001…007 |

## Схема функциональных блоков (FB-XXX)

| FB | Название | Экран(ы) |
|---|---|---|
| FB-AUTH-001 | Вход по SMS-коду | SCR-001 |
| FB-AUTH-002 | Вход/привязка через Telegram | SCR-001, SCR-007 |
| FB-SLOTS-001 | Просмотр списка тренировок (7 дней) | SCR-002 |
| FB-SLOTS-002 | Фильтрация списка | SCR-002, BS-001 |
| FB-SLOTS-003 | Карточка тренировки | SCR-003 |
| FB-BOOK-001 | Создание брони (снаряжение + подтверждение) | SCR-004 |
| FB-BOOK-002 | Подтверждение записи (успех) | BS-002 |
| FB-MYB-001 | История бронирований | SCR-005 |
| FB-MYB-002 | Детали брони | SCR-006 |
| FB-MYB-003 | Отмена брони | SCR-006, BS-003 |
| FB-RATE-001 | Оценка инструктора | BS-004, SCR-005, SCR-006 |
| FB-PROFILE-001 | Просмотр/редактирование профиля | SCR-007 |
| FB-PROFILE-002 | Привязка/отвязка Telegram | SCR-007 |
| FB-PROFILE-003 | Выход из аккаунта | SCR-007 |

## Схема сквозных логик (09-logics/LOGIC-*)

| ID | Название | Где применяется |
|---|---|---|
| [LOGIC-001](09-logics/LOGIC-001-idempotency.md) | Идемпотентность мутаций (`Idempotency-Key`) | SCR-004 (createBooking) |
| [LOGIC-002](09-logics/LOGIC-002-cancellation-rule.md) | Правило ранней/поздней отмены (2 ч, сервер — источник истины) | SCR-006, BS-003 |
| [LOGIC-003](09-logics/LOGIC-003-seats-rental-separation.md) | Раздельная доступность мест и прокатного снаряжения | SCR-003, SCR-004 |
| [LOGIC-004](09-logics/LOGIC-004-session-401-refresh.md) | Сессия: access/refresh, 401-flow | Все экраны АЗ |
| [LOGIC-005](09-logics/LOGIC-005-web-push-subscription.md) | Web Push подписка и запрос разрешения | BS-002 |
| [LOGIC-006](09-logics/LOGIC-006-loading-content-empty-error.md) | Единый паттерн Loading/Content/Empty/Error + офлайн-кэш | Все экраны с запросами |
| [LOGIC-007](09-logics/LOGIC-007-filter-combination.md) | Комбинирование фильтров (ИЛИ внутри группы / И между группами) | BS-001, SCR-002 |

## Карта документов

| ID | Тип | Экран/Шторка | Приоритет | Файл |
|---|---|---|---|---|
| SCR-001 | Экран | Регистрация / Вход | Critical | [SCR-001-registration.md](SCR-001-registration.md) |
| SCR-002 | Экран | Список тренировок | Critical | [SCR-002-slot-list.md](SCR-002-slot-list.md) |
| BS-001 | Bottom Sheet | Фильтры | High | [BS-001-filters.md](BS-001-filters.md) |
| SCR-003 | Экран | Карточка тренировки | Critical | [SCR-003-slot-card.md](SCR-003-slot-card.md) |
| SCR-004 | Экран | Оформление записи | Critical | [SCR-004-booking.md](SCR-004-booking.md) |
| BS-002 | Bottom Sheet | Подтверждение записи | High | [BS-002-booking-success.md](BS-002-booking-success.md) |
| SCR-005 | Экран | Мои бронирования | Critical | [SCR-005-my-bookings.md](SCR-005-my-bookings.md) |
| SCR-006 | Экран | Детали брони + отмена | Critical | [SCR-006-booking-details.md](SCR-006-booking-details.md) |
| BS-003 | Bottom Sheet | Подтверждение отмены | High | [BS-003-cancel-confirm.md](BS-003-cancel-confirm.md) |
| BS-004 | Bottom Sheet | Оценка инструктора | Medium | [BS-004-rate-instructor.md](BS-004-rate-instructor.md) |
| SCR-007 | Экран | Профиль клиента | Medium | [SCR-007-profile.md](SCR-007-profile.md) |

> **Решение по BS-004.** В шаблоне-примере BS-004 — «карта маршрута» (route-map). У «Вертикали»
> карта не применима (одна площадка, домен §1: мультилокационность не требуется, R-015). BS-004
> закреплён за **оценкой инструктора** (FR-40, FR-41, UC-4) — это согласованное решение
> (см. `../3-design-brief/design-brief.md` → таблица экранов, `BS-004-rate-instructor.md`).

## Соответствие карты Bottom Sheet свойствам (общее для всех BS-*)

Единые правила модалок из `../3-design-brief/00-foundations.md §4.3` — не повторяются построчно
в каждом документе, только различия (см. секцию «Свойства Bottom Sheet» в каждом файле).
