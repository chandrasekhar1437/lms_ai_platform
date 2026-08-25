import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

# MongoDB Atlas Cloud Connection String
MONGO_URL = os.getenv(
    "MONGO_URL", 
    "mongodb+srv://chandu14372:ch123456@chandu-coder.7gppjmr.mongodb.net/?appName=chandu-coder"
)

client = AsyncIOMotorClient(MONGO_URL)
db = client.lms_database