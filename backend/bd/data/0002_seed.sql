-- ============================================================================
-- 0002_seed.sql — тестовые данные-заглушки (dev/staging, не для прод-релиза)
-- Ревизия 2 — обновлено под 0001_init.sql ревизии 2 (снапшоты слота, instructor_id,
-- триггер целостности ratings). Один slot_id → один и тот же instructor_id везде,
-- как в реальном домене (каждую тренировку ведёт один инструктор).
-- ============================================================================
-- Диапазоны id/телефонов — см. комментарий в предыдущей версии файла:
--   client id:        11111111-1111-1111-1111-1111111111XX
--   booking id:       22222222-2222-2222-2222-2222222222XX
--   rating id:        33333333-3333-3333-3333-3333333333XX
--   push sub id:      44444444-4444-4444-4444-4444444444XX
--   notification id:  55555555-5555-5555-5555-5555555555XX
--   внешний slot_id:       aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaXX
--   внешний instructor_id: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbXX
--   idempotency_key:       cccccccc-cccc-cccc-cccc-ccccccccccXX
--   телефоны: +7 999 000-00-0X (тестовый диапазон)
--
-- Карта "слот → инструктор" (согласованность: один слот = один инструктор):
--   aaaa...01 → bbbb...01   (используется в b1, b2)
--   aaaa...02 → bbbb...02   (используется в b3, b4)
--   aaaa...03 → bbbb...01   (используется в b6, b7 — завершённые, есть оценки)
--   aaaa...04 → bbbb...02   (используется в b5 — отменена скалодромом)
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------------
-- CLIENTS
-- ------------------------------------------------------------------
INSERT INTO clients (id, phone, name, telegram_id, is_beginner) VALUES
('11111111-1111-1111-1111-111111111101', '+79990000001', 'Тестовый Клиент 1', 'seed_tg_00001', TRUE),
('11111111-1111-1111-1111-111111111102', '+79990000002', 'Тестовый Клиент 2', NULL,             FALSE),
('11111111-1111-1111-1111-111111111103', '+79990000003', 'Тестовый Клиент 3', 'seed_tg_00003', FALSE),
('11111111-1111-1111-1111-111111111104', '+79990000004', 'Тестовый Клиент 4', NULL,             TRUE),
('11111111-1111-1111-1111-111111111105', '+79990000005', 'Тестовый Клиент 5', NULL,             FALSE);

-- ------------------------------------------------------------------
-- BOOKINGS
-- ------------------------------------------------------------------
INSERT INTO bookings
    (id, client_id, slot_id, instructor_id, equipment_choice, status, cancel_reason,
     idempotency_key, idempotency_body_hash, created_at, cancelled_at,
     slot_start_at_snapshot, zone_format_snapshot, duration_min_snapshot)
VALUES
-- активная бронь, своё снаряжение, слот в будущем
('22222222-2222-2222-2222-222222222201',
 '11111111-1111-1111-1111-111111111101',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
 'own', 'active', NULL,
 'cccccccc-cccc-cccc-cccc-cccccccccc01', rpad('seedhash01', 64, '0'),
 now() - interval '1 hour', NULL,
 now() + interval '2 days', 'boulder_beginner', 90),

-- активная бронь, прокат, тот же слот, другой клиент
('22222222-2222-2222-2222-222222222202',
 '11111111-1111-1111-1111-111111111102',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
 'rental', 'active', NULL,
 'cccccccc-cccc-cccc-cccc-cccccccccc02', rpad('seedhash02', 64, '0'),
 now() - interval '50 minutes', NULL,
 now() + interval '2 days', 'boulder_beginner', 90),

-- ранняя отмена (место освобождено)
('22222222-2222-2222-2222-222222222203',
 '11111111-1111-1111-1111-111111111101',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
 'own', 'cancelled_early', NULL,
 'cccccccc-cccc-cccc-cccc-cccccccccc03', rpad('seedhash03', 64, '0'),
 now() - interval '2 days', now() - interval '1 day',
 now() - interval '12 hours', 'rope_advanced', 90),

