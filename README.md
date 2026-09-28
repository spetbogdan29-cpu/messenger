# Mini Messenger — Render

Готовая версия для публикации на Render.

## Render
- Build Command: `npm install`
- Start Command: `npm start`
- Plan: Free для тестирования
- Добавь Environment Variable: `JWT_SECRET` = длинная случайная строка

Приложение использует WebSocket для сообщений в реальном времени. Render поддерживает WebSocket.

### Важно про хранение данных
Сейчас пользователи и сообщения хранятся в `data/db.json`. На бесплатном Render файловая система временная: данные могут исчезнуть после перезапуска/деплоя. Для постоянного хранения позже подключим PostgreSQL.

## Локальный запуск
```bash
npm install
npm start
```
