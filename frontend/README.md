
# AI-Powered Learning Management System (LMS)

A full-stack, enterprise-grade Learning Management System featuring real-time AI Tutoring, automated transcript summarization, interactive quizzes, gamification, and robust admin governance.

## 🚀 Live Demo & Links

* **Frontend App (Vercel):** [https://lms-ai-platform.vercel.app](https://lms-ai-platform.vercel.app)
* **Backend API Documentation (Render):** [https://lms-ai-platform.onrender.com/docs](https://lms-ai-platform.onrender.com/docs)
* **GitHub Repository:** [https://github.com/chandrasekhar1437/lms_ai_platform](https://github.com/chandrasekhar1437/lms_ai_platform)

---

## ✨ Features

* **Authentication & Security:** User registration, OTP email verification via Brevo, password resets, and JWT session handling.
* **Course Catalog & Tree View:** Dynamic course browsing, module hierarchies, video streaming, and note-taking.
* **AI Features & Interactive Tutor:** Real-time AI chat assistant, lecture transcript summarization, and automated study plan generation via OpenAI.
* **Gamification & Analytics:** Learning streaks, progress tracking, user badges, and completion metrics.
* **Admin Governance:** Comprehensive dashboard endpoints for user management, role assignments, course approvals, and platform analytics.

---

## 🛠️ Tech Stack

* **Frontend:** React (Vite), Tailwind CSS, Lucide Icons, Axios
* **Backend:** Python, FastAPI, Motor (Async PyMongo), Pydantic, Passlib
* **Database:** MongoDB Atlas
* **External Services:** OpenAI API (AI Tutor & Summarization), Brevo SMTP API (Transactional OTP Emails)
* **Deployment:** Vercel (Frontend), Render (Backend)

---

## 🔑 Environment Variables Setup

### Backend Environment Variables (`backend/.env`)

```env
MONGO_URL=your_mongodb_atlas_connection_string
SECRET_KEY=your_jwt_secret_key
BREVO_API_KEY=your_brevo_api_key
OPENAI_API_KEY=your_openai_api_key

Frontend Environment Variables (frontend/.env)
VITE_API_BASE_URL=[https://lms-ai-platform.onrender.com](https://lms-ai-platform.onrender.com)

⚡ Local Development Setup
1. Backend Setup
cd backend
python -m venv venv
venv\Scripts\activate  # On Windows
pip install -r requirements.txt
python -m app.seed     # Seed initial course and admin user
uvicorn app.main:app --reload

2. Frontend Setup
cd frontend
npm install
npm run dev

🧪 Admin Test Credentials
 * Email: admin@test.com
 * Password: AdminPass123
 * Role: admin

---

### **Commit the Readme to GitHub**

Run these terminal commands from your main project folder to save your documentation:

```cmd
git add README.md
git commit -m "Add project README with setup instructions and deployment links"
git push origin main