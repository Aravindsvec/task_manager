# Task Manager — Full Technical Deep Dive (Demo Reference)

This document explains every layer of the stack from Python functions to CI/CD. Read top to bottom for the full picture.

---

## Table of Contents

1. [What the App Does](#1-what-the-app-does)
2. [Python Backend — Every Function Explained](#2-python-backend--every-function-explained)
3. [Docker — How It Works + Every Line of the Dockerfile](#3-docker--how-it-works--every-line-of-the-dockerfile)
4. [Docker Compose — How the Three Services Talk to Each Other](#4-docker-compose--how-the-three-services-talk-to-each-other)
5. [Git + GitHub Actions CI/CD — How the Pipeline Works](#5-git--github-actions-cicd--how-the-pipeline-works)
6. [The Full Flow End to End (One Sentence per Step)](#6-the-full-flow-end-to-end)

---

## 1. What the App Does

Three services, three containers:

```
Browser (User)
    │
    ▼
Frontend (Nginx, port 3000)  ──── serves static HTML/JS
    │  JavaScript calls API
    ▼
Backend (FastAPI/Python, port 8000)  ──── handles business logic
    │  reads/writes tasks
    ▼
MongoDB (port 27017)  ──── stores data permanently
```

- **Frontend** — a single HTML file that talks directly to the backend API via `fetch()`
- **Backend** — a Python REST API with 4 endpoints (GET, POST, PUT, DELETE tasks)
- **MongoDB** — a NoSQL database; tasks are stored as JSON documents

---

## 2. Python Backend — Every Function Explained

File: [backend/main.py](backend/main.py)

### 2.1 Imports and Setup

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from bson import ObjectId
from typing import Optional
import os
```

| Import | What it does |
|---|---|
| `FastAPI` | The web framework — handles HTTP routing |
| `HTTPException` | Lets you return error responses like 404, 400 |
| `CORSMiddleware` | Allows the browser (on port 3000) to call the API (on port 8000) — browsers block this by default |
| `AsyncIOMotorClient` | Async MongoDB driver — "motor" is the async version of pymongo |
| `BaseModel, Field` | Pydantic — validates request/response data automatically |
| `ObjectId` | MongoDB uses `_id` as a 24-char hex string, `ObjectId` converts it |
| `os` | To read environment variables like `MONGO_URL` |

---

### 2.2 App Initialization + CORS

```python
app = FastAPI(title="Task Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # any domain can call this API
    allow_methods=["*"],   # GET, POST, PUT, DELETE all allowed
    allow_headers=["*"],   # any header allowed
)
```

**Why CORS matters:** The frontend is served from `http://localhost:3000` and tries to call `http://localhost:8000`. Browsers enforce the "Same-Origin Policy" — they block requests to a different port unless the server explicitly says it allows it. This middleware adds the required `Access-Control-Allow-Origin` header to every response.

---

### 2.3 MongoDB Connection

```python
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongo:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.taskmanager      # database named "taskmanager"
collection = db.tasks        # collection (table) named "tasks"
```

- `os.getenv("MONGO_URL", "mongodb://mongo:27017")` — reads the env var `MONGO_URL`. If not set, defaults to `mongodb://mongo:27017`. The hostname `mongo` works inside Docker Compose because Docker creates an internal DNS where service names resolve to container IPs.
- `AsyncIOMotorClient` — the connection is async, so the API never blocks while waiting for MongoDB to respond.
- `client.taskmanager` — MongoDB creates the database lazily (when you first write to it).
- `db.tasks` — the collection. Think of it like a SQL table but rows are JSON documents.

---

### 2.4 Data Models (Pydantic)

```python
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    done: bool = False
```

- Used for **incoming** requests (POST, PUT).
- `Field(..., min_length=1, max_length=200)` — `...` means required. FastAPI automatically returns a 422 error if the request body doesn't match this schema.
- `description: str = ""` — optional, defaults to empty string.

```python
class TaskOut(BaseModel):
    id: str
    title: str
    description: str
    done: bool
```

- Used for **outgoing** responses.
- Note: `id` (not `_id`) — MongoDB uses `_id` internally but we convert it to a plain string `id` for the API response.

---

### 2.5 Helper Function: `task_to_dict()`

```python
def task_to_dict(task) -> dict:
    return {
        "id": str(task["_id"]),   # converts ObjectId to string
        "title": task["title"],
        "description": task["description"],
        "done": task["done"],
    }
```

- MongoDB stores `_id` as an `ObjectId` object (binary). We must convert it to a string before returning it as JSON.
- This function is called after every DB operation to normalize the output.

---

### 2.6 Route: `GET /` — Health Check

```python
@app.get("/")
async def root():
    return {"message": "Task Manager API is running"}
```

- Returns a JSON `{"message": "..."}`.
- The CI/CD pipeline uses this to confirm the container started correctly (`curl -f http://localhost:8000/`).

---

### 2.7 Route: `GET /tasks` — List All Tasks

```python
@app.get("/tasks", response_model=list[TaskOut])
async def get_tasks():
    tasks = []
    async for task in collection.find():   # streams all documents from MongoDB
        tasks.append(task_to_dict(task))
    return tasks
```

- `collection.find()` returns an async cursor — you iterate it with `async for`.
- `response_model=list[TaskOut]` — FastAPI validates and serializes the return value to match the `TaskOut` shape.
- If the collection is empty, returns `[]`.

**What happens step by step:**
1. Browser calls `GET http://localhost:8000/tasks`
2. FastAPI routes to `get_tasks()`
3. MongoDB cursor streams all documents
4. Each document is converted via `task_to_dict()`
5. List is returned as JSON array

---

### 2.8 Route: `POST /tasks` — Create a Task

```python
@app.post("/tasks", response_model=TaskOut, status_code=201)
async def create_task(task: TaskCreate):
    doc = task.model_dump()             # converts Pydantic model to plain dict
    result = await collection.insert_one(doc)   # inserts into MongoDB
    doc["_id"] = result.inserted_id     # MongoDB auto-generates the _id
    return task_to_dict(doc)
```

- `task: TaskCreate` — FastAPI automatically parses the JSON request body and validates it against `TaskCreate`.
- `task.model_dump()` — converts `TaskCreate(title="Buy milk", description="", done=False)` to `{"title": "Buy milk", "description": "", "done": False}`.
- `collection.insert_one(doc)` — writes to MongoDB, returns an object with `inserted_id` (the new `_id`).
- `status_code=201` — HTTP 201 Created is the correct status for a successful POST.

---

### 2.9 Route: `PUT /tasks/{task_id}` — Update a Task

```python
@app.put("/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, task: TaskCreate):
    try:
        oid = ObjectId(task_id)        # convert string "abc123..." to MongoDB ObjectId
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    result = await collection.update_one({"_id": oid}, {"$set": task.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    updated = await collection.find_one({"_id": oid})
    return task_to_dict(updated)
```

- `{task_id}` in the URL is a path parameter — FastAPI extracts it automatically.
- `ObjectId(task_id)` — can throw if the string isn't a valid 24-char hex. We catch that and return 400.
- `{"$set": task.model_dump()}` — MongoDB's `$set` operator updates only the fields provided, leaving others unchanged.
- `result.matched_count == 0` — if no document matched `_id`, the task doesn't exist → 404.
- After updating, we fetch the document again to return the updated version.

---

### 2.10 Route: `DELETE /tasks/{task_id}` — Delete a Task

```python
@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    try:
        oid = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    result = await collection.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}
```

- `collection.delete_one({"_id": oid})` — finds the document by `_id` and removes it.
- `result.deleted_count == 0` — if nothing was deleted, it didn't exist → 404.

---

### 2.11 Test File: `test_main.py`

```python
@pytest.mark.asyncio
async def test_root():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
    assert response.status_code == 200
    assert response.json()["message"] == "Task Manager API is running"
```

- `ASGITransport(app=app)` — runs FastAPI in-memory without a real HTTP server. Tests run fast and don't need a running server.
- `AsyncClient` — httpx's async HTTP client. Since FastAPI is async, the test client must also be async.
- `@pytest.mark.asyncio` — tells pytest-asyncio this is an async test function.

The three tests cover:
1. `test_root` — health check returns 200 and expected message
2. `test_create_task` — POST creates a task and returns 201 with the task data
3. `test_get_tasks` — GET returns 200 and a list

---

## 3. Docker — How It Works + Every Line of the Dockerfile

### What Docker Does

Without Docker, you'd need to install Python 3.12, pip, MongoDB, Node, nginx on every machine. Docker packages the app and everything it needs into an **image** (a snapshot), then runs it as a **container** (a live instance of that snapshot).

```
Your Code + OS + Runtime + Dependencies
           ↓ docker build
         Image (read-only snapshot, ~200MB)
           ↓ docker run
         Container (running process, isolated from host)
```

Images are built once, run anywhere. That's the whole value proposition.

---

### 3.1 Backend Dockerfile

File: [backend/Dockerfile](backend/Dockerfile)

```dockerfile
FROM python:3.12-slim
```
- **Base image**: starts from an official Python 3.12 image (Debian Linux + Python pre-installed).
- `-slim` means a stripped-down version (~130MB instead of ~1GB). No build tools, just Python runtime.
- Docker pulls this from Docker Hub the first time, then caches it.

```dockerfile
WORKDIR /app
```
- Sets the working directory inside the container to `/app`.
- All subsequent commands run from `/app`.
- Equivalent to `mkdir /app && cd /app`.

```dockerfile
COPY requirements.txt .
```
- Copies `requirements.txt` from your machine into `/app/requirements.txt` inside the image.
- **Why copy this first before the rest of the code?** Docker caches each instruction as a layer. If `requirements.txt` hasn't changed, Docker reuses the cached layer and skips `pip install`. This makes rebuilds fast.

```dockerfile
RUN pip install --no-cache-dir -r requirements.txt
```
- Runs inside the image during build time.
- Installs all Python packages (fastapi, uvicorn, motor, etc.) into the image.
- `--no-cache-dir` — don't save pip's download cache inside the image (keeps the image smaller).

```dockerfile
COPY . .
```
- Copies all remaining files from `backend/` into `/app/` in the image.
- This runs after `pip install` so that code changes don't invalidate the pip cache layer.

```dockerfile
EXPOSE 8000
```
- Documents that this container listens on port 8000.
- Doesn't actually open the port — that's done at `docker run` time with `-p 8000:8000`.

```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```
- The command that runs when the container starts.
- `uvicorn` is an ASGI server that runs FastAPI.
- `main:app` means "in `main.py`, the `app` object".
- `--host 0.0.0.0` — listens on all network interfaces (not just localhost). Required so traffic from outside the container can reach it.
- `--port 8000` — listen on port 8000.

---

### 3.2 Frontend Dockerfile

File: [frontend/Dockerfile](frontend/Dockerfile)

```dockerfile
FROM nginx:alpine
```
- Base image: nginx web server on Alpine Linux (~5MB total). Extremely small.

```dockerfile
COPY index.html /usr/share/nginx/html/index.html
```
- Copies our HTML file into nginx's default web root.
- nginx serves any file in `/usr/share/nginx/html/` as a static file.

```dockerfile
EXPOSE 80
```
- nginx listens on port 80 by default.

There is no `CMD` — nginx's default CMD from the base image starts the server.

---

### 3.3 Building Images Manually

```bash
# Build backend image, tag it "task-manager-backend"
docker build -t task-manager-backend ./backend

# Run it (maps host port 8000 to container port 8000)
docker run -p 8000:8000 task-manager-backend

# Build frontend
docker build -t task-manager-frontend ./frontend

# Run it (maps host port 3000 to container port 80)
docker run -p 3000:80 task-manager-frontend
```

---

## 4. Docker Compose — How the Three Services Talk to Each Other

File: [docker-compose.yml](docker-compose.yml)

Docker Compose lets you define and run multi-container apps with a single command. Instead of running 3 `docker run` commands manually, you describe everything in one YAML file.

```yaml
version: "3.8"
```
- The Docker Compose file format version. Determines which features are available.

---

### 4.1 MongoDB Service

```yaml
services:
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
```

- `image: mongo:7` — uses the official MongoDB 7 image from Docker Hub. No Dockerfile needed.
- `ports: "27017:27017"` — maps host port 27017 to container port 27017 (for local access from tools like MongoDB Compass).
- `volumes: mongo_data:/data/db` — MongoDB stores its data files in `/data/db`. The named volume `mongo_data` persists this data across container restarts. Without this, every time you restart the container, all tasks are deleted.

---

### 4.2 Backend Service

```yaml
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - MONGO_URL=mongodb://mongo:27017
    depends_on:
      - mongo
```

- `build: ./backend` — builds the image from `./backend/Dockerfile`. No pre-built image needed.
- `environment: MONGO_URL=mongodb://mongo:27017` — passes an env var to the container. The hostname `mongo` works because Docker Compose puts all services on the same internal network and registers service names as DNS hostnames.
- `depends_on: mongo` — Docker starts `mongo` before `backend`. Note: this only waits for the container to start, not for MongoDB to be ready to accept connections. For production, you'd add a health check.

**How `mongo` resolves as a hostname:**
Docker Compose creates a private network (e.g., `task-manager_default`). Every service joins it. Docker's internal DNS maps `mongo` → the mongo container's IP, `backend` → the backend container's IP, etc.

---

### 4.3 Frontend Service

```yaml
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
```

- `ports: "3000:80"` — maps host port 3000 to container port 80 (nginx).
- User visits `http://localhost:3000` → hits nginx → returns `index.html`.
- The browser then calls `http://localhost:8000/tasks` directly (the JavaScript does this, not the container).

---

### 4.4 Volumes

```yaml
volumes:
  mongo_data:
```

- Declares the named volume `mongo_data`. Docker manages its storage location on the host (usually under `/var/lib/docker/volumes/`).
- Survives `docker compose down` — data is only deleted with `docker compose down -v`.

---

### 4.5 Running It

```bash
# Start all 3 services (builds images if needed)
docker compose up

# Start in background (detached mode)
docker compose up -d

# View logs
docker compose logs -f backend

# Stop everything
docker compose down

# Stop and delete volumes (wipes database)
docker compose down -v
```

---

## 5. Git + GitHub Actions CI/CD — How the Pipeline Works

File: [.github/workflows/ci.yml](.github/workflows/ci.yml)

### What CI/CD Means

- **CI (Continuous Integration):** Every time code is pushed, automatically run tests and build checks. Catches bugs before they reach production.
- **CD (Continuous Deployment):** If CI passes, automatically deploy to production. This project has CI; CD (actual deployment) would be the next step.

### How GitHub Actions Works

GitHub Actions is a task runner built into GitHub. When you push code, GitHub reads `.github/workflows/*.yml` and executes the defined jobs on cloud machines called **runners**.

```
Developer pushes to GitHub
         │
         ▼
GitHub Actions reads ci.yml
         │
         ▼
Spins up fresh Ubuntu VM (runner)
         │
    ┌────┴────┐
    ▼         ▼
  job: test   job: build   ← these could run in parallel
    │              │        but "build" needs "test" to pass first
    ▼              ▼
Run pytest    docker build
    │              │
Pass? ────────────▶ docker compose up + curl test
```

---

### 5.1 Trigger

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

- Runs the pipeline on every push to `main` OR when a PR targets `main`.
- PRs will show a green/red check based on whether CI passes before merging.

---

### 5.2 Job 1: `test`

```yaml
  test:
    name: Run Tests
    runs-on: ubuntu-latest
```
- `runs-on: ubuntu-latest` — GitHub provides a fresh Ubuntu VM for every run.

```yaml
    services:
      mongo:
        image: mongo:7
        ports:
          - 27017:27017
```
- **Service containers** — GitHub Actions can spin up Docker containers alongside the runner. This starts a real MongoDB instance that tests can connect to.
- The tests use `MONGO_URL: mongodb://localhost:27017` because from the runner's perspective, the mongo container is accessible on `localhost:27017`.

```yaml
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
```
- `uses:` — calls a pre-built action from the GitHub marketplace.
- `actions/checkout@v4` — clones your repository into the runner VM.

```yaml
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
```
- Installs Python 3.12 on the runner.

```yaml
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
```
- `run: |` — runs shell commands directly on the runner (not in a Docker container).
- Installs all the Python packages needed for the tests.

```yaml
      - name: Run tests
        env:
          MONGO_URL: mongodb://localhost:27017
        run: |
          cd backend
          pytest test_main.py -v
```
- Sets the env var `MONGO_URL` so `main.py` connects to the runner's MongoDB service.
- `pytest -v` — verbose mode, shows each test name as pass/fail.
- If any test fails, `pytest` exits with a non-zero code → GitHub Actions marks the step as failed → the pipeline stops.

---

### 5.3 Job 2: `build`

```yaml
  build:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: test
```
- `needs: test` — this job only runs if the `test` job passed. This is the dependency chain.

```yaml
      - name: Build backend image
        run: docker build -t task-manager-backend ./backend

      - name: Build frontend image
        run: docker build -t task-manager-frontend ./frontend
```
- Builds both Docker images to verify the Dockerfiles are valid and the build succeeds.

```yaml
      - name: Test Docker Compose
        run: |
          docker compose up -d
          sleep 10
          curl -f http://localhost:8000/ || exit 1
          curl -f http://localhost:3000/ || exit 1
          docker compose down
```
- Starts all 3 containers, waits 10 seconds for them to boot.
- `curl -f` — `-f` makes curl exit with code 22 on HTTP errors. If the backend isn't responding, `|| exit 1` fails the step.
- Verifies both backend and frontend are actually running.
- Tears down after the test.

---

### 5.4 The Full CI Flow Visualized

```
git push origin main
       │
       ▼
GitHub triggers ci.yml
       │
       ├──► Job: test (ubuntu-latest VM)
       │         ├── checkout code
       │         ├── install Python 3.12
       │         ├── pip install -r requirements.txt
       │         ├── start MongoDB service container
       │         └── pytest test_main.py -v
       │                   │
       │              all pass?
       │                   │
       └──► Job: build (new VM, only if test passed)
                 ├── checkout code
                 ├── docker build backend
                 ├── docker build frontend
                 ├── docker compose up -d
                 ├── sleep 10
                 ├── curl localhost:8000
                 ├── curl localhost:3000
                 └── docker compose down
                           │
                      all pass?
                           │
                    ✅ Pipeline Green
```

---

## 6. The Full Flow End to End

Here is the complete journey from writing code to a passing CI pipeline:

```
1. Developer writes code locally
2. Developer runs: docker compose up  →  tests the app at localhost:3000
3. Developer pushes to GitHub: git push origin feature-branch
4. Developer opens a Pull Request to main
5. GitHub Actions triggers ci.yml
6. Job "test" runs on GitHub's Ubuntu VM:
     - starts MongoDB service container
     - pip install
     - pytest → all 3 tests pass
7. Job "build" runs (because test passed):
     - docker build backend
     - docker build frontend
     - docker compose up -d + curl health checks
8. PR shows ✅ green checkmark
9. Team lead reviews and merges PR to main
```

---

## Quick Reference: Run Everything Locally

```bash
# 1. Run the app
docker compose up -d

# 2. Open frontend
open http://localhost:3000

# 3. Test the API
curl http://localhost:8000/tasks
curl -X POST http://localhost:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "done": false}'

# 4. Run tests only
cd backend
pip install -r requirements.txt
MONGO_URL=mongodb://localhost:27017 pytest test_main.py -v

# 5. View API docs (FastAPI auto-generates this)
open http://localhost:8000/docs

# 6. Add Prometheus + Grafana (after updating docker-compose.yml)
docker compose up -d
open http://localhost:9090   # Prometheus
open http://localhost:4000   # Grafana (admin/admin)
```
