# Карта проекта

Единый Git-корень приложения — корень этого репозитория. Origin:
`https://github.com/timuroid/iam-timuroid-site.git`, основная ветка — `main`.

| Путь | Назначение |
|---|---|
| `public/` | Статическая страница, стили, браузерный агент и голос |
| `public/media/` | Видео «LLM на практике» и постер; источники в `content/logo-sources.json` |
| `content/site.json` | Публичные тексты, кейсы и факты |
| `content/agent-knowledge.json` | Расширенный контекст разделов для сервера; не включён в HTML/публичные assets |
| `scripts/check-agent-*` | Изолированные проверки состояний и конфигурации без микрофона/API-ключа |
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

`public/agent.js` разделяет представление (`closed`, `inline`, `overlay`, `dock`)
и режим (`voice`, `text`). Основные входы запускают голос. «Написать» открывает
чат и останавливает WebRTC; история остаётся общей. Закрытие освобождает микрофон,
отменяет запросы и очищает историю. Сворачивание сохраняет соединение и запросы.
Поколения запросов и response_id защищают от поздних ответов.

Большой шар находится в hero, при прокрутке — в dock, при локальном раскрытии —
по центру над той же переносимой панелью в modeless overlay. Разговор раскрывается
без прокрутки страницы или смены URL. Прокрутка overlay больше 64 px сворачивает
его; возвращение hero в viewport восстанавливает inline. В активном разговоре
остальные версии шара скрыты и не участвуют в рендере. Перенос использует один
временный canvas и 620 мс, отмена идемпотентна; reduced motion отключает перелёт.
Сила нажатия имеет мягкое нарастание, затухание и хвост около 2–3 секунд.

Voice скрывает сообщения/composer/темы и показывает статус, краткую подпись,
вкл/выкл микрофона и отдельный переход в чат. Mic — только вкл/выкл, а не
неявное «перебить». `data-mic`: connecting, listening, paused, off. Реальное
слушание пульсирует, ответ обозначает паузу входного микрофона. Native control
синхронно получает checked/disabled и доступное имя. В text темы сменяются
каждые 8 секунд в простое. Мобильный keyboard viewport используется и в inline,
и в overlay; input не выключается во время текстового запроса.

## Голос и прерывание

Realtime: `gpt-realtime`, `cedar` (можно задать `OPENAI_REALTIME_VOICE`),
`max_output_tokens:1200`; far_field, server_vad threshold 0.74, silence 950 мс,
interrupt_response:false. Echo cancellation/noise suppression включены,
AGC выключен. При открытии нет response.create/приветствия. Подключение получает
30 секунд, краткий disconnected — 8 секунд; connected сохраняет тот же peer.
Через 5 минут сеанс завершается с возможностью включить микрофон снова.

MediaStreamTrack.enabled=false передаёт тишину при ожидании/воспроизведении.
response.done завершает генерацию, output_audio_buffer.stopped — серверный буфер.
Поздний stopped не включает микрофон нового ответа. «Перебить» отправляет cancel,
clear и возвращается к слушанию после соответствующих подтверждений.
Серверный stopped не доказывает физический конец jitter buffer телефона.
Счётчики `getAgentDiagnostics()` содержат только состояния/количества,
без текста, аудио или ключей.

На реальном API воспроизведено: 220 токенов обрывают фразу после 8.45 секунд
с incomplete/max_output_tokens; 1200 завершают ту же фразу целиком (20.8 секунды).
Это одна подтверждённая причина обрыва, не доказательство отсутствия всех
сетевых или аппаратных проблем. Проверены реальный Cedar и четыре последовательных
голосовых шага с tool calls. Вход теста — текст через WebSocket, выход — аудио;
физический микрофон, WebRTC/iPhone и шум этим тестом не проверяются.
Источники: [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations),
[call session](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create),
[server events](https://developers.openai.com/api/reference/resources/realtime/server-events).

## Действия и контакт

show_section/show_case/show_experience открывают реальные материалы.
show_career адресует `career-<id>`, включая whistling. Видео не запускается агентом.
begin_contact_request включает опрос; prepare_contact_request заполняет только
полученные поля, проверяя длины до изменения формы. Отмена оставляет черновик.
Следующий вопрос определяется по пустым полям: имя → контакт → задача.
Текстовый API нормализует переходы после заполнения; voice обновляет инструкции
для контактного опроса и возвращает исходные инструкции после отмены.
Согласие и submit остаются ручными. Диктовка формы убрана из интерфейса;
старый модуль/endpoint transcribe сохранены, но не вызываются приложением.

Промпт ориентирован на вопрос посетителя; имя владельца не повторяется в каждом
ответе. Разделы имеют подтверждённый расширенный контекст и пустое поле
additional_context для следующей содержательной итерации. Не добавлять факты
без подтверждения. Развёрнутые знания серверные, не часть публичного HTML.

## Отклик и проверка

`mountNativeHapticToggle` заменяет только три микрофонных button на label с реальным,
фокусируемым checkbox switch (opacity:0, appearance:auto). Оригинальный trusted
click не отменяется; change выполняет переключение, синтетический клик не нужен.
Vibration API остаётся для остальных кнопок; программный hidden fallback является
попыткой совместимости и может блокироваться WebKit. Фоновых импульсов нет.
[WebKit trusted requirement](https://github.com/WebKit/WebKit/commit/fc1ef83eae10068fe468587d959e868041ddfe03),
[opacity/event regions](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/RenderLayer.cpp).
Физический Taptic не подтверждён.

`npm run check:agent`: 31 изолированная проверка mock DOM плюс серверная конфигурация.
Отдельно проверены реальный текстовый API (6 сценариев), Realtime audio budget,
контактный voice flow, HTTP-хеши assets, страницы и video Range. Браузерный инструмент
сохраняет запрет; реальные новые скриншоты/микрофон/клавиатура остаются проверкой
на устройстве. Canonical PDF, SDD, админка и уведомления не предусмотрены.
