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
│   ├── main.py              # FastAPI app with CRUD routes
│   ├── requirements.txt
│   └── test_main.py          # Pytest tests
├── frontend/
│   ├── Dockerfile
│   └── index.html            # Single-page frontend
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions pipeline
├── docker-compose.yml        # Runs all 3 services
└── README.md
```

## Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/task-manager.git
cd task-manager

# Start everything
docker compose up --build

# Open in browser
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

## API Endpoints

- `GET    /tasks`       — List all tasks
- `POST   /tasks`       — Create a task
- `PUT    /tasks/{id}`  — Update a task
- `DELETE /tasks/{id}`  — Delete a task
"# done" 
