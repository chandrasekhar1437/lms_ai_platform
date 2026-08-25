import os
import uuid
import shutil
import random
import requests
from datetime import datetime, timedelta, date
from typing import Optional, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from bson import ObjectId
from jose import JWTError, jwt

from app.db import db

# Load environment variables
load_dotenv()

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_jwt_key_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120

# Brevo Email API Key (Uses HTTP Port 443 to avoid SMTP port blocks)
BREVO_API_KEY = os.getenv("BREVO_API_KEY")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__ident="2b")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

app = FastAPI(title="LMS-AI Platform API")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
# PYDANTIC SCHEMAS
# =====================================================================

class UserRegister(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str = "student"

class UserLogin(BaseModel):
    email: str
    password: str

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str

class NoteCreate(BaseModel):
    user_id: str
    lecture_id: str
    timestamp_seconds: int
    content: str

class ChatMessage(BaseModel):
    message: str

class QuizSubmission(BaseModel):
    quiz_id: str
    selected_option: int

class ProgressUpdate(BaseModel):
    user_id: str
    lecture_id: str

class ForumPostCreate(BaseModel):
    user_id: str
    user_name: str
    content: str

class AssignmentCreate(BaseModel):
    course_id: str
    title: str
    instructions: str
    due_date: str

class QuizCreate(BaseModel):
    module_id: str
    title: str
    questions: List[dict]

# =====================================================================
# HELPER FUNCTIONS
# =====================================================================

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def format_doc(doc):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

def send_otp_email(recipient_email: str, otp_code: str, subject: str):
    print(f"\n==========================================")
    print(f"SENDING OTP TO {recipient_email}: {otp_code}")
    print(f"==========================================\n")
    
    if not BREVO_API_KEY:
        print("BREVO_API_KEY is not set in Environment Variables. Skipping email send.")
        return

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }
    payload = {
        "sender": {
            "name": "LMS Platform",
            "email": "chandrasekharnunna983@gmail.com"
        },
        "to": [{"email": recipient_email}],
        "subject": subject,
        "htmlContent": f"<html><body><p>Hello,</p><p>Your verification OTP code is: <strong>{otp_code}</strong></p><p>This code is valid for 10 minutes.</p></body></html>"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code in [200, 201, 202]:
            print("Email sent successfully via Brevo API!")
        else:
            print(f"Brevo API Error: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Failed to send email via Brevo API: {e}")


# =====================================================================
# HEALTH CHECK & AUTH ENDPOINTS (PRD Section 8.1)
# =====================================================================

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Backend running with MongoDB Atlas and Brevo Email API"}

@app.post("/api/v1/auth/register")
async def register(payload: UserRegister):
    existing_user = await db.users.find_one({"email": payload.email})
    if existing_user and existing_user.get("is_verified", False):
        raise HTTPException(status_code=400, detail="Email is already registered")
    
    otp_code = f"{random.randint(100000, 999999)}"
    
    user_doc = {
        "full_name": payload.full_name,
        "email": payload.email,
        "password_hash": get_password_hash(payload.password),
        "role": payload.role,
        "is_verified": False,
        "otp": otp_code,
        "created_at": datetime.utcnow()
    }
    
    await db.users.update_one({"email": payload.email}, {"$set": user_doc}, upsert=True)
    send_otp_email(payload.email, otp_code, "LMS Registration OTP Code")
    
    return {"status": "otp_sent", "message": f"Verification OTP sent to {payload.email}"}

@app.post("/api/v1/auth/verify-otp")
async def verify_otp(payload: OTPVerify):
    user = await db.users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.get("otp") != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code")
        
    user_id = str(user["_id"])
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"is_verified": True}, "$unset": {"otp": ""}})
    await db.streaks.insert_one({"user_id": user_id, "current_streak": 1, "last_active_date": str(date.today())})
    
    token = create_access_token({"sub": user_id, "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"_id": user_id, "full_name": user["full_name"], "email": user["email"], "role": user["role"]}
    }

@app.post("/api/v1/auth/login")
async def login(payload: UserLogin):
    user = await db.users.find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = str(user["_id"])
    today_str = str(date.today())
    streak = await db.streaks.find_one({"user_id": user_id})
    if streak:
        if streak.get("last_active_date") != today_str:
            new_streak = streak.get("current_streak", 0) + 1
            await db.streaks.update_one({"user_id": user_id}, {"$set": {"current_streak": new_streak, "last_active_date": today_str}})
    else:
        await db.streaks.insert_one({"user_id": user_id, "current_streak": 1, "last_active_date": today_str})

    token = create_access_token({"sub": user_id, "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"_id": user_id, "full_name": user["full_name"], "email": user["email"], "role": user["role"]}
    }

@app.post("/api/v1/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    user = await db.users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=404, detail="Email address not found")
    
    otp_code = f"{random.randint(100000, 999999)}"
    await db.users.update_one({"email": payload.email}, {"$set": {"reset_otp": otp_code}})
    send_otp_email(payload.email, otp_code, "LMS Password Reset OTP Code")
    
    return {"status": "success", "message": f"Password reset OTP sent to {payload.email}"}

@app.post("/api/v1/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    user = await db.users.find_one({"email": payload.email})
    if not user or user.get("reset_otp") != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code or email")
        
    hashed_password = get_password_hash(payload.new_password)
    await db.users.update_one({"email": payload.email}, {"$set": {"password_hash": hashed_password}, "$unset": {"reset_otp": ""}})
    return {"status": "success", "message": "Password reset successfully. Please log in."}

# =====================================================================
# COURSE CATALOG ENDPOINTS (PRD Section 8.2)
# =====================================================================

@app.get("/api/v1/courses")
async def list_courses(category: Optional[str] = None, difficulty: Optional[str] = None, search: Optional[str] = None, status: Optional[str] = "approved"):
    query = {}
    if status:
        query["status"] = status
    if category and category != "All":
        query["category"] = category
    if difficulty and difficulty != "All":
        query["difficulty"] = difficulty
    if search:
        query["title"] = {"$regex": search, "$options": "i"}

    cursor = db.courses.find(query)
    courses = await cursor.to_list(length=100)
    return [format_doc(c) for c in courses]

@app.get("/api/v1/courses/{course_id}/tree")
async def get_course_tree(course_id: str):
    try:
        course = await db.courses.find_one({"_id": ObjectId(course_id)})
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        return format_doc(course)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Course ID format")

@app.get("/api/v1/videos/{file_name}")
async def stream_video(file_name: str):
    file_path = os.path.join(UPLOAD_DIR, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    return FileResponse(file_path, media_type="video/mp4")

# =====================================================================
# ENROLLMENT & PROGRESS ENDPOINTS (PRD Section 8.3)
# =====================================================================

@app.post("/api/v1/courses/{course_id}/enroll")
async def enroll_course(course_id: str, token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    
    existing = await db.enrollments.find_one({"user_id": user_id, "course_id": course_id})
    if existing:
        return {"status": "already_enrolled", "enrollment_id": str(existing["_id"])}
        
    enrollment_doc = {
        "user_id": user_id,
        "course_id": course_id,
        "enrolled_at": datetime.utcnow(),
        "progress_percent": 0.0
    }
    result = await db.enrollments.insert_one(enrollment_doc)
    return {"status": "success", "enrollment_id": str(result.inserted_id)}

@app.get("/api/v1/enrollments/me")
async def get_my_enrollments(token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    
    cursor = db.enrollments.find({"user_id": user_id})
    enrollments = await cursor.to_list(length=100)
    
    results = []
    for enc in enrollments:
        c_id = enc.get("course_id")
        course = await db.courses.find_one({"_id": ObjectId(c_id)}) if ObjectId.is_valid(c_id) else None
        results.append({
            "enrollment_id": str(enc["_id"]),
            "course_id": c_id,
            "course_title": course.get("title", "Unknown") if course else "Course",
            "progress_percent": enc.get("progress_percent", 0.0),
            "enrolled_at": enc.get("enrolled_at")
        })
    return results

@app.post("/api/v1/notes")
async def add_note(payload: NoteCreate):
    note_doc = payload.dict()
    note_doc["created_at"] = datetime.utcnow()
    await db.notes.insert_one(note_doc)
    return {"status": "success"}

@app.post("/api/v1/courses/{course_id}/progress")
async def update_progress(course_id: str, payload: ProgressUpdate):
    await db.progress.update_one(
        {"user_id": payload.user_id, "course_id": course_id},
        {"$addToSet": {"completed_lectures": payload.lecture_id}},
        upsert=True
    )
    return {"status": "success"}

@app.get("/api/v1/courses/{course_id}/progress/{user_id}")
async def get_progress(course_id: str, user_id: str):
    record = await db.progress.find_one({"user_id": user_id, "course_id": course_id})
    completed = record.get("completed_lectures", []) if record else []
    
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    total_lectures = 0
    if course:
        for mod in course.get("modules", []):
            total_lectures += len(mod.get("lectures", []))
            
    percentage = round((len(completed) / total_lectures * 100), 1) if total_lectures > 0 else 0
    
    certificate_url = None
    if percentage >= 100.0:
        cert_id = f"CERT_{user_id[:4]}_{course_id[:4]}"
        certificate_url = f"https://api.platform.com/certificates/{cert_id}.pdf"

    streak = await db.streaks.find_one({"user_id": user_id})
    current_streak = streak.get("current_streak", 1) if streak else 1

    return {
        "completed_lectures": completed,
        "total_lectures": total_lectures,
        "percentage": percentage,
        "certificate_url": certificate_url,
        "current_streak": current_streak
    }

# =====================================================================
# ASSIGNMENTS & QUIZZES ENDPOINTS (PRD Section 8.4)
# =====================================================================

@app.post("/api/v1/assignments")
async def create_assignment(payload: AssignmentCreate):
    doc = payload.dict()
    doc["created_at"] = datetime.utcnow()
    res = await db.assignments.insert_one(doc)
    return {"status": "success", "assignment_id": str(res.inserted_id)}

@app.post("/api/v1/assignments/{assignment_id}/submit")
async def submit_assignment(assignment_id: str, user_id: str, file: UploadFile = File(...)):
    file_ext = os.path.splitext(file.filename)[1]
    saved_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    submission_doc = {
        "assignment_id": assignment_id,
        "user_id": user_id,
        "file_url": f"/api/v1/videos/{saved_filename}",
        "submitted_at": datetime.utcnow(),
        "grade": None,
        "feedback": ""
    }
    res = await db.submissions.insert_one(submission_doc)
    return {"status": "success", "submission_id": str(res.inserted_id)}

@app.post("/api/v1/quizzes")
async def create_quiz(payload: QuizCreate):
    doc = payload.dict()
    doc["is_ai_generated"] = False
    doc["created_at"] = datetime.utcnow()
    res = await db.quizzes.insert_one(doc)
    return {"status": "success", "quiz_id": str(res.inserted_id)}

@app.post("/api/v1/courses/{course_id}/quizzes/grade")
async def grade_quiz(course_id: str, payload: QuizSubmission):
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    for mod in course.get("modules", []):
        for quiz in mod.get("quizzes", []):
            if quiz.get("quiz_id") == payload.quiz_id:
                for q in quiz.get("questions", []):
                    is_correct = (payload.selected_option == q.get("correct_option"))
                    return {
                        "is_correct": is_correct,
                        "score": 100 if is_correct else 0,
                        "message": "Correct answer!" if is_correct else "Incorrect. Try again!"
                    }
    raise HTTPException(status_code=404, detail="Quiz not found")
# =====================================================================
# AI TUTOR & FORUM ENDPOINTS (PRD Section 8.5)
# =====================================================================

@app.get("/api/v1/courses/{course_id}/forum")
async def get_forum_posts(course_id: str):
    cursor = db.forum_posts.find({"course_id": course_id}).sort("created_at", -1)
    posts = await cursor.to_list(length=100)
    return [format_doc(p) for p in posts]

@app.post("/api/v1/courses/{course_id}/forum")
async def add_forum_post(course_id: str, payload: ForumPostCreate):
    post_doc = payload.dict()
    post_doc["course_id"] = course_id
    post_doc["created_at"] = datetime.utcnow()
    await db.forum_posts.insert_one(post_doc)
    return {"status": "success"}

@app.post("/api/v1/lectures/{lecture_id}/summarize")
async def summarize_lecture(lecture_id: str):
    return {
        "summary": "This lecture introduces asynchronous Python database drivers and FastAPI execution structures.",
        "key_points": [
            "Async processing prevents non-blocking thread lock.",
            "Motor is the primary async client for MongoDB.",
            "FastAPI handles execution schemas with Pydantic validation."
        ]
    }

@app.post("/api/v1/courses/{course_id}/chat")
async def ai_tutor_chat(course_id: str, payload: ChatMessage):
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    reply = f"Regarding '{payload.message}': This topic covers foundational async execution models and schema handling."
    return {"reply": reply, "sources": [{"course_title": course.get("title", "LMS Course") if course else "LMS Course"}]}

# =====================================================================
# RECOMMENDATIONS & GAMIFICATION (PRD Section 8.6)
# =====================================================================

@app.get("/api/v1/users/me/badges")
async def get_user_badges(token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    
    badges = [
        {"id": 1, "name": "First Step", "description": "Enrolled in your first course", "icon_url": "/icons/badge1.png"},
        {"id": 2, "name": "7-Day Streak", "description": "Logged in for 7 consecutive days", "icon_url": "/icons/badge2.png"}
    ]
    return {"user_id": user_id, "badges": badges}

@app.get("/api/v1/users/me/streak")
async def get_user_streak(token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    
    streak = await db.streaks.find_one({"user_id": user_id})
    return {
        "current_streak": streak.get("current_streak", 1) if streak else 1,
        "last_active_date": streak.get("last_active_date", str(date.today())) if streak else str(date.today())
    }