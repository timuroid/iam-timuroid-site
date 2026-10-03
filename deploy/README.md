# Развёртывание TIMUROID

Рабочий адрес — **https://iam.timuroid.ru**. На VPS уже находились Caddy и
другой сервис; сайт установлен отдельной службой без замены их конфигурации.

## Рабочая установка

| Ресурс | Значение |
|---|---|
| Служба | `timuroid.service`, непривилегированный пользователь `timuroid` |
| Node.js | 24.21.0, `/opt/timuroid-node/bin/node` |
| Исходники и сборка | `/opt/timuroid/releases/<release>` |
| Активная версия | символьная ссылка `/opt/timuroid/current` |
| Внутренний адрес | `127.0.0.1:4318` |
| База заявок | `/var/lib/timuroid/timuroid.sqlite` |
| Секреты | `/etc/timuroid.env`, владелец root, права 600 |
| Прокси | Caddy, блок из `iam.timuroid.ru.Caddyfile` |

Служба включена в автозапуск и перезапускается при ошибке. База находится вне
каталогов выпусков. Caddy обслуживает HTTPS и перенаправляет HTTP на HTTPS.
Образец службы — `timuroid.service`. Файл `compose.yml`, Dockerfile и nginx
конфигурация остаются альтернативными шаблонами; на текущем VPS они не используются.

Текущий выпуск — `20261003-voice-first-441728c`, исходный коммит
`441728cc558353a29e9b3e774a6ea91f49858bb6`. Для возврата сохранён
`/opt/timuroid/releases/20261003-agent-inline-89cba06`. Проверенный backup перед обновлением:
`/var/lib/timuroid/backups/timuroid-before-voice-first-441728c.sqlite`, root 600.
Проверены активные службы, HTTPS 200/HTTP 308, новые HTML/JS/CSS, страницы кейсов,
видео Range 206 и текстовый API: show_career/whistling и prepare_contact_request.
Архив выпуска проверен без секретов/баз; SHA256:
`881c92d254b8847601fbf0ae70cc0d196932fddadaac8bc6e0d1c9d6ac68e8cf`.

## Обновление

1. Собрать проверенные исходники в новом каталоге выпуска. Ключи, локальные
   базы, `.git`, `node_modules` и `.sites-runtime` в архив не включать.
2. До обновления сделать SQLite backup и сохранить действующую конфигурацию,
   если она меняется. Запомнить путь `readlink -f /opt/timuroid/current`.
3. В каталоге выпуска выполнить `/opt/timuroid-node/bin/node scripts/build.mjs`.
   Видеофайлы будут скопированы отдельно в `dist/media`; сервер отдаёт их потоком.
4. Создать новую ссылку и атомарно заменить активную:

```bash
ln -s /opt/timuroid/releases/<release> /opt/timuroid/current.next
mv -T /opt/timuroid/current.next /opt/timuroid/current
systemctl restart timuroid
```

5. Проверить службу, HTTPS, страницы кейсов, медиа и API. Для возврата повторить
   замену ссылки с путём предыдущего выпуска и перезапустить службу. Базу не
   откатывать автоматически: миграции надо проверять отдельно.

Полезные команды на сервере:

```bash
systemctl status timuroid --no-pager
journalctl -u timuroid --no-pager -n 30
curl -I https://iam.timuroid.ru/
```

## Данные и ограничения

Текст и аудио передаются OpenAI через серверные API; ключ не попадает в HTML
или браузер. Заявки сохраняются только после ручного подтверждения формы.
Уведомления и админка не реализованы. Просмотр заявок — через SQLite на сервере.
История разговора и аудио в базе сайта не сохраняются.

Голос требует HTTPS и разрешения микрофона. По решению пользователя нет квот
chat/voice, ограничения количества реплик или завершения через пять минут.
Защита ручной отправки заявок (6/час) и неиспользуемого legacy dictation endpoint
(8/час) остаётся. Диктовка удалена из интерфейса. Voice default: cedar,
max_output_tokens=inf; OPENAI_REALTIME_VOICE может переопределить голос.
Подключение получает 30 секунд, краткий disconnect — 8 секунд.

Микрофон использует реальный focusable checkbox switch под visual control
на Safari; остальные кнопки используют доступный Vibration API и compatibility
попытку. Физический отклик iPhone проверяется отдельно. Reduced motion сохранён.

Автоматического развёртывания из GitHub нет. Проверка браузера, реального
микрофона и мобильных устройств остаётся отдельным шагом.
