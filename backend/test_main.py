import os

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from motor.motor_asyncio import AsyncIOMotorClient

import main as main_module
from main import app

# All tests share one session loop so motor's connection pool
# doesn't bind to a function-scoped loop that gets closed mid-suite.
pytestmark = pytest.mark.asyncio(loop_scope="session")

transport = ASGITransport(app=app)
TEST_DB = "test_taskmanager"


@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_motor():
    mongo_client = AsyncIOMotorClient(
        os.getenv("MONGO_URL", "mongodb://localhost:27017")
    )
    main_module.client = mongo_client
    main_module.db = mongo_client[TEST_DB]
    main_module.collection = mongo_client[TEST_DB].tasks
    yield
    await mongo_client[TEST_DB].drop_collection("tasks")
    mongo_client.close()


@pytest_asyncio.fixture(scope="session")
async def client():
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_root(client):
    response = await client.get("/")
    assert response.status_code == 200
    assert response.json()["message"] == "Task Manager API is running"


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


async def test_get_tasks(client):
    response = await client.get("/tasks")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
