import os

from bson import ObjectId
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

app = FastAPI(title="Task Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongo:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.taskmanager
collection = db.tasks


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    done: bool = False


class TaskOut(BaseModel):
    id: str
    title: str
    description: str
    done: bool


def task_to_dict(task) -> dict:
    return {
        "id": str(task["_id"]),
        "title": task["title"],
        "description": task["description"],
        "done": task["done"],
    }


@app.get("/")
async def root():
    return {"message": "Task Manager API is running"}


@app.get("/tasks", response_model=list[TaskOut])
async def get_tasks():
    tasks = []
    async for task in collection.find():
        tasks.append(task_to_dict(task))
    return tasks


@app.post("/tasks", response_model=TaskOut, status_code=201)
async def create_task(task: TaskCreate):
    doc = task.model_dump()
    result = await collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return task_to_dict(doc)


@app.put("/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, task: TaskCreate):
    try:
        oid = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    result = await collection.update_one({"_id": oid}, {"$set": task.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    updated = await collection.find_one({"_id": oid})
    return task_to_dict(updated)


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
