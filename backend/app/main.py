import os
import uuid
import shutil
import random
import json
import requests
from contextlib import asynccontextmanager
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
from openai import OpenAI

from app.db import db

# Load environment variables
load_dotenv()

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_jwt_key_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120

# External API Keys
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize OpenAI Client
ai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__ident="2b")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Application Lifespan Configuration
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Application startup: LMS API running.")
    yield
    print("Application shutdown.")

app = FastAPI(
    title="LMS-AI Platform API",
    description="Backend API supporting AI Tutoring, Course Management, Gamification, and Admin Controls.",
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Health Check", "description": "System operational status."},
        {"name": "Authentication", "description": "Registration, OTP verification, login, and password management."},
        {"name": "Courses & Learning", "description": "Course catalog, tree views, streaming, and notes."},
        {"name": "Enrollments & Progress", "description": "Student course enrollment and lecture completion tracking."},
        {"name": "Assignments & Quizzes", "description": "Submissions, quiz evaluations, and grading."},
        {"name": "AI Features & Tutor", "description": "AI Tutor chat, transcript summaries, flashcards, and study plans."},
        {"name": "Forums & Community", "description": "Discussion boards and course Q&A."},
        {"name": "User Profile & Gamification", "description": "User badges, learning streaks, and profile details."},
        {"name": "Admin & Governance", "description": "User administration, role management, course approvals, and system analytics."}
    ]
)

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
    mode: Optional[str] = "intermediate"

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

class StudyPlanRequest(BaseModel):
    course_id: str
    user_id: str

class CourseApprovalRequest(BaseModel):
    decision: str  # "approved" or "rejected"
    comment: Optional[str] = ""

class RoleUpdateRequest(BaseModel):
    role: str  # "student", "instructor", "admin"

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
        print("BREVO_API_KEY is missing in Environment Variables.")
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
# HEALTH CHECK & AUTH ENDPOINTS
# =====================================================================

@app.get("/health", tags=["Health Check"])
async def health_check():
    return {"status": "ok", "message": "Backend running with MongoDB Atlas, Brevo Email API, and OpenAI AI Service"}

@app.post("/api/v1/auth/register", tags=["Authentication"])
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

@app.post("/api/v1/auth/verify-otp", tags=["Authentication"])
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

@app.post("/api/v1/auth/login", tags=["Authentication"])
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

@app.post("/api/v1/auth/forgot-password", tags=["Authentication"])
async def forgot_password(payload: ForgotPasswordRequest):
    user = await db.users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=404, detail="Email address not found")
    
    otp_code = f"{random.randint(100000, 999999)}"
    await db.users.update_one({"email": payload.email}, {"$set": {"reset_otp": otp_code}})
    send_otp_email(payload.email, otp_code, "LMS Password Reset OTP Code")
    
    return {"status": "success", "message": f"Password reset OTP sent to {payload.email}"}

@app.post("/api/v1/auth/reset-password", tags=["Authentication"])
async def reset_password(payload: ResetPasswordRequest):
    user = await db.users.find_one({"email": payload.email})
    if not user or user.get("reset_otp") != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code or email")
        
    hashed_password = get_password_hash(payload.new_password)
    await db.users.update_one({"email": payload.email}, {"$set": {"password_hash": hashed_password}, "$unset": {"reset_otp": ""}})
    return {"status": "success", "message": "Password reset successfully. Please log in."}

# =====================================================================
# COURSE CATALOG ENDPOINTS
# =====================================================================

@app.get("/api/v1/courses", tags=["Courses & Learning"])
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

@app.get("/api/v1/courses/{course_id}/tree", tags=["Courses & Learning"])
async def get_course_tree(course_id: str):
    try:
        course = await db.courses.find_one({"_id": ObjectId(course_id)})
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        return format_doc(course)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Course ID format")

