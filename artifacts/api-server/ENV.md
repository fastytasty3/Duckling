# Конфигурация окружений

Все секреты хранятся в **Replit Secrets** — не в файлах. Этот файл — только документация.

## Переменные окружения

| Переменная | development | test | production |
|---|---|---|---|
| `NODE_ENV` | `development` | `test` | `production` |
| `DATABASE_URL` | Replit dev DB (авто) | Тестовая БД | Replit prod DB (авто) |
| `SESSION_SECRET` | Replit Secrets | Статичный (в тесте) | Replit Secrets |
| `PORT` | Replit (авто) | Replit (авто) | Replit (авто) |
| `ALLOWED_ORIGINS` | не задан | не задан | Опционально: `https://yourdomain.com` |

## Различия между окружениями

### development
- Rate limit: 200/15 мин (глобально), 20/15 мин (/auth)
- Cookie `Secure`: **выключен** (HTTP-разработка)
- HSTS: **выключен**
- Stack traces в логах: да (только сервер, не клиент)

### test (`NODE_ENV=test`)
- Rate limit: 100 000/15 мин — заголовки присутствуют, лимит не достигается
- Cookie `Secure`: **выключен**
- Запускается через `pnpm test` в `artifacts/api-server`

### production
- Rate limit: 200/15 мин (глобально), 20/15 мин (/auth)
- Cookie `Secure`: **включён**
- HSTS: **включён** (max-age=15552000)
- Ошибки: только generic JSON, без деталей

## Как задать переменные в Replit

1. Открыть вкладку **Secrets** в боковой панели
2. Добавить `SESSION_SECRET` — случайная строка ≥32 символа
3. `NODE_ENV=production` уже задан для production-окружения
4. `DATABASE_URL` задаётся автоматически при подключении PostgreSQL через Replit

## Локальная разработка вне Replit

Создать файл `.env` (в `.gitignore`) со значениями из таблицы выше.  
Никогда не коммитить реальные секреты в репозиторий.
