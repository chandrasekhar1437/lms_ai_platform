import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv(
    "MONGO_URL", 
    "mongodb+srv://chandu14372:ch123456@chandu-coder.7gppjmr.mongodb.net/?appName=chandu-coder"
)

async def seed_data():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.lms_database

    await db.courses.delete_many({})

    sample_course = {
        "title": "Full-Stack Web Development",
        "category": "Computer Science",
        "difficulty": "Intermediate",
        "description": "Comprehensive full-stack development masterclass with FastAPI and React.",
        "status": "approved",
        "modules": [
            {
                "module_id": "mod_1",
                "title": "Module 1: Backend Fundamentals",
                "order_index": 1,
                "lectures": [
                    {
                        "lecture_id": "lec_101",
                        "title": "Introduction to FastAPI & Async PyMongo",
                        "video_url": "https://example.com/videos/fastapi-intro.mp4",
                        "duration_seconds": 900,
                        "order_index": 1
                    }
                ],
                "quizzes": [
                    {
                        "quiz_id": "quiz_101",
                        "title": "FastAPI Concepts Quiz",
                        "questions": [
                            {
                                "question_text": "Which library handles async operations in FastAPI?",
                                "options": ["asyncio", "requests", "flask", "django"],
                                "correct_option": 0
                            }
                        ]
                    }
                ]
            }
        ]
    }

    result = await db.courses.insert_one(sample_course)
    print("--------------------------------------------------")
    print(f"SUCCESS! Copy your generated Course ID below:")
    print(f"{result.inserted_id}")
    print("--------------------------------------------------")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_data())