-- поздняя отмена (место не освобождено)
('22222222-2222-2222-2222-222222222204',
 '11111111-1111-1111-1111-111111111103',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
 'rental', 'cancelled_late', NULL,
 'cccccccc-cccc-cccc-cccc-cccccccccc04', rpad('seedhash04', 64, '0'),
 now() - interval '2 days', now() - interval '2 hours',
 now() - interval '12 hours', 'rope_advanced', 90),

-- отменена скалодромом (профилактика)
('22222222-2222-2222-2222-222222222205',
 '11111111-1111-1111-1111-111111111104',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
 'own', 'cancelled_by_gym', 'Профилактика зоны и снаряжения',
 'cccccccc-cccc-cccc-cccc-cccccccccc05', rpad('seedhash05', 64, '0'),
 now() - interval '3 days', now() - interval '1 day',
 now() + interval '1 day', 'rope_advanced', 90),

-- завершённые тренировки (для оценок), один слот, один инструктор
('22222222-2222-2222-2222-222222222206',
 '11111111-1111-1111-1111-111111111105',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
 'own', 'completed', NULL,
 'cccccccc-cccc-cccc-cccc-cccccccccc06', rpad('seedhash06', 64, '0'),
 now() - interval '5 days', NULL,
 now() - interval '4 days', 'boulder_beginner', 90),

('22222222-2222-2222-2222-222222222207',
 '11111111-1111-1111-1111-111111111102',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
 'rental', 'completed', NULL,
 'cccccccc-cccc-cccc-cccc-cccccccccc07', rpad('seedhash07', 64, '0'),
 now() - interval '5 days', NULL,
 now() - interval '4 days', 'boulder_beginner', 90);

-- ------------------------------------------------------------------
-- RATINGS (по одной на завершённую бронь; client_id/instructor_id совпадают
-- с соответствующей записью в bookings — иначе сработает trg_ratings_validate_before_insert)
-- ------------------------------------------------------------------
INSERT INTO ratings (id, booking_id, client_id, instructor_id, stars, comment) VALUES
('33333333-3333-3333-3333-333333333301',
 '22222222-2222-2222-2222-222222222206',
 '11111111-1111-1111-1111-111111111105',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
 5, 'Отличный инструктор, всё понятно объяснил'),

('33333333-3333-3333-3333-333333333302',
 '22222222-2222-2222-2222-222222222207',
 '11111111-1111-1111-1111-111111111102',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
 4, NULL);

-- ------------------------------------------------------------------
-- WEB PUSH SUBSCRIPTIONS
-- ------------------------------------------------------------------
INSERT INTO web_push_subscriptions (id, client_id, endpoint, p256dh, auth, revoked_at) VALUES
('44444444-4444-4444-4444-444444444401',
 '11111111-1111-1111-1111-111111111101',
 'https://fcm.googleapis.com/fcm/send/seed-endpoint-active-01',
 'seed-p256dh-key-01', 'seed-auth-secret-01', NULL),

('44444444-4444-4444-4444-444444444402',
 '11111111-1111-1111-1111-111111111102',
 'https://fcm.googleapis.com/fcm/send/seed-endpoint-revoked-02',
 'seed-p256dh-key-02', 'seed-auth-secret-02', now() - interval '10 days');

-- ------------------------------------------------------------------
-- NOTIFICATIONS LOG
-- ------------------------------------------------------------------
INSERT INTO notifications_log (id, client_id, booking_id, type, channel, status, sent_at) VALUES
('55555555-5555-5555-5555-555555555501',
 '11111111-1111-1111-1111-111111111101',
 '22222222-2222-2222-2222-222222222201',
 'reminder_24h', 'telegram', 'sent', now() - interval '23 hours'),

('55555555-5555-5555-5555-555555555502',
 '11111111-1111-1111-1111-111111111101',
 '22222222-2222-2222-2222-222222222201',
 'reminder_3h', 'web_push', 'sent', now() - interval '2 hours'),

('55555555-5555-5555-5555-555555555503',
 '11111111-1111-1111-1111-111111111104',
 '22222222-2222-2222-2222-222222222205',
 'slot_cancelled_by_gym', 'telegram', 'sent', now() - interval '3 days'),

('55555555-5555-5555-5555-555555555504',
 '11111111-1111-1111-1111-111111111102',
 '22222222-2222-2222-2222-222222222202',
 'rental_payment_offline', 'web_push', 'failed', now() - interval '50 minutes');

COMMIT;
