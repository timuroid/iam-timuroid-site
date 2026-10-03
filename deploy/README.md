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

Текущий выпуск — `20261003-agent-stable-cdfc993`, исходный коммит
`cdfc993f31c273c2a3c6d7089c4d2d61a68fbca1`. Для возврата сохранён
`/opt/timuroid/releases/20261003-voice-first-441728c`. Проверенный backup:
`/var/lib/timuroid/backups/timuroid-before-agent-stable-cdfc993.sqlite`, root 600,
SQLite quick_check=ok. Активны timuroid, Caddy и соседний сервис.
Проверены HTTPS 200/HTTP 308, точные хеши JS/CSS/обоих шрифтов, страницы кейсов,
видео Range 206. API домена очистил черновик и дал развёрнутое объяснение без
самовольного перехода; вопросы после 50 реплик не вызывают принудительный handoff.
Сервер настроен на Cedar/gpt-realtime. Архив без секретов/баз, SHA256:
`b7f15bc043073cd18f0d8098acdd7350b547e3b95967e24f6b7e7b6e01fd1123`.

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
Панель владельца — `/admin`: заявки, бриф/текст интервью, знания и точные
промпты текущего выпуска. Обычные разговоры и аудио в базе сайта не сохраняются.
Бриф и реплики интервью сохраняются вместе с подтверждённой заявкой.
Уведомления не реализованы.

Для панели нужны ADMIN_LOGIN и ADMIN_PASSWORD_HASH в `/etc/timuroid.env`.
Пароль хранится как scrypt-хеш; без хеша вход отключён. Cookie на HTTPS
Secure/HttpOnly/SameSite; изменения требуют CSRF. Локальные данные первого входа
находятся в исключённом из Git `project_files/admin-access.txt`.
Подробности — в [`../docs/Tech/LLM_AND_ADMIN.md`](../docs/Tech/LLM_AND_ADMIN.md).
Миграция добавляет поля интервью и admin_sessions, сохраняя прежние заявки;
Node-сервер применяет её при запуске. Перед обновлением нужен SQLite backup.

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
