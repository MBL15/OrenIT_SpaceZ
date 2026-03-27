# OrenIT — бэкенд

API на **FastAPI**: уроки, практика, пользователи, магазин маскота, лидерборд и т.д.

## Запуск

```powershell
cd d:\OrenIT
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Документация: http://127.0.0.1:8000/docs

База SQLite по умолчанию: `data/app.db` (каталог `data/` создаётся при старте при необходимости).

## Остаток папки `frontend/`

Исходники и сборка фронта удалены. Если у вас ещё есть `frontend/node_modules` (файл мог быть занят процессом Node/Vite), закройте dev-сервер и терминалы, затем выполните:

```powershell
Remove-Item -Recurse -Force d:\OrenIT\frontend
```

После этого каталог `frontend` можно удалить целиком.
