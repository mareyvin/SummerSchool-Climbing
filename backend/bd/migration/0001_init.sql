-- ============================================================================
-- 0001_init.sql — инициализация БД BFF-сервиса клиентского приложения «Вертикаль»
-- Ревизия 2 — после разрешения противоречий из domain-entities-vs-db-review.md
-- (см. changelog в конце файла)
-- ============================================================================
-- Скоуп БД: только то, чем управляет клиентское приложение и его API
-- (business-requirements.md → BR-9; domain-description.md → «Контекст и границы скоупа»).
--
-- Slot, Route/Zone — read-only ресурсы ЧУЖОГО bounded context (существующий бэкенд, R-004).
-- Instructor — ЧУЖОЙ справочник по своей природе (ведёт тренировки во внешней системе), но
-- его id и часть параметров слота на момент брони теперь СНАПШОТЯТСЯ локально в bookings —
-- решение принято, чтобы не зависеть от архивной политики внешней системы и обеспечить
-- целостность оценок инструктора (см. находку №1 в ревью и её разрешение).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ============================================================================
-- CLIENTS  (domain-description.md §3.1, FR-1, FR-2, FR-33)
-- ============================================================================
CREATE TABLE clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           VARCHAR(20)  NOT NULL,                    -- логин, E.164 (FR-1)
    name            VARCHAR(255) NOT NULL,                    -- FR-33
    telegram_id     VARCHAR(64)  NULL,                        -- FR-2, NFR-26
    is_beginner     BOOLEAN      NOT NULL DEFAULT FALSE,       -- см. комментарий к колонке ниже
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_clients_phone    UNIQUE (phone),
    CONSTRAINT uq_clients_telegram UNIQUE (telegram_id)
);

COMMENT ON COLUMN clients.is_beginner IS
  'Локальный кэш флага "новичок" из внешнего профиля (FR-16). '
  'Политика актуализации (решение зафиксировано в domain-entities-vs-db-review.md, находка №3): '
  'обновляется РОВНО в момент успешного входа клиента (SMS OTP или Telegram login), одним '
  'запросом к внешнему профилю. Никаких вебхуков/TTL/фоновых обновлений в MVP нет — намеренно, '
  'чтобы не усложнять реализацию. Между входами значение может быть устаревшим — принятый риск.';

-- ============================================================================
-- BOOKINGS  (domain-description.md §3.4, FR-15..30, UC-1, UC-2)
-- ============================================================================
CREATE TABLE bookings (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id              UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    slot_id                UUID NOT NULL,                      -- внешняя ссылка (чужой bounded context), без FK
    instructor_id          UUID NOT NULL,                      -- обычная колонка (не только снапшот) — см. находку №1
    equipment_choice       VARCHAR(10)  NOT NULL,               -- FR-18: 'own' | 'rental', на уровне брони
    status                 VARCHAR(20)  NOT NULL DEFAULT 'active',
    cancel_reason          TEXT NULL,                           -- только для status = 'cancelled_by_gym' (FR-29)
    idempotency_key        UUID NOT NULL,
    idempotency_body_hash  CHAR(64) NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at           TIMESTAMPTZ NULL,

    -- Снапшот параметров слота на момент создания брони (решение по находке №1):
    -- защищает "Мои бронирования" (FR-25) и оценку инструктора (FR-40) от того, что
    -- внешняя система может не хранить историю слотов вечно.
    slot_start_at_snapshot    TIMESTAMPTZ NOT NULL,
    zone_format_snapshot      TEXT        NOT NULL,             -- напр. 'boulder_beginner' / 'rope_advanced'
    duration_min_snapshot     SMALLINT    NOT NULL DEFAULT 90,  -- ~1.5ч по domain-description §3.2; нужно фоновому job (см. ниже)

    CONSTRAINT chk_bookings_equipment CHECK (equipment_choice IN ('own', 'rental')),

    CONSTRAINT chk_bookings_status CHECK (
        status IN ('active', 'cancelled_early', 'cancelled_late', 'cancelled_by_gym', 'completed')
    ),

    CONSTRAINT chk_bookings_cancel_reason CHECK (
        (status = 'cancelled_by_gym' AND cancel_reason IS NOT NULL)
        OR (status <> 'cancelled_by_gym')
    ),

    CONSTRAINT chk_bookings_cancelled_at CHECK (
        (status IN ('cancelled_early', 'cancelled_late', 'cancelled_by_gym') AND cancelled_at IS NOT NULL)
        OR (status IN ('active', 'completed') AND cancelled_at IS NULL)
    ),

    CONSTRAINT chk_bookings_duration_positive CHECK (duration_min_snapshot > 0),

    CONSTRAINT uq_bookings_client_idempotency UNIQUE (client_id, idempotency_key)
);

