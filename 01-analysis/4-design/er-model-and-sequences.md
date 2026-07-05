# Этап 4. Дизайн: ER-модель и sequence-диаграмма createBooking

> Скоуп — клиентское веб-приложение (React + Tailwind CSS) и его API. Источники: domain-description.md,
> functional-requirements.md, business-requirements.md, use-cases.md (UC-1), non-functional-requirements.md (NFR-8, NFR-9, NFR-24).

## 1. ER-модель

```mermaid
erDiagram
    CLIENT ||--o{ BOOKING : "делает"
    CLIENT ||--o{ RATING : "оставляет"
    CLIENT ||--o{ NOTIFICATION : "получает"
    SLOT   ||--o{ BOOKING : "принимает"
    SLOT   }o--|| INSTRUCTOR : "ведёт"
    SLOT   ||--|| RENTAL_FUND : "имеет"
    BOOKING ||--o| RATING : "порождает (после посещения)"
    INSTRUCTOR ||--o{ RATING : "получает"

    CLIENT {
        uuid id PK
        string phone
        string name
        bool is_beginner "read-only, из бэкенда/профиля"
        string telegram_id "nullable"
    }

    SLOT {
        uuid id PK
        datetime start_at "UTC"
        int duration_min
        string zone_format "boulder_beginner / rope_advanced"
        bool is_beginner_only
        uuid instructor_id FK
        int capacity_total "16 / 8 для новичковой"
        int seats_available
        string status "active / cancelled_by_gym / finished"
        string cancel_reason "nullable"
    }

    INSTRUCTOR {
        uuid id PK
        string name
        float avg_rating "nullable = «Нет оценок»"
    }

    RENTAL_FUND {
        uuid slot_id FK
        int items_total
        int items_available
        decimal tariff
    }

    BOOKING {
        uuid id PK
        uuid client_id FK
        uuid slot_id FK
        string equipment_choice "own / rental"
        string status "active / cancelled_by_client_early / cancelled_by_client_late / cancelled_by_gym / completed"
        datetime created_at
        datetime cancelled_at "nullable"
        string idempotency_key
    }

    RATING {
        uuid id PK
        uuid booking_id FK
        uuid instructor_id FK
        int stars "1..5"
        string comment
        datetime created_at
        bool is_editable "всегда false после создания"
    }

    NOTIFICATION {
        uuid id PK
        uuid client_id FK
        uuid booking_id FK "nullable"
        string type "reminder_1d / reminder_3h / slot_cancelled / rental_payment_offline"
        string channel "web_push / telegram"
        datetime sent_at
    }
```

## 2. Модели сущностей: кто читает, кто пишет

Ключевой архитектурный факт (business-requirements.md → BR-9, domain-description.md → «Контекст и
границы скоупа»): **клиентское приложение не создаёт и не редактирует слоты/зоны/инструкторов** —
это read-only данные существующего бэкенда. Приложение мутирует только то, что относится к
собственным действиям клиента: бронь, оценка, часть профиля, подписка на уведомления.

| Сущность | Доступ клиентского приложения | Кто фактически меняет | Источник |
| :-- | :-- | :-- | :-- |
| **Client** (профиль) | **Частично read-write**: `name`, `phone` — редактируются клиентом (FR-33). `is_beginner`, `id`, статус «постоянный клиент» — **read-only**, приходят из бэкенда/админки, в клиенте не редактируются (BR-6, domain-description.md → «Клиент», BR: «постоянные клиенты вне скоупа») | Флаг «новичок» и лояльность — админка/бэкенд | FR-33, domain 3.1 |
| **Slot** (тренировка) | **Read-only** целиком: приложение только показывает список/карточку, фильтрует; не создаёт и не редактирует (BR-9) | Существующий бэкенд (расписание, зоны, инструкторы) | domain 3.2, FR-9…FR-11 |
| **Instructor** | **Read-only**, включая `avg_rating` — агрегат считает бэкенд, клиент только отображает (FR-41) | Бэкенд (пересчёт агрегата на основе Rating) | domain 3.3, FR-41 |
| **RentalFund** (прокатный фонд слота) | **Read-only на клиенте** — приложение видит `items_available`/`tariff`, но не изменяет напрямую; фонд уменьшается как побочный эффект `createBooking` **на сервере**, а не отдельной операцией клиента (FR-19, FR-20) | Бэкенд, при обработке брони | domain 3.5, FR-18…FR-20 |
| **Booking** (бронь) | **Read-write** — единственная сущность, которую клиент создаёт (`createBooking`) и переводит в отменённое состояние (`cancelBooking`); статус «отменена скалодромом» / «поздняя отмена» выставляет **сервер**, клиент этого не делает | Клиент создаёт/отменяет; сервер — атомарные проверки, отметка поздней отмены, статус «отменена скалодромом» | FR-15…FR-30, UC-1 |
| **Rating** (оценка) | **Write-once**: клиент создаёт ровно один раз на посещённую бронь, редактирование запрещено даже на уровне API (FR-40) | Только клиент, один раз | domain 3.6, FR-40 |
| **Notification** | **Read-only** для клиента (список/факт получения); генерируется и рассылается сервером по триггерам (напоминание, отмена скалодромом) | Бэкенд по расписанию/событиям | domain 3.7, FR-45…FR-48 |
| **WebPushSubscription** (неявная сущность) | **Read-write**: клиент создаёт подписку при выдаче разрешения браузера (FR-48), передаёт токен на бэкенд | Клиент создаёт/отзывает подписку | FR-48 |

