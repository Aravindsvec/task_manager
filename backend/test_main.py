import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from main import app

transport = ASGITransport(app=app)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_root(client):
    response = await client.get("/")
    assert response.status_code == 200
    assert response.json()["message"] == "Task Manager API is running"


@pytest.mark.asyncio
async def test_create_task(client):
    response = await client.post("/tasks", json={
        "title": "Test Task",
        "description": "A test",
        "done": False
    })
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Task"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_tasks(client):
    response = await client.get("/tasks")
    assert response.status_code == 200
    assert isinstance(response.json(), list)