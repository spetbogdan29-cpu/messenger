# Android APK

Этот проект уже является PWA и готов к упаковке в Android через Trusted Web Activity (TWA).

## Быстрый способ

1. Установить Node.js.
2. Установить Bubblewrap:
   `npm i -g @bubblewrap/cli`
3. Инициализировать проект из веб-манифеста:
   `bubblewrap init --manifest https://messenger-9ki2.onrender.com/manifest.json`
4. В мастере указать package id, например `com.bogdan.messenger`.
5. Собрать:
   `bubblewrap build`
6. Результат — подписанный APK, который можно установить на Android.

Для полноэкранного TWA сайт и Android-приложение должны подтвердить владение одним доменом через Digital Asset Links. После получения отпечатка сертификата APK файл нужно разместить на:
`https://messenger-9ki2.onrender.com/.well-known/assetlinks.json`

Сайт остаётся источником интерфейса и данных, поэтому обновления фронтенда можно выпускать через Render без пересборки APK.

## Важно

Не хранить signing key или пароли Render/Neon в GitHub.
