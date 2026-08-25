import React, { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

// Production Backend API URL deployed on Render
const API_BASE_URL = "https://lms-ai-platform.onrender.com";

function App() {
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login"); // 'login', 'register', 'otp', 'forgot', 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("student");
  const [otp, setOtp] = useState("");

  const [courses, setCourses] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(false);

  const [progress, setProgress] = useState({ completed_lectures: [], percentage: 0, current_streak: 1 });
  const [noteText, setNoteText] = useState("");
  const [forumPosts, setForumPosts] = useState([]);
  const [forumInput, setForumInput] = useState("");

  const [aiSummary, setAiSummary] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { sender: "ai", text: "Hello! I am your AI Tutor. Ask me any question about this course!" }
  ]);

  const [activeCourseId, setActiveCourseId] = useState("6a8d6dc867132271f048f530");

  const fetchCatalog = () => {
    axios
      .get(`${API_BASE_URL}/api/v1/courses?category=${selectedCategory}&difficulty=${selectedDifficulty}&search=${searchQuery}`)
      .then((res) => setCourses(res.data))
      .catch((err) => console.error(err));
  };

  const fetchCourseTree = (courseId) => {
    setLoading(true);
    axios
      .get(`${API_BASE_URL}/api/v1/courses/${courseId}/tree`)
      .then((res) => {
        setCourse(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchProgress = (userId, courseId) => {
    if (!userId || !courseId) return;
    axios
      .get(`${API_BASE_URL}/api/v1/courses/${courseId}/progress/${userId}`)
      .then((res) => setProgress(res.data))
      .catch((err) => console.error(err));
  };

  const fetchForum = (courseId) => {
    axios
      .get(`${API_BASE_URL}/api/v1/courses/${courseId}/forum`)
      .then((res) => setForumPosts(res.data))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      fetchProgress(parsedUser._id, activeCourseId);
    }
    fetchCatalog();
    fetchCourseTree(activeCourseId);
    fetchForum(activeCourseId);
  }, [activeCourseId, selectedCategory, selectedDifficulty, searchQuery]);

  const handleAuth = (e) => {
    e.preventDefault();
    if (authView === "register") {
      axios
        .post(`${API_BASE_URL}/api/v1/auth/register`, { full_name: fullName, email, password, role })
        .then((res) => {
          alert(res.data.message);
          setAuthView("otp");
        })
        .catch((err) => alert(err.response?.data?.detail || "Registration Failed"));
    } else {
      axios
        .post(`${API_BASE_URL}/api/v1/auth/login`, { email, password })
        .then((res) => {
          localStorage.setItem("token", res.data.access_token);
          localStorage.setItem("user", JSON.stringify(res.data.user));
          setUser(res.data.user);
          fetchProgress(res.data.user._id, activeCourseId);
        })
        .catch((err) => alert(err.response?.data?.detail || "Authentication Failed"));
    }
  };
  const handleVerifyOTP = (e) => {
    e.preventDefault();
    axios
      .post(`${API_BASE_URL}/api/v1/auth/verify-otp`, { email, otp })
      .then((res) => {
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        setUser(res.data.user);
        fetchProgress(res.data.user._id, activeCourseId);
      })
      .catch((err) => alert(err.response?.data?.detail || "Invalid OTP"));
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    axios
      .post(`${API_BASE_URL}/api/v1/auth/forgot-password`, { email })
      .then((res) => {
        alert(res.data.message);
        setAuthView("reset");
      })
      .catch((err) => alert(err.response?.data?.detail || "Request Failed"));
  };

  const handleResetPassword = (e) => {
    e.preventDefault();
    axios
      .post(`${API_BASE_URL}/api/v1/auth/reset-password`, { email, otp, new_password: newPassword })
      .then((res) => {
        alert(res.data.message);
        setAuthView("login");
      })
      .catch((err) => alert(err.response?.data?.detail || "Reset Failed"));
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
  };

  const handleMarkComplete = (lectureId) => {
    if (!user?._id) return alert("Please log in to track progress.");
    axios
      .post(`${API_BASE_URL}/api/v1/courses/${activeCourseId}/progress`, {
        user_id: user._id,
        lecture_id: lectureId,
      })
      .then(() => fetchProgress(user._id, activeCourseId))
      .catch((err) => console.error(err));
  };

  const handleAddNote = (lectureId) => {
    if (!noteText.trim()) return;
    axios
      .post(`${API_BASE_URL}/api/v1/notes`, {
        user_id: user._id,
        lecture_id: lectureId,
        timestamp_seconds: 45,
        content: noteText
      })
      .then(() => {
        setNoteText("");
        alert("Note Saved!");
      });
  };

  const handleAddForumPost = (e) => {
    e.preventDefault();
    if (!forumInput.trim()) return;
    axios
      .post(`${API_BASE_URL}/api/v1/courses/${activeCourseId}/forum`, {
        user_id: user._id,
        user_name: user.full_name,
        content: forumInput
      })
      .then(() => {
        setForumInput("");
        fetchForum(activeCourseId);
      });
  };

  const handleSummarize = (lectureId) => {
    axios.post(`${API_BASE_URL}/api/v1/lectures/${lectureId}/summarize`).then((res) => {
      setAiSummary(res.data);
    });
  };

  const handleSendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages((prev) => [...prev, { sender: "user", text: userMsg }]);
    setChatInput("");

    axios
      .post(`${API_BASE_URL}/api/v1/courses/${activeCourseId}/chat`, { message: userMsg })
      .then((res) => {
        setChatMessages((prev) => [...prev, { sender: "ai", text: res.data.reply }]);
      });
  };

  // Dedicated Mobile-Friendly Authentication Screen
  if (!user) {
    return (
      <div className="app-container auth-page-wrapper">
        <div className="auth-card">
          {authView === "login" && (
            <>
              <h2 className="auth-card-title">Welcome Back</h2>
              <p className="auth-card-subtitle">Log in to continue your LMS learning path</p>
              <form onSubmit={handleAuth}>
                <div className="form-group">
                  <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-field" />
                </div>
                <div className="form-group">
                  <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input-field" />
                </div>
                <button type="submit" className="btn-primary auth-full-btn">Log In</button>
              </form>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "14px" }}>
                <button type="button" onClick={() => setAuthView("forgot")} className="btn-link">Forgot Password?</button>
                <button type="button" onClick={() => setAuthView("register")} className="btn-link">Register</button>
              </div>
            </>
          )}

          {authView === "register" && (
            <>
              <h2 className="auth-card-title">Create Account</h2>
              <p className="auth-card-subtitle">Register to receive your 6-digit OTP email code</p>
              <form onSubmit={handleAuth}>
                <div className="form-group">
                  <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="input-field" />
                </div>
                <div className="form-group">
                  <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-field" />
                </div>
                <div className="form-group">
                  <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input-field" />
                </div>
                <div className="form-group">
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="input-field">
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary auth-full-btn">Send OTP Code</button>
              </form>
              <p className="auth-footer-text">
                Already have an account? <button type="button" onClick={() => setAuthView("login")} className="btn-link">Log In</button>
              </p>
            </>
          )}

          {authView === "otp" && (
            <>
              <h2 className="auth-card-title">Verify OTP</h2>
              <p className="auth-card-subtitle">Enter the 6-digit verification code sent to <strong>{email}</strong></p>
              <form onSubmit={handleVerifyOTP}>
                <div className="form-group">
                  <input type="text" placeholder="6-Digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} required className="input-field" style={{ textAlign: "center", fontSize: "18px", letterSpacing: "4px" }} />
                </div>
                <button type="submit" className="btn-primary auth-full-btn">Verify OTP</button>
              </form>
              <p className="auth-footer-text">
                <button type="button" onClick={() => setAuthView("register")} className="btn-link">Back to Register</button>
              </p>
            </>
          )}

          {authView === "forgot" && (
            <>
              <h2 className="auth-card-title">Reset Password</h2>
              <p className="auth-card-subtitle">Enter your registered email to receive a password reset OTP</p>
              <form onSubmit={handleForgotPassword}>
                <div className="form-group">
                  <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-field" />
                </div>
                <button type="submit" className="btn-primary auth-full-btn">Send Reset OTP</button>
              </form>
              <p className="auth-footer-text">
                Remember your password? <button type="button" onClick={() => setAuthView("login")} className="btn-link">Log In</button>
              </p>
            </>
          )}

          {authView === "reset" && (
            <>
              <h2 className="auth-card-title">Set New Password</h2>
              <p className="auth-card-subtitle">Check your email for the reset code sent to <strong>{email}</strong></p>
              <form onSubmit={handleResetPassword}>
                <div className="form-group">
                  <input type="text" placeholder="6-Digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} required className="input-field" style={{ textAlign: "center", fontSize: "18px", letterSpacing: "4px" }} />
                </div>
                <div className="form-group">
                  <input type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="input-field" />
                </div>
                <button type="submit" className="btn-primary auth-full-btn">Update Password</button>
              </form>
              <p className="auth-footer-text">
                <button type="button" onClick={() => setAuthView("login")} className="btn-link">Back to Login</button>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Mobile-Responsive LMS Platform Dashboard
  return (
    <div className="app-container">
      <div className="card-wrapper">
        
        {/* Navigation Bar */}
        <div className="navbar">
          <h2 className="nav-title">LMS Platform</h2>
          <div>
            <span className="user-badge">🔥 {progress.current_streak} Day Streak | 👤 <strong>{user.full_name}</strong></span>
            <button onClick={handleLogout} className="btn-danger">Logout</button>
          </div>
        </div>

        {/* Catalog Search & Filtering */}
        <div className="catalog-bar">
          <input type="text" placeholder="Search courses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-field flex-2" />
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="input-field flex-1">
            <option value="All">All Categories</option>
            <option value="Computer Science">Computer Science</option>
          </select>
          <select value={selectedDifficulty} onChange={(e) => setSelectedDifficulty(e.target.value)} className="input-field flex-1">
            <option value="All">All Difficulties</option>
            <option value="Intermediate">Intermediate</option>
          </select>
        </div>

        {/* Course Selection Cards */}
        <div className="course-card-scroll">
          {courses.map((c) => (
            <div
              key={c._id}
              onClick={() => setActiveCourseId(c._id)}
              className={`course-item-card ${activeCourseId === c._id ? "active" : ""}`}
            >
              <strong className="course-card-title">{c.title}</strong>
              <div className="course-card-cat">{c.category}</div>
            </div>
          ))}
        </div>

        {/* Course Tree & Content Render */}
        {loading || !course ? (
          <div>Loading course structure...</div>
        ) : (
          <div>
            <h1>{course.title}</h1>
            <p>{course.description}</p>

            {/* Progress Analytics */}
            <div className="progress-container">
              <div className="progress-header">
                <span>Course Completion Progress</span>
                <span>{progress.percentage}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress.percentage}%` }}></div>
              </div>
            </div>

            <h2>Course Modules</h2>
            
            {course.modules?.map((mod) => (
              <details key={mod.module_id} open className="module-card">
                <summary className="module-title">{mod.title}</summary>
                
                <div style={{ marginTop: "12px" }}>
                  <h4 style={{ margin: "8px 0" }}>Lectures:</h4>
                  {mod.lectures?.map((lec) => {
                    const isCompleted = progress.completed_lectures?.includes(lec.lecture_id);
                    return (
                      <div key={lec.lecture_id} className="lecture-card">
                        <div className="lecture-card-header">
                          <span>🎥 {lec.title}</span>
                          {isCompleted && <span style={{ color: "#059669" }}>✓ Watched</span>}
                        </div>

                        {lec.video_url && (
                          <video controls>
                            <source src={lec.video_url} type="video/mp4" />
                          </video>
                        )}

                        <div className="action-row">
                          <button
                            onClick={() => handleMarkComplete(lec.lecture_id)}
                            disabled={isCompleted}
                            className="btn-secondary"
                          >
                            {isCompleted ? "✓ Completed" : "Mark as Watched"}
                          </button>
                          <button onClick={() => handleSummarize(lec.lecture_id)} className="btn-primary btn-purple">
                            ✨ AI Summary
                          </button>
                        </div>

                        <div className="action-row">
                          <input
                            type="text"
                            placeholder="Add timestamped note..."
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            className="input-field flex-1"
                          />
                          <button onClick={() => handleAddNote(lec.lecture_id)} className="btn-secondary">Save Note</button>
                        </div>
                      </div>
                    );
                  })}

                  <h4 style={{ margin: "14px 0 8px 0" }}>Quizzes:</h4>
                  {mod.quizzes?.map((quiz) => (
                    <div key={quiz.quiz_id} className="quiz-card">
                      <div style={{ fontWeight: "bold", color: "#6b21a8" }}>📝 {quiz.title}</div>
                      {quiz.questions?.map((q, qIdx) => (
                        <div key={qIdx} style={{ fontSize: "13px", marginTop: "6px" }}>
                          <p style={{ fontWeight: "600", margin: "4px 0" }}>{q.question_text}</p>
                          {q.options?.map((opt, optIdx) => (
                            <button
                              key={optIdx}
                              onClick={() => {
                                axios
                                  .post(`${API_BASE_URL}/api/v1/courses/${activeCourseId}/quizzes/grade`, {
                                    quiz_id: quiz.quiz_id,
                                    selected_option: optIdx,
                                  })
                                  .then((res) => alert(res.data.message));
                              }}
                              className="quiz-option-btn"
                              style={{ marginTop: "4px" }}
                            >
                              {optIdx + 1}. {typeof opt === "object" ? opt.text || JSON.stringify(opt) : String(opt)}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            ))}

            {aiSummary && (
              <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#f3e8ff", borderRadius: "8px" }}>
                <h3 style={{ margin: "0 0 6px 0", color: "#6b21a8", fontSize: "15px" }}>🤖 AI Lesson Summary</h3>
                <p style={{ fontSize: "13px", color: "#4c1d95" }}>{aiSummary.summary}</p>
              </div>
            )}

            <div className="forum-section">
              <h3>💬 Discussion Forum</h3>
              <form onSubmit={handleAddForumPost} style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={forumInput}
                  onChange={(e) => setForumInput(e.target.value)}
                  className="input-field flex-1"
                />
                <button type="submit" className="btn-secondary">Post</button>
              </form>
              <div style={{ marginTop: "10px" }}>
                {forumPosts.map((post) => (
                  <div key={post._id} className="forum-post-card">
                    <strong style={{ fontSize: "12px" }}>{post.user_name}</strong>
                    <div style={{ fontSize: "13px" }}>{post.content}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Mobile-Adjusted AI Tutor Chat */}
      <div className="chat-widget">
        {!chatOpen ? (
          <button onClick={() => setChatOpen(true)} className="chat-trigger-btn">💬 Ask AI Tutor</button>
        ) : (
          <div className="chat-box">
            <div className="chat-header">
              <strong>🤖 AI Tutor</strong>
              <button onClick={() => setChatOpen(false)} className="chat-close-btn">✕</button>
            </div>
            <div className="chat-body">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={msg.sender === "user" ? "chat-bubble-user" : "chat-bubble-ai"}>{msg.text}</div>
              ))}
            </div>
            <form onSubmit={handleSendChatMessage} className="chat-footer">
              <input type="text" placeholder="Ask a doubt..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} className="input-field flex-1" />
              <button type="submit" className="btn-secondary">Send</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;