# Вертикаль — BFF (backend for frontend)

Каркас серверной части клиентского приложения скалодрома «Вертикаль».
Стек — как зафиксировано в `tech-stack.md`: Fastify + TypeScript, Prisma + PostgreSQL,
Redis + BullMQ (очередь напоминаний), JWT (access в памяти клиента / refresh — в httpOnly-cookie).

Это **каркас**, а не готовый продакшн-код: почти каждый файл в `src/modules/*` содержит
`// TODO` в местах, где нужна доработка под конкретный контракт внешнего бэкенда скалодрома
(слоты, инструкторы) — см. комментарии в коде и трассировку на FR-*/UC-* в спецификации.

---

## 1. Что где лежит (аналогия: дом с комнатами)

Если думать о приложении как о доме:

- `docker-compose.yml` — это "коммунальные службы дома": свет (Redis) и водопровод (Postgres).
  Их поднимает Docker, самому ничего устанавливать не нужно.
- `prisma/schema.prisma` — чертёж комнат в базе данных: какие столы (таблицы) есть и что на
  них лежит.
- `src/plugins/*` — розетки и краны, к которым подключается всё остальное (подключение к базе,
  к Redis, проверка JWT-токена).
- `src/modules/*` — сами "комнаты": auth (прихожая — вход), slots (витрина расписания),
  bookings (стол записей), ratings (книга отзывов), profile (личный кабинет), notifications
  (почтовый ящик).
- `src/queues/*` — будильник, который сам напомнит клиенту о тренировке за 24ч и 3ч.

---

## 2. Установка Docker (если ещё не установлен)

1. Скачайте **Docker Desktop**: https://www.docker.com/products/docker-desktop/
   (Windows/Mac) или установите Docker Engine + Docker Compose plugin на Linux.
2. Запустите Docker Desktop и дождитесь, пока иконка кита в трее станет "спокойной"
   (не мигает) — это значит, что Docker-движок поднялся.
3. Проверьте в терминале:
   ```bash
   docker --version
   docker compose version
   ```
   Если обе команды печатают версию — всё готово.

---

## 3. Поднимаем Postgres и Redis в Docker

Аналогия: `docker-compose.yml` — это как список "какую бытовую технику включить и в каком
порядке". Команда `docker compose up` просто читает этот список и включает всё сама.

1. Перейдите в папку проекта:
   ```bash
   cd vertical-backend
   ```
2. Скопируйте пример переменных окружения:
   ```bash
   cp .env.example .env
   ```
   Открывать `.env` пока не обязательно — значения по умолчанию совпадают с `docker-compose.yml`.
3. Поднимите Postgres, Redis и Adminer (веб-просмотрщик базы):
   ```bash
   docker compose up -d
   ```
   Флаг `-d` — "detached", то есть контейнеры работают в фоне и не занимают терминал.
4. Проверьте, что контейнеры реально поднялись и "здоровы":
   ```bash
   docker compose ps
   ```
   У `vertical-postgres` и `vertical-redis` в колонке STATUS должно появиться `healthy`
   (может занять 5-10 секунд после старта — health-check пробует достучаться до сервисов).
5. (Опционально) Откройте Adminer в браузере — это простой веб-интерфейс для просмотра
   таблиц базы, как Excel для Postgres: http://localhost:8080
   - Система: `PostgreSQL`
   - Сервер: `postgres`
   - Пользователь: `vertical`
   - Пароль: `vertical_local_pass`
   - База данных: `vertical`

### Полезные команды docker compose

| Команда | Что делает |
|---|---|
| `docker compose up -d` | Поднять все сервисы в фоне |
| `docker compose ps` | Посмотреть статус контейнеров |
| `docker compose logs -f postgres` | Смотреть логи Postgres в реальном времени |
| `docker compose stop` | Остановить контейнеры (данные в volume сохраняются) |
| `docker compose down` | Остановить и удалить контейнеры (данные в volume НЕ удаляются) |
| `docker compose down -v` | Остановить, удалить контейнеры **и очистить данные** (полный сброс базы) |

---

## 4. Поднимаем API локально (рекомендуемый способ для разработки)

Локальный запуск (не в Docker) даёт быстрый hot-reload и удобную отладку в IDE.

1. Установите зависимости:
   ```bash
   npm install
   ```
2. Сгенерируйте Prisma Client (нужен всегда после изменения `schema.prisma`):
   ```bash
   npm run prisma:generate
   ```
