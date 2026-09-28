# Messenger 3.3

Веб-мессенджер на Node.js + Express + WebSocket + PostgreSQL.

## Что уже есть

- регистрация и вход
- личные сообщения и группы
- WebSocket в реальном времени
- оптимистическая отправка и офлайн-очередь
- редактирование и удаление
- удаление сообщения только у себя
- ответы на сообщения
- реакции ❤️ 👍 😂 😮 😢 🔥
- избранные сообщения ⭐
- закрепление сообщений 📌
- прочитано ✓ / ✓✓
- онлайн и время последнего посещения
- профили, аватары и описание
- вложения и голосовые сообщения
- браузерные и Web Push-уведомления
- настройки уведомлений
- PWA/установка на Android
- базовые меры защиты: JWT, bcrypt, Helmet, rate limit, авторизация WebSocket

## Render

- Build: `npm install`
- Start: `npm start`
- Environment: `DATABASE_URL`, `JWT_SECRET`
- Для Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

Render автоматически запускает новый deploy после push в связанную ветку, если Auto-Deploy включён.

## Хранение

Текущая рабочая версия использует PostgreSQL через `app_state` с JSONB. Это безопаснее временной файловой базы Render, но при большом количестве пользователей следующий этап — нормализация в отдельные таблицы users/messages/groups/group_members/push_subscriptions.

## Android

См. [android/README.md](android/README.md) для упаковки PWA в APK через Trusted Web Activity/Bubblewrap.

## Локальный запуск

```bash
npm install
JWT_SECRET='local-secret' DATABASE_URL='postgresql://...' npm start
```