COMMENT ON COLUMN bookings.duration_min_snapshot IS
  'Добавлено сверх исходного списка снапшот-полей: без длительности фоновый переход '
  'active → completed (см. описание ниже) не может определить момент окончания тренировки '
  '(start_at + duration). Дефолт 90 мин по domain-description §3.2; реальное значение должно '
  'приходить из ответа внешнего API на момент createBooking.';

CREATE UNIQUE INDEX uq_bookings_active_client_slot
    ON bookings (client_id, slot_id)
    WHERE status = 'active';

CREATE INDEX ix_bookings_client_id     ON bookings (client_id);
CREATE INDEX ix_bookings_slot_id       ON bookings (slot_id);
CREATE INDEX ix_bookings_instructor_id ON bookings (instructor_id);
CREATE INDEX ix_bookings_status        ON bookings (status);

-- Индекс под фоновый процесс из решения по находке №5: раз в 15 минут выбирает активные
-- брони, у которых тренировка уже закончилась, и переводит их в 'completed'.
CREATE INDEX ix_bookings_active_for_completion
    ON bookings (slot_start_at_snapshot)
    WHERE status = 'active';

CREATE OR REPLACE FUNCTION fn_bookings_prevent_terminal_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IN ('cancelled_early', 'cancelled_late', 'cancelled_by_gym') THEN
        RAISE EXCEPTION 'booking % is in terminal status % and cannot be modified', OLD.id, OLD.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_prevent_terminal_update
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION fn_bookings_prevent_terminal_update();

-- ============================================================================
-- RATINGS  (FR-40, FR-41, UC-4) — решено: остаются в MVP (находка №2, п.1 ответов)
-- avg_rating НЕ хранится и не обсчитывается в БД — по решению агрегация происходит
-- на фронтенде поверх сырых записей ratings (п.2–3 ответов). Синхронизация с внешним
-- бэкендом не реализуется — рейтинг в карточке слота из внешнего Slot и наш локальный
-- рейтинг могут не совпадать, это принятый для MVP компромисс, а не баг схемы.
-- ============================================================================
CREATE TABLE ratings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    client_id      UUID NOT NULL,        -- намеренная денормализация (см. комментарий ниже)
    instructor_id  UUID NOT NULL,
    stars          SMALLINT NOT NULL,
    comment        TEXT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_ratings_stars  CHECK (stars BETWEEN 1 AND 5),
    CONSTRAINT uq_ratings_booking UNIQUE (booking_id)
);

COMMENT ON COLUMN ratings.client_id IS
  'Осознанная денормализация (technically derivable через ratings.booking_id → bookings.client_id). '
  'Подтверждено решением по находке №4: оставляем для упрощения запроса "мои оценки" без джойна. '
  'Безопасно, т.к. ratings неизменяемы после создания и значение проверяется триггером при INSERT.';

CREATE INDEX ix_ratings_instructor_id ON ratings (instructor_id);

-- Целостность оценки (закрывает находку №1 в части ratings): нельзя поставить оценку
-- - на бронь, которая ещё не в статусе 'completed' (UC-4, предусловие + E1);
-- - от имени клиента, который не является автором брони;
-- - инструктору, который не вёл именно эту тренировку (bookings.instructor_id).
CREATE OR REPLACE FUNCTION fn_ratings_validate_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_client_id     UUID;
    v_instructor_id UUID;
    v_status        VARCHAR(20);
BEGIN
    SELECT client_id, instructor_id, status
      INTO v_client_id, v_instructor_id, v_status
      FROM bookings
     WHERE id = NEW.booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking % not found', NEW.booking_id;
    END IF;

    IF v_status <> 'completed' THEN
        RAISE EXCEPTION 'rating rejected: booking % is not completed yet (status=%)', NEW.booking_id, v_status;
    END IF;

    IF NEW.client_id <> v_client_id THEN
        RAISE EXCEPTION 'rating rejected: client_id % does not match booking owner % for booking %',
            NEW.client_id, v_client_id, NEW.booking_id;
    END IF;

    IF NEW.instructor_id <> v_instructor_id THEN
        RAISE EXCEPTION 'rating rejected: instructor_id % does not match booking.instructor_id % for booking %',
            NEW.instructor_id, v_instructor_id, NEW.booking_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ratings_validate_before_insert
    BEFORE INSERT ON ratings
    FOR EACH ROW
    EXECUTE FUNCTION fn_ratings_validate_before_insert();