3. Примените миграции к базе в Docker (создаст таблицы по схеме `schema.prisma`):
   ```bash
   npm run prisma:migrate
   ```
   Prisma спросит имя миграции — например, `init`.
   > Если у вас уже есть готовая ручная миграция `0001_init.sql` — примените её напрямую через
   > `psql`/Adminer, а `prisma db pull` используйте, чтобы синхронизировать `schema.prisma`
   > с реальной структурой базы, вместо `prisma migrate dev`.
4. Запустите API в режиме разработки (перезапускается при каждом изменении файла):
   ```bash
   npm run dev
   ```
5. Проверьте, что сервер жив:
   ```bash
   curl http://localhost:3000/health
   ```
   Должно вернуться `{"status":"ok"}`.

### Воркер напоминаний (отдельный процесс)

Напоминания за 24ч/3ч (FR-45) обрабатываются отдельным воркером BullMQ, не самим API:

```bash
npm run worker:reminders
```

Держите его запущенным вторым терминалом рядом с `npm run dev`.

---

## 5. Альтернатива: поднять и API тоже в Docker

Если хотите вообще ничего не ставить локально (ни Node.js, ни npm) — API тоже можно
завернуть в контейнер. Для этого в `docker-compose.yml` сервис `api` спрятан за
профилем `full`:

```bash
docker compose --profile full up -d --build
```

Это соберёт образ по `Dockerfile` и поднимет API вместе с Postgres/Redis в одной сети —
внутри неё Postgres и Redis видны по именам `postgres`/`redis`, а не `localhost`
(это уже учтено в переменных окружения сервиса `api` внутри `docker-compose.yml`).

Минус этого способа — нет hot-reload: после изменения кода нужно пересобирать образ
(`docker compose --profile full up -d --build`). Поэтому для активной разработки
удобнее вариант из раздела 4.

---

## 6. Структура проекта

```
vertical-backend/
├── docker-compose.yml       # Postgres + Redis + Adminer (+ опционально API)
├── Dockerfile                # Сборка API в контейнер (нужен только для варианта из §5)
├── .env.example               # Шаблон переменных окружения
├── prisma/
│   └── schema.prisma          # Модель БД: clients, bookings, ratings,
│                               # web_push_subscriptions, notifications_log
└── src/
    ├── server.ts               # Точка входа
    ├── app.ts                  # Сборка Fastify-приложения и регистрация роутов
    ├── config/env.ts           # Чтение и валидация переменных окружения
    ├── plugins/
    │   ├── prisma.ts            # Подключение Prisma к Fastify
    │   ├── redis-client.ts      # Подключение Redis к Fastify
    │   └── jwt.ts                # Проверка access-токена (NFR-18)
    ├── lib/
    │   ├── errors.ts             # Единый формат ошибок API (ApiError)
    │   └── idempotency.ts        # Проверка Idempotency-Key (LOGIC-001)
    ├── modules/
    │   ├── auth/                 # FR-1, FR-2 — вход по SMS OTP / Telegram
    │   ├── slots/                 # FR-9…FR-11 — прокси к внешнему бэкенду
    │   ├── bookings/               # FR-15…FR-28, UC-1, UC-2 — брони и отмены
    │   ├── ratings/                 # FR-40, FR-41, UC-4 — оценка инструктора
    │   ├── profile/                  # FR-33, FR-34 — профиль клиента
    │   └── notifications/             # FR-48 — Web Push подписки
    └── queues/
        ├── reminder.queue.ts          # Постановка задач-напоминаний в очередь
        └── reminder.worker.ts          # Обработчик очереди (отдельный процесс)
```

---

## 7. Известные открытые вопросы (перенесены из ревью аналитики)

Эти TODO прямо в коде — не забытые мелочи, а те самые открытые вопросы, которые уже
зафиксированы в `domain-entities-vs-db-review.md`:

- **avg_rating инструктора** — считается по `Rating` в БД BFF, но должен отображаться
  в карточке слота, которую отдаёт внешний бэкенд. См. TODO в `slots.service.ts`.
- **is_beginner** — кэшируется в `Client.isBeginner`, инвалидация кэша не описана.
- **slot.start_at недоступен напрямую в Booking** — влияет на `listBookings` (деление
  на upcoming/past) и на проверку "тренировка завершена" перед оценкой. См. TODO
  в `bookings.service.ts` и `ratings.routes.ts`. Тот же вопрос упомянут в памяти проекта
  как "риск для исторического отображения и целостности оценок".
