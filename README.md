# Task Manager

A production-ready full-stack task management application built with **FastAPI**, **MongoDB**, and a vanilla **HTML/CSS/JS** frontend. Fully containerized with Docker and delivered end-to-end through a GitHub Actions CI/CD pipeline that runs tests, smoke-tests the stack, and publishes images to Docker Hub on every merge to `main`.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Features](#features)
6. [CI/CD Pipeline — How It Works](#cicd-pipeline--how-it-works)
7. [Docker — How the Containers Work Together](#docker--how-the-containers-work-together)
8. [End-to-End Flow](#end-to-end-flow)
9. [Quick Start (Demo)](#quick-start-demo)
10. [Run from Docker Hub (No Source Code Needed)](#run-from-docker-hub-no-source-code-needed)
11. [Running Tests Locally](#running-tests-locally)
12. [API Reference](#api-reference)
13. [Environment Variables](#environment-variables)

---

## What It Does

A task manager where users can:

- Add tasks with a **priority level** (High / Medium / Low) and an optional **due date**
- Mark tasks done via a checkbox — a **progress bar** and **completion percentage** update live
- Filter the list by **All / Active / Done**
- See smart due date labels: *Today*, *Tomorrow*, *in 3d*, *Jun 20*, *⚠ 2d overdue*
- Tasks auto-sort: High priority first, completed tasks sink to the bottom

---

## Tech Stack

| Layer      | Technology                          | Why                                      |
|------------|-------------------------------------|------------------------------------------|
| Frontend   | HTML + CSS + JS served by **Nginx** | Zero build step, fast static delivery    |
| Backend    | **FastAPI** (Python 3.12)           | Async, auto-generates `/docs` (Swagger)  |
| Database   | **MongoDB 7** via Motor (async)     | Flexible schema, native async driver     |
| Containers | **Docker** + Docker Compose         | Reproducible environments everywhere     |
| CI/CD      | **GitHub Actions**                  | Automated test → smoke-test → push pipeline |
| Registry   | **Docker Hub**                      | Public image delivery                    |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser                             │
│              http://localhost:3000                      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────┐
│              Frontend Container (Nginx)                 │
│   /usr/share/nginx/html/                                │
│   ├── index.html          (HTML template)               │
│   └── static/                                          │
│       ├── style.css                                     │
│       └── app.js          (fetch → localhost:8000)      │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API calls (port 8000)
┌──────────────────────▼──────────────────────────────────┐
│              Backend Container (FastAPI)                │
│   main.py                                               │
│   ├── GET  /tasks                                       │
│   ├── POST /tasks                                       │
│   ├── PUT  /tasks/{id}                                  │
│   └── DELETE /tasks/{id}                               │
│                                                         │
│   Waits for MongoDB health check before starting        │
└──────────────────────┬──────────────────────────────────┘
                       │ Motor async driver (port 27017)
┌──────────────────────▼──────────────────────────────────┐
│              MongoDB Container (mongo:7)                │
│   Database : taskmanager                                │
│   Collection: tasks                                     │
│   Volume   : mongo_data (persists across restarts)      │
└─────────────────────────────────────────────────────────┘
```

All three services run inside a private Docker network. Only the ports you need are exposed to the host (`3000` and `8000`). MongoDB is internal only.

---

## Project Structure

```
task-manager/
├── .github/
│   └── workflows/
│       └── ci.yml              # Full CI/CD pipeline
│
├── backend/
│   ├── Dockerfile              # python:3.12-slim, non-root user
│   ├── main.py                 # FastAPI app — all routes + models
│   ├── test_main.py            # Pytest integration tests
│   ├── requirements.txt        # Production deps only
│   ├── requirements-dev.txt    # Adds pytest/httpx for testing
│   └── pyproject.toml          # pytest-asyncio session config
│
├── frontend/
│   ├── Dockerfile              # nginx:alpine
│   ├── templates/
│   │   └── index.html          # Pure HTML — no inline CSS or JS
│   └── static/
│       ├── style.css           # All styles
│       └── app.js              # All JavaScript (fetch calls)
│
├── docker-compose.yml          # Orchestrates all 3 services locally
└── README.md
```

---

## Features

### Application
- **Priority levels** — High / Medium / Low with color-coded left border and badge
- **Due dates** — smart relative labels (Today, Tomorrow, in Nd, ⚠ overdue)
- **Live progress bar** — gradient fill tracks completion percentage
- **Filter tabs** — All / Active / Done, all client-side (no extra API calls)
- **Auto-sort** — High priority floats up; done tasks sink to the bottom
- **Enter key** support on the task input field

### Engineering
- **Async throughout** — FastAPI + Motor (no blocking I/O)
- **Lifespan context manager** — MongoDB client opens/closes cleanly with the app lifecycle
- **Non-root Docker user** — `appuser` inside the container (security best practice)
- **Test isolation** — tests use a separate `test_taskmanager` database, wiped after the suite
- **Split requirements** — prod image only installs 5 packages; test deps stay out of the image
- **Health-check dependency** — backend waits for MongoDB to pass `mongosh ping` before starting

---

## CI/CD Pipeline — How It Works

Every `git push` or pull request to `main` triggers the pipeline defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

```
git push origin main
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions                               │
│                                                                 │
│  ┌──────────────┐     ┌──────────────────┐                     │
│  │  Job 1       │     │  Job 2           │                     │
│  │  Run Tests   ├──┬──► Smoke Test       │                     │
│  │              │  │  │  (docker compose)│                     │
│  └──────────────┘  │  └──────────────────┘                     │
│                    │                                            │
│                    │  ┌──────────────────────────────┐         │
│                    └──► Job 3 (main branch only)      │         │
│                       │  Build & Push to Docker Hub   │         │
│                       │  aravind456/task-manager-*    │         │
│                       └──────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Job 1 — Run Tests
- Spins up a real `mongo:7` service container
- Installs `requirements-dev.txt` (prod deps + pytest + httpx)
- Runs `pytest test_main.py -v` — 3 integration tests hit the actual database

### Job 2 — Docker Compose Smoke Test
- Builds both images from source
- Runs `docker compose up -d`
- Polls `http://localhost:8000/` until the backend responds (up to 30 s)
- Curls both the backend health endpoint and the frontend HTML
- Always tears down with `docker compose down`

### Job 3 — Build & Push to Docker Hub *(main branch only, after tests pass)*
- Logs in to Docker Hub using `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets
- Builds and pushes two images with two tags each:
  - `aravind456/task-manager-backend:latest`
  - `aravind456/task-manager-backend:<git-sha>`
  - `aravind456/task-manager-frontend:latest`
  - `aravind456/task-manager-frontend:<git-sha>`
- Uses GitHub Actions cache to speed up layer builds

### What triggers what

| Event | Tests | Smoke Test | Push to Hub |
|---|---|---|---|
| Push to `main` | ✅ | ✅ | ✅ |
| Pull Request to `main` | ✅ | ✅ | ❌ |

PRs are fully validated (tests + smoke test) but images are only published on a real merge.

---

## Docker — How the Containers Work Together

### docker-compose.yml breakdown

```yaml
services:
  mongo:          # mongo:7 — has a health check (mongosh ping)
  backend:        # built from ./backend — depends_on mongo (healthy)
  frontend:       # built from ./frontend — depends_on backend (started)
```

**Start-up order is enforced:**

```
mongo starts
    │
    ├─ mongosh ping passes  ← health check (every 10s, up to 5 retries)
    │
backend starts              ← only after mongo is Healthy
    │
frontend starts             ← immediately after backend container starts
```

This prevents the race condition where the backend tries to connect to MongoDB before it's ready to accept connections.

### Backend Dockerfile
```
python:3.12-slim
  → COPY requirements.txt + pip install (layer-cached)
  → COPY main.py only  (test files never enter the image)
  → adduser appuser    (non-root)
  → USER appuser
  → uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend Dockerfile
```
nginx:alpine
  → COPY templates/index.html → /usr/share/nginx/html/index.html
  → COPY static/              → /usr/share/nginx/html/static/
```
Nginx serves everything as static files. The browser's `fetch()` calls go directly to `http://localhost:8000` (the backend port exposed to the host).

### Persistent data
MongoDB data is stored in a named Docker volume (`mongo_data`) so tasks survive container restarts.

---

## End-to-End Flow

Here is exactly what happens from a developer typing `git push` to a user clicking a checkbox:

```
Developer: git push origin main
    │
    ▼
GitHub Actions triggers ci.yml
    │
    ├─ [test job]       pytest runs 3 tests against a live mongo service
    ├─ [smoke job]      docker compose up → curl checks → docker compose down
    └─ [push job]       docker buildx → push :latest + :<sha> to Docker Hub
                                │
                                ▼
                        Docker Hub stores the images
                                │
User: docker pull aravind456/task-manager-backend:latest
      docker pull aravind456/task-manager-frontend:latest
                                │
                                ▼
User: docker compose up -d
    │
    ├─ mongo:7 starts, health check passes
    ├─ FastAPI starts (lifespan creates AsyncIOMotorClient)
    └─ Nginx starts, serves HTML + static files
                                │
                                ▼
Browser loads http://localhost:3000
    │
    ├─ Nginx → index.html
    ├─ Nginx → /static/style.css
    └─ Nginx → /static/app.js
                                │
                                ▼
app.js: loadTasks() → fetch("http://localhost:8000/tasks")
    │
    ├─ FastAPI → Motor → MongoDB → returns JSON array
    └─ renderTasks() + updateStats() update the DOM

User checks a checkbox
    │
    ├─ delegated event listener on <ul> fires
    ├─ toggleTask() → PUT /tasks/{id}  { done: true, priority: "high", ... }
    ├─ FastAPI → MongoDB $set → re-fetches updated doc → returns TaskOut
    └─ loadTasks() re-renders list, progress bar animates to new %
```

---

## Quick Start (Demo)

### Option A — Build from source

```bash
git clone https://github.com/Aravindsvec/task_manager.git
cd task_manager

docker compose up --build
```

| URL | What you see |
|---|---|
| http://localhost:3000 | The app |
| http://localhost:8000/docs | Interactive Swagger API docs |
| http://localhost:8000/tasks | Raw JSON task list |

### Option B — Pull from Docker Hub (no source code)

```bash
# 1. Save this as docker-compose.yml

version: "3"
services:
  mongo:
    image: mongo:7
    volumes: [mongo_data:/data/db]
    healthcheck:
      test: ["CMD","mongosh","--eval","db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
  backend:
    image: aravind456/task-manager-backend:latest
    ports: ["8000:8000"]
    environment: [MONGO_URL=mongodb://mongo:27017]
    depends_on:
      mongo: {condition: service_healthy}
  frontend:
    image: aravind456/task-manager-frontend:latest
    ports: ["3000:80"]
volumes:
  mongo_data:

# 2. Run it
docker compose up
```

### Demo talking points

1. **Add a task** — pick High priority, set a due date → notice the red left border and priority badge
2. **Add another task** — Low priority, no date → green border
3. **Check the High priority task done** → progress bar animates, percentage updates, task fades and sinks to bottom
4. **Click "Active"** filter → done task disappears from view (no page reload)
5. **Open** http://localhost:8000/docs → show the auto-generated Swagger UI (FastAPI feature)
6. **Run a raw curl** → `curl http://localhost:8000/tasks` → show the live JSON

---

## Running Tests Locally

```bash
cd backend

# Install dev dependencies (includes pytest, httpx, pytest-asyncio)
pip install -r requirements-dev.txt

# Spin up a throw-away MongoDB
docker run -d -p 27017:27017 mongo:7

# Run the suite
pytest test_main.py -v
```

Tests run against a dedicated `test_taskmanager` database that is wiped clean after every run — they never touch production data.

---

## API Reference

All endpoints accept and return JSON. Interactive docs at `/docs`.

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| `GET` | `/` | — | `{"message": "..."}` | Health check |
| `GET` | `/tasks` | — | `[TaskOut]` | List all tasks |
| `POST` | `/tasks` | `TaskCreate` | `TaskOut` 201 | Create a task |
| `PUT` | `/tasks/{id}` | `TaskCreate` | `TaskOut` | Full update |
| `DELETE` | `/tasks/{id}` | — | `{"message": "..."}` | Delete a task |

**TaskCreate schema**

```json
{
  "title":       "Buy groceries",
  "description": "",
  "done":        false,
  "priority":    "high",
  "due_date":    "2026-06-20"
}
```

**TaskOut schema** (same fields + `id`)

```json
{
  "id":          "6a32d8112d3bf57f10c790a3",
  "title":       "Buy groceries",
  "description": "",
  "done":        false,
  "priority":    "high",
  "due_date":    "2026-06-20"
}
```

`priority` must be one of `"low"`, `"medium"`, `"high"` (defaults to `"medium"`).  
`due_date` is an ISO date string `YYYY-MM-DD` or `""` for no date.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGO_URL` | `mongodb://mongo:27017` | MongoDB connection string |
| `CORS_ORIGINS` | `*` | Allowed origins, comma-separated. Set to your domain in production. |

Set via `docker-compose.yml` → `environment:` or a `.env` file (never commit `.env`).
