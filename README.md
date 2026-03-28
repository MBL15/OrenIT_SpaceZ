# SpacEdu — обучающая платформа

Монорепозиторий: **бэкенд** FastAPI (`app/`), **фронтенд** React + Vite (`src/`).

## Структура

| Каталог / файл | Назначение |
|----------------|------------|
| `app/` | API, модели, миграции SQLite |
| `src/` | SPA (страницы, компоненты) |
| `parent_mode.py` | Роутер родительского режима |
| `data/app.db` | SQLite (создаётся при первом запуске) |
| `Dockerfile.api`, `Dockerfile.web` | Образы API и nginx со статикой |
| `docker-compose.yml` | Запуск web + api + volume для БД |
| `docker/nginx.conf` | Проксирование API с того же origin, что и фронт |

## Локальная разработка (без Docker)

### Бэкенд

```powershell
cd путь\к\OrenIT_SpaceZ
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Документация API: http://127.0.0.1:8000/docs  

### Фронтенд

```powershell
cd путь\к\OrenIT_SpaceZ
npm install
npm run dev
```

Сайт: http://127.0.0.1:5173 — запросы к `/auth`, `/lessons`, `/me` и т.д. проксируются на порт 8000 (см. `vite.config.js`).

### Вход (демо из сида)

1. Сначала API (8000), затем Vite (5173).
2. Поле «Логин» — значение `login` в БД.
3. Учётки: `student` / `student`, `teacher` / `teacher`, `admin` / `admin`.

Отдельный хост для API: задайте `VITE_API_BASE` (URL без завершающего `/`) в `.env` или в окружении перед `npm run dev`.

---

## Развёртывание в Docker

Нужны [Docker Engine](https://docs.docker.com/engine/install/) и [Docker Compose](https://docs.docker.com/compose/install/) (v2: команда `docker compose`).

### 1. Клонирование и переменные окружения

```powershell
git clone https://github.com/MBL15/OrenIT_SpaceZ.git
cd OrenIT_SpaceZ
copy .env.example .env
```

Откройте `.env` и задайте **`JWT_SECRET`** — длинная случайная строка (обязательно в production).  
По желанию измените **`PORT`** (порт сайта на хосте, по умолчанию **8080**).

Строки `PIP_INDEX_URL=` и `NPM_REGISTRY=` **без значения** лучше удалить: иначе они могут сбросить зеркала по умолчанию из `docker-compose.yml`. Для официальных реестров укажите явно:

```env
PIP_INDEX_URL=https://pypi.org/simple
NPM_REGISTRY=https://registry.npmjs.org
```

### 2. Сборка и запуск

```powershell
docker compose up --build -d
```

- **Сайт:** http://localhost:8080 (или `http://localhost:<PORT>` из `.env`).
- Сервис **web** — nginx: отдаёт собранный Vite и проксирует запросы к API на сервис **api**.
- Сервис **api** — uvicorn, порт 8000 только внутри сети compose.
- База **SQLite** лежит в именованном volume **`orenit_data`** (`/app/data/app.db` в контейнере). Данные сохраняются при пересоздании контейнера `api`.

### 3. Полезные команды

| Действие | Команда |
|----------|---------|
| Логи | `docker compose logs -f` |
| Логи одного сервиса | `docker compose logs -f api` или `web` |
| Остановка | `docker compose down` |
| Остановка и удаление volume (очистит БД) | `docker compose down -v` |
| Пересборка после изменения кода | `docker compose up --build -d` |

### 4. Обновление на сервере

```powershell
git pull
docker compose up --build -d
```

### 5. Новые пути API

Если добавите префиксы URL, которых нет в `docker/nginx.conf`, допишите их в директиву `location ~ ^/(...)` в этом файле и пересоберите **web**.

### 6. Устранение проблем

- **Сборка `api`:** таймауты pip — повторите сборку или смените `PIP_INDEX_URL` в `.env`.
- **Сборка `web`:** `npm ci` / `ECONNRESET` — проверьте сеть, при необходимости задайте другой `NPM_REGISTRY`.
- Контейнер **api** не стартует: проверьте `docker compose logs api`, что задан непустой `JWT_SECRET` в `.env` при необходимости.

---

## Только бэкенд

Достаточно раздела «Локальная разработка» → «Бэкенд». Фронт в Docker собирается сам из `src/`.
