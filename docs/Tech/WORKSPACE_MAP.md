# Карта проекта

Единый Git-корень приложения — корень этого репозитория. Origin:
`https://github.com/timuroid/iam-timuroid-site.git`, основная ветка — `main`.

| Путь | Назначение |
|---|---|
| `public/` | Статическая страница, стили, браузерный агент, голос и диктовка |
| `content/` | Тексты сайта, кейсы и данные для знаний агента |
| `server/` | Node.js API, работа с OpenAI и SQLite |
| `db/`, `drizzle/` | Схема данных и миграции |
| `deploy/` | Docker Compose и конфигурация nginx для `iam.timuroid.ru` |
| `docs/WORKFLOW.md` | Локальная работа и передача изменений через GitHub |

Проект рассчитан на Node.js 24. Конфигурация контейнера хранит SQLite в
именованном Docker volume и читает секреты из `/etc/timuroid.env` на сервере.