Важно: даже там, где клиент формально «пишет» (Booking, Rating), решающая проверка и присвоение
финального статуса — на стороне сервера (domain-description.md → «Ограничения верхнего уровня»:
атомарность — ответственность бэкенда). Клиент только инициирует операцию и корректно
обрабатывает код ответа.

## 3. Sequence-диаграмма: `createBooking` (UC-1)

Ветки 201 / 409 / 410 — как в матрице ошибок UC-1. Дополнительно показаны 403 (`beginner_flag_required`)
и 422 (`slot_started`), т.к. они логически часть той же атомарной проверки на сервере, но раскрыты
компактно, чтобы не размывать три основные ветки.

```mermaid
sequenceDiagram
    actor U as Клиент
    participant FE as Frontend (SPA)
    participant API as Backend API (black box)

    U->>FE: Выбрать слот, снаряжение, подтвердить запись
    FE->>FE: Сгенерировать Idempotency-Key
    FE->>API: POST /bookings {slot_id, equipment_choice, Idempotency-Key}
    activate API

    API->>API: Проверка Idempotency-Key<br/>(тот же ключ + то же тело?)

    alt Ключ уже обработан ранее (то же тело)
        API-->>FE: 201 Created (кэшированный ответ, без дубля брони)
    else Новая операция
        API->>API: Проверка флага "новичок" (если слот новичковый)
        API->>API: Атомарная проверка мест слота (SELECT ... FOR UPDATE)
        API->>API: Проверка статуса слота (не cancelled, не started)
        API->>API: Проверка прокатного фонда (если equipment_choice = rental)

        alt Все проверки пройдены
            API->>API: Создать Booking (status=active)<br/>Уменьшить seats_available (и rental items, если прокат)
            API-->>FE: 201 Created {booking}
            FE-->>U: Подтверждение + тариф (оплата офлайн, FR-21)
        else Мест нет / прокат недоступен / бронь уже есть (гонка запросов, NFR-8)
            API-->>FE: 409 Conflict {code: slot_full | rental_unavailable | double_booking, details}
            FE->>FE: Обновить карточку слота (актуальные seats_available)
            FE-->>U: Показать причину отказа (для rental_unavailable — предложить "своё снаряжение")
        else Слот отменён скалодромом
            API-->>FE: 410 Gone {code: slot_cancelled, slot_id}
            FE->>FE: Скрыть CTA "Записаться" для этого слота
            FE-->>U: Сообщить об отмене тренировки скалодромом
        else Флаг "новичок" не установлен
            API-->>FE: 403 Forbidden {code: beginner_flag_required, slot_id}
            FE-->>U: Сообщить, что тренировка только для новичков
        else Тренировка уже началась/прошла
            API-->>FE: 422 Unprocessable {code: slot_started, slot_id, start_at}
            FE-->>U: Сообщить, что запись недоступна
        end
    end
    deactivate API
```

### Пояснение к веткам

- **201** — единственный успешный исход: бронь создана, счётчики уменьшены атомарно на сервере
  (FR-23, NFR-8), клиенту показан тариф и офлайн-условие оплаты (FR-21). Повтор с тем же
  `Idempotency-Key` тоже возвращает 201 с тем же телом — не создаёт вторую бронь (NFR-9, UC-1 → E5).
- **409** — конфликт состояния, три причины по матрице ошибок UC-1: `slot_full` (места кончились,
  в т.ч. из-за гонки запросов, UC-1 → E4), `rental_unavailable` (прокат кончился — своё снаряжение
  всё ещё доступно, UC-1 → E2), `double_booking` (бронь на этот слот уже есть). Retry без
  изменения запроса не поможет — клиент должен изменить выбор или обновить данные.
- **410** — слот безвозвратно недоступен: отменён скалодромом (FR-29, FR-30). Повторная запись на
  этот слот запрещена, альтернативу система не предлагает — клиент ищет новое время сам.
- 403/422 показаны для полноты картины ошибок той же операции, но не входят в три
  запрошенных основных ветки: `beginner_flag_required` (доступ к новичковому слоту, FR-16) и
  `slot_started` (тренировка уже началась — UC-1 → E6).
