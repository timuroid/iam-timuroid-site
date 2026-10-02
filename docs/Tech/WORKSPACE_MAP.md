# Карта проекта

Единый Git-корень приложения — корень этого репозитория. Origin:
`https://github.com/timuroid/iam-timuroid-site.git`, основная ветка — `main`.

| Путь | Назначение |
|---|---|
| `public/` | Статическая страница, стили, браузерный агент, голос и диктовка |
| `public/media/` | Видео «LLM на практике» и постер; источники в `content/logo-sources.json` |
| `content/` | Тексты сайта, кейсы и данные для знаний агента |
| `server/` | Node.js API, работа с OpenAI и SQLite |
| `server/media.mjs` | Потоковая доставка видео/постера с HEAD и HTTP Range |
| `db/`, `drizzle/` | Схема данных и миграции |
| `deploy/` | Рабочие systemd/Caddy конфигурации и альтернативные Docker/nginx шаблоны |
| `docs/WORKFLOW.md` | Локальная работа и передача изменений через GitHub |

Проект рассчитан на Node.js 24. На VPS работает `timuroid.service`: код в
`/opt/timuroid/current`, SQLite в `/var/lib/timuroid/timuroid.sqlite`, закрытая
конфигурация в `/etc/timuroid.env`. Caddy направляет `iam.timuroid.ru` на
`127.0.0.1:4318`; HTTPS обслуживает Caddy. Docker/nginx здесь не запущены.

Сборка пересоздаёт только производную папку `dist/media` и копирует туда
`public/media`; видео не включается в base64-бандл. Доставка медиа работает
через Node-обёртку, а не через отдельно развёрнутый Worker.

## Разговор на сайте

`public/agent.js` управляет одним сеансом: `closed`, `inline` в hero и `dock`
при чтении сайта. Сворачивание, прокрутка и переход на кейс сохраняют историю
и WebRTC; возврат показывает тот же разговор. Завершение отменяет запросы,
освобождает микрофон и очищает историю. Поколения запросов защищают от старых
success/error. Темы находятся одной текстовой строкой над composer и сменяются
каждые 8 секунд в простое. При уменьшении `visualViewport` клавиатурой composer
и сообщения находятся в цельной области доступной высоты.

Действия агента открывают настоящие разделы/страницы, без копирования карточек
в чат. Подготовка контакта только заполняет редактируемый черновик; отправка
остаётся ручной. Диктовка останавливает голос агента перед захватом микрофона.
Админка и уведомления о заявках не созданы.

Голос начинается без `response.create` и автоматического приветствия. Echo
cancellation и noise suppression включены, AGC выключен. Realtime: `far_field`,
`server_vad` threshold 0.74, silence 950 мс, `interrupt_response:false`.
`MediaStreamTrack.enabled=false` передаёт тишину во время ожидания/воспроизведения;
для перебивания нужен явный control. `response.done` завершает генерацию,
`output_audio_buffer.stopped` — серверный audio buffer. Ответы и playback
отслеживаются по response_id; поздний stopped не включает микрофон нового ответа.
«Перебить»: `response.cancel`, `output_audio_buffer.clear`, затем возврат к
слушанию после cleared, если воспроизведение уже началось. Сервер сам удаляет
непроигранное WebRTC-аудио из контекста. Источники: [client events](https://developers.openai.com/api/reference/resources/realtime/client-events),
[server events](https://developers.openai.com/api/reference/resources/realtime/server-events),
[VAD](https://developers.openai.com/api/docs/guides/realtime-vad).
События сервера не подтверждают физический конец звука в jitter buffer iPhone;
эта граница и порог VAD требуют проверки на устройстве.

`public/haptics.js`: trusted click, дедупликация, 100 мс между попытками,
`navigator.vibrate` и fallback к скрытому checkbox switch через label.click.
Последний — совместимая попытка по запросу пользователя, не гарантия ощущения.
[WebKit patch](https://github.com/WebKit/WebKit/commit/fc1ef83eae10068fe468587d959e868041ddfe03)
вводит требование trusted события для native tick; версия конкретного Safari
с этим изменением не установлена. Фоновых импульсов и видимого переключателя нет.
