# Task Manager

A full-stack task management app built with **FastAPI**, **MongoDB**, and a static **HTML/JS frontend**, containerized with **Docker** and automated with **GitHub Actions**.

## Tech Stack

| Layer      | Technology       |
|------------|-----------------|
| Frontend   | HTML + CSS + JS (served by Nginx) |
| Backend    | FastAPI (Python) |
| Database   | MongoDB 7       |
| Containers | Docker + Docker Compose |
| CI/CD      | GitHub Actions   |

## Project Structure

```
task-manager/
├── backend/
│   ├── Dockerfile
│   ├── main.py               # FastAPI app with CRUD routes
│   ├── requirements.txt      # Production dependencies
│   ├── requirements-dev.txt  # Dev/test dependencies
│   ├── pyproject.toml        # Pytest configuration
│   └── test_main.py          # Pytest tests
├── frontend/
│   ├── Dockerfile
│   ├── templates/
│   │   └── index.html        # HTML template
│   └── static/
│       ├── style.css         # Styles
│       └── app.js            # JavaScript
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions pipeline
├── docker-compose.yml        # Runs all 3 services
└── README.md
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Python 3.12+ (for running tests locally)
- MongoDB (provided automatically via Docker)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/task-manager.git
cd task-manager

# Start everything
docker compose up --build

# Open in browser
# Frontend: http://localhost:3000
# API docs:  http://localhost:8000/docs
```

## Running Tests Locally

```bash
# Install dev dependencies
cd backend
pip install -r requirements-dev.txt

# Start MongoDB (required for integration tests)
docker run -d -p 27017:27017 mongo:7

# Run tests
pytest test_main.py -v
```

## API Endpoints

| Method | Path            | Description      |
|--------|-----------------|------------------|
| GET    | `/tasks`        | List all tasks   |
| POST   | `/tasks`        | Create a task    |
| PUT    | `/tasks/{id}`   | Update a task    |
| DELETE | `/tasks/{id}`   | Delete a task    |

Interactive API docs are available at `http://localhost:8000/docs` when the backend is running.

## Environment Variables

| Variable      | Default                    | Description            |
|---------------|----------------------------|------------------------|
| `MONGO_URL`   | `mongodb://mongo:27017`    | MongoDB connection URL |
| `CORS_ORIGINS`| `*`                        | Allowed CORS origins (comma-separated) |

For production, set `CORS_ORIGINS` to your frontend's domain instead of `*`.