-- FR-40: изменение отправленной оценки не поддерживается.
CREATE OR REPLACE FUNCTION fn_ratings_prevent_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ratings are immutable after creation (FR-40)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ratings_prevent_update
    BEFORE UPDATE ON ratings
    FOR EACH ROW
    EXECUTE FUNCTION fn_ratings_prevent_update();

-- ============================================================================
-- WEB PUSH SUBSCRIPTIONS  (FR-48, NFR-17) — без изменений
-- ============================================================================
CREATE TABLE web_push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ NULL,

    CONSTRAINT uq_push_client_endpoint UNIQUE (client_id, endpoint)
);

CREATE INDEX ix_push_client_active
    ON web_push_subscriptions (client_id)
    WHERE revoked_at IS NULL;

-- ============================================================================
-- NOTIFICATIONS LOG  (FR-45, FR-46, FR-47, NFR-17, NFR-26) — без изменений
-- ============================================================================
CREATE TABLE notifications_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    booking_id  UUID NULL REFERENCES bookings(id) ON DELETE SET NULL,
    type        VARCHAR(30) NOT NULL,
    channel     VARCHAR(20) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'sent',
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_notif_type CHECK (
        type IN ('reminder_24h', 'reminder_3h', 'slot_cancelled_by_gym', 'rental_payment_offline')
    ),
    CONSTRAINT chk_notif_channel CHECK (channel IN ('web_push', 'telegram')),
    CONSTRAINT chk_notif_status  CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX ix_notif_client_id  ON notifications_log (client_id);
CREATE INDEX ix_notif_booking_id ON notifications_log (booking_id);

-- ============================================================================
-- Служебное: авто-обновление updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_touch_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================================
-- Retention / анонимизация (NFR-20, п.4) — РЕШЕНО: вне скоупа MVP (находка №6, п.11-12 ответов)
-- ============================================================================
-- Явно зафиксировано: анонимизация клиентских данных и старых броней старше 12 месяцев
-- НЕ реализуется в этой миграции и в MVP в целом. Перенесено в Phase 2 вместе с остальным
-- 152-ФЗ комплаенсом (см. non-functional-requirements.md → NFR-20). clients.id остаётся
-- NOT NULL / RESTRICT в bookings — механизм тумбстоуна/анонимизации будет спроектирован
-- отдельно, когда feature попадёт в разработку.

-- ============================================================================
-- Намеренно ОТСУТСТВУЕТ в этой миграции:
--   - таблицы Slot/Route/Zone/Instructor как отдельные сущности — чужой bounded context (R-004);
--     инструктор представлен только opaque-ссылкой instructor_id (в bookings и ratings);
--   - avg_rating для инструктора — не хранится, считается на фронтенде из сырых ratings (см. выше);
--   - счётчики свободных мест/проката — источник истины не здесь (NFR-8/9);
--   - price/price_total — цена тренировки не описана в ТЗ (design-review.md, находка №7);
--   - refresh_tokens/otp — вынесены в Redis (tech-stack.md §3.4), не в Postgres;
--   - payment_status — не зафиксировано ни в одном FR, осталось предположением;
--   - anonymized_at/deleted_at у clients — сознательно отложено на Phase 2 (см. выше).
-- ============================================================================

-- ============================================================================
-- CHANGELOG (ревизия 2, относительно первой версии миграции)
-- ============================================================================
-- 1. bookings: добавлены instructor_id, slot_start_at_snapshot, zone_format_snapshot,
--    duration_min_snapshot + индексы под них — решение по находке №1.
-- 2. ratings: добавлен триггер trg_ratings_validate_before_insert — проверяет booking.status
--    = 'completed' и совпадение client_id/instructor_id с bookings — решение по находке №1/№2.
-- 3. ratings.client_id — явно закомментирован как намеренная денормализация — находка №4.
-- 4. is_beginner — комментарий колонки уточнён политикой "обновление только при логине" — находка №3.
-- 5. Retention/анонимизация — явно задокументирована как отложенная на Phase 2, без изменений
--    в структуре clients/bookings — находка №6.
-- 6. avg_rating — подтверждено, что не хранится в БД, считается на фронтенде — находка №2.
-- ============================================================================
