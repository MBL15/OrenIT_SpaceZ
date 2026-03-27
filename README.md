# OrenIT — обучающая платформа

В репозитории **бэкенд** на FastAPI (`app/`). Если в проекте есть папка **`frontend/`**, это клиент на **React + Vite** (его можно поднять отдельно).

## Бэкенд

```powershell
cd d:\OrenIT
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Документация API: http://127.0.0.1:8000/docs

База SQLite по умолчанию: `data/app.db` (каталог `data/` создаётся при старте при необходимости).

## Фронтенд (при наличии `frontend/`)

```powershell
cd d:\OrenIT\frontend
npm install
npm run dev
```

Сайт: http://127.0.0.1:5173

Если в `frontend/vite.config.js` настроен **прокси** на порт 8000, запросы к путям вроде `/auth`, `/lessons`, `/me` уходят на FastAPI.

Сообщение **`vite` не является командой** обычно значит, что **`npm install` не завершился** — нет `frontend/node_modules`. Повторите установку.

### Вход в приложение (режим с API)

1. Сначала запустите **бэкенд** (порт 8000), затем **фронт** (порт 5173).
2. Поле **«Логин»** на фронте соответствует полю `login` на сервере (можно строку вроде email).
3. Демо-аккаунты из сида: `student` / `student`, `teacher` / `teacher`, `admin` / `admin`.

Разнести фронт и API по разным доменам: в `frontend/.env` задайте `VITE_API_BASE` (URL API, без завершающего `/`).

## Только бэкенд

Если папки `frontend/` нет, достаточно раздела **«Бэкенд»** выше. Остаток `frontend/node_modules` на диске при отсутствии исходников можно удалить вручную после закрытия процессов Node/Vite:

```powershell
Remove-Item -Recurse -Force d:\OrenIT\frontend
```