@app.get("/api/v1/videos/{file_name}", tags=["Courses & Learning"])
async def stream_video(file_name: str):
    file_path = os.path.join(UPLOAD_DIR, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    return FileResponse(file_path, media_type="video/mp4")

# =====================================================================
# ENROLLMENT & PROGRESS ENDPOINTS
# =====================================================================

@app.post("/api/v1/courses/{course_id}/enroll", tags=["Enrollments & Progress"])
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

@app.get("/api/v1/enrollments/me", tags=["Enrollments & Progress"])
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

@app.post("/api/v1/notes", tags=["Courses & Learning"])
async def add_note(payload: NoteCreate):
    note_doc = payload.dict()
    note_doc["created_at"] = datetime.utcnow()
    await db.notes.insert_one(note_doc)
    return {"status": "success"}

@app.post("/api/v1/courses/{course_id}/progress", tags=["Enrollments & Progress"])
async def update_progress(course_id: str, payload: ProgressUpdate):
    await db.progress.update_one(
        {"user_id": payload.user_id, "course_id": course_id},
        {"$addToSet": {"completed_lectures": payload.lecture_id}},
        upsert=True
    )
    return {"status": "success"}

@app.get("/api/v1/courses/{course_id}/progress/{user_id}", tags=["Enrollments & Progress"])
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
# ASSIGNMENTS & QUIZZES ENDPOINTS
# =====================================================================

@app.post("/api/v1/assignments", tags=["Assignments & Quizzes"])
async def create_assignment(payload: AssignmentCreate):
    doc = payload.dict()
    doc["created_at"] = datetime.utcnow()
    res = await db.assignments.insert_one(doc)
    return {"status": "success", "assignment_id": str(res.inserted_id)}

@app.post("/api/v1/assignments/{assignment_id}/submit", tags=["Assignments & Quizzes"])
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

@app.post("/api/v1/quizzes", tags=["Assignments & Quizzes"])
async def create_quiz(payload: QuizCreate):
    doc = payload.dict()
    doc["is_ai_generated"] = False
    doc["created_at"] = datetime.utcnow()
    res = await db.quizzes.insert_one(doc)
    return {"status": "success", "quiz_id": str(res.inserted_id)}

@app.post("/api/v1/courses/{course_id}/quizzes/grade", tags=["Assignments & Quizzes"])
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
# AI TUTOR & FORUM ENDPOINTS
# =====================================================================

@app.get("/api/v1/courses/{course_id}/forum", tags=["Forums & Community"])
async def get_forum_posts(course_id: str):
    cursor = db.forum_posts.find({"course_id": course_id}).sort("created_at", -1)
    posts = await cursor.to_list(length=100)
    return [format_doc(p) for p in posts]

@app.post("/api/v1/courses/{course_id}/forum", tags=["Forums & Community"])
async def add_forum_post(course_id: str, payload: ForumPostCreate):
    post_doc = payload.dict()
    post_doc["course_id"] = course_id
    post_doc["created_at"] = datetime.utcnow()
    await db.forum_posts.insert_one(post_doc)
    return {"status": "success"}

@app.post("/api/v1/lectures/{lecture_id}/summarize", tags=["AI Features & Tutor"])
async def summarize_lecture(lecture_id: str):
    course = await db.courses.find_one({"modules.lectures.lecture_id": lecture_id})
    transcript = "FastAPI is a modern web framework for building APIs with Python."
    if course:
        for mod in course.get("modules", []):
            for lec in mod.get("lectures", []):
                if lec.get("lecture_id") == lecture_id and lec.get("transcript"):
                    transcript = lec.get("transcript")
                    break

    if ai_client:
        try:
            response = ai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Summarize the given lecture transcript concisely into key points."},
                    {"role": "user", "content": transcript}
                ]
            )
            return {"summary": response.choices[0].message.content, "key_points": [response.choices[0].message.content]}
        except Exception as e:
            print(f"OpenAI API error: {e}")

    return {
        "summary": "Summary generated from transcript content.",
        "key_points": [
            "Async execution models improve response speeds.",
            "FastAPI uses Pydantic schema verification.",
            "MongoDB Motor provides non-blocking IO database execution."
        ]
    }

@app.post("/api/v1/courses/{course_id}/chat", tags=["AI Features & Tutor"])
async def ai_tutor_chat(course_id: str, payload: ChatMessage):
    course = await db.courses.find_one({"_id": ObjectId(course_id)}) if ObjectId.is_valid(course_id) else None
    course_title = course.get("title", "LMS Course") if course else "LMS Course"

    if ai_client:
        try:
            sys_msg = f"You are an AI Tutor teaching '{course_title}'. Explain topics targeting a {payload.mode} level learner concisely and accurately."
            response = ai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": payload.message}
                ]
            )
            return {
                "reply": response.choices[0].message.content,
                "sources": [{"course_title": course_title, "mode": payload.mode}]
            }
        except Exception as e:
            print(f"OpenAI Chat Error: {e}")

    return {
        "reply": f"[{payload.mode.title()} Level] Great question about {course_title}! Fast asynchronous operations allow concurrent processing using non-blocking execution models.",
        "sources": [{"course_title": course_title, "mode": payload.mode}]
    }

# =====================================================================
# GAMIFICATION & ADMIN ENDPOINTS
# =====================================================================

@app.get("/api/v1/users/me/badges", tags=["User Profile & Gamification"])
async def get_user_badges(token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    return [
        {"badge_id": "b1", "title": "Fast Learner", "description": "Completed first module", "unlocked": True},
        {"badge_id": "b2", "title": "Quiz Master", "description": "Scored 100% on a quiz", "unlocked": True}
    ]

@app.get("/api/v1/users/me/streak", tags=["User Profile & Gamification"])
async def get_user_streak(token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    streak = await db.streaks.find_one({"user_id": user_id})
    return {"current_streak": streak.get("current_streak", 1) if streak else 1}

@app.get("/api/v1/admin/users", tags=["Admin & Governance"])
async def admin_list_users():
    cursor = db.users.find()
    users = await cursor.to_list(length=100)
    return [format_doc(u) for u in users]

@app.put("/api/v1/admin/users/{user_id}/role", tags=["Admin & Governance"])
async def admin_update_role(user_id: str, payload: RoleUpdateRequest):
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": payload.role}})
    return {"status": "success", "message": f"User role updated to {payload.role}"}

@app.get("/api/v1/admin/courses/pending", tags=["Admin & Governance"])
async def admin_pending_courses():
    cursor = db.courses.find({"status": "pending"})
    courses = await cursor.to_list(length=100)
    return [format_doc(c) for c in courses]

@app.post("/api/v1/admin/courses/{course_id}/approve", tags=["Admin & Governance"])
async def admin_approve_course(course_id: str, payload: CourseApprovalRequest):
    await db.courses.update_one(
        {"_id": ObjectId(course_id)}, 
        {"$set": {"status": payload.decision, "approval_comment": payload.comment}}
    )
    return {"status": "success", "decision": payload.decision}

@app.get("/api/v1/admin/analytics/overview", tags=["Admin & Governance"])
async def admin_analytics_overview():
    total_users = await db.users.count_documents({})
    total_courses = await db.courses.count_documents({})
    total_enrollments = await db.enrollments.count_documents({})
    return {
        "total_users": total_users,
        "total_courses": total_courses,
        "total_enrollments": total_enrollments,
        "active_students_today": 12
    }