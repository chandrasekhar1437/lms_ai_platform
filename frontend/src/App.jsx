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

  const [activeTab, setActiveTab] = useState("learn"); // 'learn', 'create_course', 'admin_panel'

  const [courses, setCourses] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(false);

  // Instructor Form States - Course Creation
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDesc, setNewCourseDesc] = useState("");
  const [newCourseCat, setNewCourseCat] = useState("Computer Science");
  const [newCourseDiff, setNewCourseDiff] = useState("Intermediate");

  // Instructor Form States - Modules & Video Uploads
  const [targetCourseId, setTargetCourseId] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [targetModuleId, setTargetModuleId] = useState("");
  const [lectureTitle, setLectureTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Admin View States
  const [allUsers, setAllUsers] = useState([]);
  const [pendingCourses, setPendingCourses] = useState([]);
  const [analytics, setAnalytics] = useState(null);

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

  const [activeCourseId, setActiveCourseId] = useState("");

  const getAuthHeader = () => {
    const token = localStorage.getItem("token") || localStorage.getItem("access_token");
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  };

  const fetchCatalog = () => {
    axios
      .get(`${API_BASE_URL}/api/v1/courses?category=${selectedCategory}&difficulty=${selectedDifficulty}&search=${searchQuery}`)
      .then((res) => {
        setCourses(res.data);
        if (res.data.length > 0 && !activeCourseId) {
          setActiveCourseId(res.data[0]._id);
          setTargetCourseId(res.data[0]._id);
        }
      })
      .catch((err) => console.error(err));
  };

  const fetchCourseTree = (courseId) => {
    if (!courseId) return;
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
    if (!courseId) return;
    axios
      .get(`${API_BASE_URL}/api/v1/courses/${courseId}/forum`)
      .then((res) => setForumPosts(res.data))
      .catch((err) => console.error(err));
  };

  // Admin Data Fetchers
  const fetchAdminData = () => {
    if (user?.role !== "admin") return;
    const config = getAuthHeader();
    axios.get(`${API_BASE_URL}/api/v1/admin/users`, config).then((res) => setAllUsers(res.data)).catch(console.error);
    axios.get(`${API_BASE_URL}/api/v1/admin/courses/pending`, config).then((res) => setPendingCourses(res.data)).catch(console.error);
    axios.get(`${API_BASE_URL}/api/v1/admin/analytics/overview`, config).then((res) => setAnalytics(res.data)).catch(console.error);
  };

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      if (parsedUser._id && activeCourseId) fetchProgress(parsedUser._id, activeCourseId);
    }
    fetchCatalog();
  }, []);

  useEffect(() => {
    if (activeCourseId) {
      fetchCourseTree(activeCourseId);
      fetchForum(activeCourseId);
      if (user?._id) fetchProgress(user._id, activeCourseId);
    }
  }, [activeCourseId, selectedCategory, selectedDifficulty, searchQuery]);

  useEffect(() => {
    if (activeTab === "admin_panel") {
      fetchAdminData();
    }
  }, [activeTab]);

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
          if (activeCourseId) fetchProgress(res.data.user._id, activeCourseId);
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
        if (activeCourseId) fetchProgress(res.data.user._id, activeCourseId);
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
    setActiveTab("learn");
  };

  // Instructor Action: Create Course
  const handleCreateCourse = (e) => {
    e.preventDefault();
    axios
      .post(
        `${API_BASE_URL}/api/v1/courses`,
        { title: newCourseTitle, description: newCourseDesc, category: newCourseCat, difficulty: newCourseDiff },
        getAuthHeader()
      )
      .then((res) => {
        alert("Course created successfully!");
        setNewCourseTitle("");
        setNewCourseDesc("");
        fetchCatalog();
      })
      .catch((err) => alert(err.response?.data?.detail || "Failed to create course"));
  };

  // Instructor Action: Add Module
  const handleAddModule = (e) => {
    e.preventDefault();
    if (!targetCourseId || !moduleTitle) return alert("Select a course and enter module title");
    axios
      .post(`${API_BASE_URL}/api/v1/courses/${targetCourseId}/modules`, { title: moduleTitle, order_index: 1 }, getAuthHeader())
      .then((res) => {
        alert("Module added successfully!");
        setModuleTitle("");
        fetchCourseTree(targetCourseId);
      })
      .catch((err) => alert(err.response?.data?.detail || "Failed to add module"));
  };

  // Instructor Action: Upload Lecture Video
  const handleUploadLecture = (e) => {
    e.preventDefault();
    if (!targetModuleId || !lectureTitle) return alert("Select module and enter lecture title");

    const formData = new FormData();
    formData.append("title", lectureTitle);
    if (selectedFile) {
      formData.append("file", selectedFile);
    }

    setUploading(true);
    axios
      .post(`${API_BASE_URL}/api/v1/modules/${targetModuleId}/lectures?title=${encodeURIComponent(lectureTitle)}`, formData, {
        headers: {
          ...getAuthHeader().headers,
          "Content-Type": "multipart/form-data"
        }
      })
      .then(() => {
        setUploading(false);
        alert("Video lecture uploaded successfully!");
        setLectureTitle("");
        setSelectedFile(null);
        if (activeCourseId) fetchCourseTree(activeCourseId);
      })
      .catch((err) => {
        setUploading(false);
        alert(err.response?.data?.detail || "Video upload failed");
      });
  };

  // Instructor/Admin Action: Delete Lecture Video
  const handleDeleteLecture = (moduleId, lectureId) => {
    if (!window.confirm("Are you sure you want to delete this lecture video?")) return;

    axios
      .delete(`${API_BASE_URL}/api/v1/modules/${moduleId}/lectures/${lectureId}`, getAuthHeader())
      .then(() => {
        alert("Lecture deleted successfully!");
        if (activeCourseId) fetchCourseTree(activeCourseId);
      })
      .catch((err) => alert(err.response?.data?.detail || "Failed to delete lecture"));
  };

  // Admin Actions
  const handleApproveCourse = (courseId, decision) => {
    axios
      .post(`${API_BASE_URL}/api/v1/admin/courses/${courseId}/approve`, { decision, comment: "Reviewed by admin" }, getAuthHeader())
      .then(() => {
        alert(`Course ${decision}!`);
        fetchAdminData();
        fetchCatalog();
      })
      .catch((err) => alert(err.response?.data?.detail || "Approval action failed"));
  };

  const handleUpdateRole = (targetUserId, newRole) => {
    axios
      .put(`${API_BASE_URL}/api/v1/admin/users/${targetUserId}/role`, { role: newRole }, getAuthHeader())
      .then(() => {
        alert(`User role updated to ${newRole}`);
        fetchAdminData();
      })
      .catch((err) => alert(err.response?.data?.detail || "Role update failed"));
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
  // Authentication Screen
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

  // Dashboard Interface
  return (
    <div className="app-container">
      <div className="card-wrapper">
        
        {/* Navigation Bar */}
        <div className="navbar">
          <h2 className="nav-title">LMS Platform</h2>
          <div>
            <span className="user-badge">
              🔥 {progress.current_streak} Day Streak | 👤 <strong>{user.full_name}</strong> ({user.role.toUpperCase()})
            </span>
            <button onClick={handleLogout} className="btn-danger">Logout</button>
          </div>
        </div>

        {/* Role-Based Navigation Bar */}
        <div style={{ display: "flex", gap: "10px", margin: "16px 0" }}>
          <button 
            onClick={() => setActiveTab("learn")} 
            className={`btn-secondary ${activeTab === "learn" ? "btn-primary" : ""}`}
          >
            📚 Student Catalog
          </button>

          {(user.role === "instructor" || user.role === "admin") && (
            <button 
              onClick={() => setActiveTab("create_course")} 
              className={`btn-secondary ${activeTab === "create_course" ? "btn-primary" : ""}`}
            >
              ➕ Course Authoring
            </button>
          )}

          {user.role === "admin" && (
            <button 
              onClick={() => setActiveTab("admin_panel")} 
              className={`btn-secondary ${activeTab === "admin_panel" ? "btn-primary" : ""}`}
            >
              ⚙️ Admin Panel
            </button>
          )}
        </div>

        {/* TAB 1: STUDENT CATALOG & PLAYER */}
        {activeTab === "learn" && (
          <>
            <div className="catalog-bar">
              <input type="text" placeholder="Search courses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-field flex-2" />
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="input-field flex-1">
                <option value="All">All Categories</option>
                <option value="Computer Science">Computer Science</option>
                <option value="Data Science">Data Science</option>
              </select>
              <select value={selectedDifficulty} onChange={(e) => setSelectedDifficulty(e.target.value)} className="input-field flex-1">
                <option value="All">All Difficulties</option>
                <option value="Intermediate">Intermediate</option>
              </select>
            </div>

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

            {loading || !course ? (
              <div>Loading course structure...</div>
            ) : (
              <div>
                <h1>{course.title}</h1>
                <p>{course.description}</p>

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
                
                {course.modules?.length === 0 ? (
                  <p style={{ color: "#64748b", margin: "12px 0" }}>No modules added yet for this course.</p>
                ) : (
                  course.modules?.map((mod) => (
                    <details key={mod.module_id} open className="module-card">
                      <summary className="module-title">{mod.title}</summary>
                      
                      <div style={{ marginTop: "12px" }}>
                        <h4 style={{ margin: "8px 0" }}>Lectures:</h4>
                        {mod.lectures?.length === 0 ? (
                          <p style={{ fontSize: "13px", color: "#94a3b8" }}>No lecture videos uploaded yet.</p>
                        ) : (
                          mod.lectures?.map((lec) => {
                            const isCompleted = progress.completed_lectures?.includes(lec.lecture_id);
                            const videoSource = lec.video_url?.startsWith("http") 
                              ? lec.video_url 
                              : `${API_BASE_URL}${lec.video_url}`;

                            return (
                              <div key={lec.lecture_id} className="lecture-card">
                                <div className="lecture-card-header">
                                  <span>🎥 {lec.title}</span>
                                  {isCompleted && <span style={{ color: "#059669" }}>✓ Watched</span>}
                                </div>

                                {lec.video_url && (
                                  <video controls style={{ width: "100%", borderRadius: "8px", margin: "10px 0" }}>
                                    <source src={videoSource} type="video/mp4" />
                                  </video>
                                )}

                                <div className="action-row" style={{ marginTop: "8px" }}>
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

                                  {(user.role === "admin" || user.role === "instructor") && (
                                    <button
                                      onClick={() => handleDeleteLecture(mod.module_id, lec.lecture_id)}
                                      className="btn-danger"
                                      style={{ padding: "6px 12px" }}
                                    >
                                      🗑️ Delete Video
                                    </button>
                                  )}
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
                          })
                        )}

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
                  ))
                )}

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
          </>
        )}

        {/* TAB 2: INSTRUCTOR COURSE & LECTURE AUTHORING */}
        {activeTab === "create_course" && (user.role === "instructor" || user.role === "admin") && (
          <div style={{ padding: "16px", backgroundColor: "#ffffff", borderRadius: "8px", marginTop: "12px", border: "1px solid #e2e8f0" }}>
            
            {/* Form 1: Create Course */}
            <h2>1. Create New Course</h2>
            <form onSubmit={handleCreateCourse} style={{ marginBottom: "32px" }}>
              <div className="form-group">
                <input type="text" placeholder="Course Title" value={newCourseTitle} onChange={(e) => setNewCourseTitle(e.target.value)} required className="input-field" />
              </div>
              <div className="form-group">
                <textarea placeholder="Course Description" value={newCourseDesc} onChange={(e) => setNewCourseDesc(e.target.value)} required className="input-field" rows={3} />
              </div>
              <div className="form-group" style={{ display: "flex", gap: "10px" }}>
                <select value={newCourseCat} onChange={(e) => setNewCourseCat(e.target.value)} className="input-field flex-1">
                  <option value="Computer Science">Computer Science</option>
                  <option value="Data Science">Data Science</option>
                  <option value="Web Development">Web Development</option>
                </select>
                <select value={newCourseDiff} onChange={(e) => setNewCourseDiff(e.target.value)} className="input-field flex-1">
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
              <button type="submit" className="btn-primary auth-full-btn">Submit Course</button>
            </form>

            <hr style={{ margin: "24px 0", borderTop: "1px solid #e2e8f0" }} />

            {/* Form 2: Add Module */}
            <h2>2. Add Module to Course</h2>
            <form onSubmit={handleAddModule} style={{ marginBottom: "32px" }}>
              <div className="form-group">
                <label style={{ fontSize: "14px", fontWeight: "600", display: "block", marginBottom: "6px" }}>Select Course:</label>
                <select value={targetCourseId} onChange={(e) => setTargetCourseId(e.target.value)} className="input-field" required>
                  <option value="">-- Choose Course --</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>{c.title} ({c.category})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <input type="text" placeholder="Module Title (e.g., Module 1: Basics)" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} required className="input-field" />
              </div>
              <button type="submit" className="btn-primary auth-full-btn">Add Module</button>
            </form>

            <hr style={{ margin: "24px 0", borderTop: "1px solid #e2e8f0" }} />

            {/* Form 3: Upload Video Lecture */}
            <h2>3. Upload Video Lecture to Module</h2>
            <form onSubmit={handleUploadLecture}>
              <div className="form-group">
                <label style={{ fontSize: "14px", fontWeight: "600", display: "block", marginBottom: "6px" }}>Select Module:</label>
                <select value={targetModuleId} onChange={(e) => setTargetModuleId(e.target.value)} className="input-field" required>
                  <option value="">-- Choose Module --</option>
                  {course?.modules?.map((m) => (
                    <option key={m.module_id} value={m.module_id}>{m.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <input type="text" placeholder="Lecture Title (e.g., 1.1 Intro Video)" value={lectureTitle} onChange={(e) => setLectureTitle(e.target.value)} required className="input-field" />
              </div>
              <div className="form-group">
                <label style={{ fontSize: "14px", fontWeight: "600", display: "block", marginBottom: "6px" }}>Attach Video File (.mp4):</label>
                <input type="file" accept="video/mp4,video/*" onChange={(e) => setSelectedFile(e.target.files[0])} className="input-field" />
              </div>
              <button type="submit" disabled={uploading} className="btn-primary auth-full-btn">
                {uploading ? "Uploading Video..." : "Upload Lecture Video"}
              </button>
            </form>

          </div>
        )}

        {/* TAB 3: ADMIN GOVERNANCE PANEL */}
        {activeTab === "admin_panel" && user.role === "admin" && (
          <div style={{ padding: "16px", backgroundColor: "#ffffff", borderRadius: "8px", marginTop: "12px", border: "1px solid #e2e8f0" }}>
            <h2>Platform Governance Dashboard</h2>

            {/* Platform Metrics */}
            {analytics && (
              <div style={{ display: "flex", gap: "10px", margin: "16px 0" }}>
                <div style={{ background: "#e0f2fe", padding: "12px", borderRadius: "6px", flex: 1 }}>
                  <h3>Users</h3>
                  <strong>{analytics.total_users}</strong>
                </div>
                <div style={{ background: "#dcfce7", padding: "12px", borderRadius: "6px", flex: 1 }}>
                  <h3>Courses</h3>
                  <strong>{analytics.total_courses}</strong>
                </div>
                <div style={{ background: "#fef3c7", padding: "12px", borderRadius: "6px", flex: 1 }}>
                  <h3>Enrollments</h3>
                  <strong>{analytics.total_enrollments}</strong>
                </div>
              </div>
            )}

            {/* Pending Approvals */}
            <h3>Pending Course Approvals</h3>
            {pendingCourses.length === 0 ? <p style={{ fontSize: "13px", color: "#64748b" }}>No courses awaiting approval.</p> : (
              pendingCourses.map((pc) => (
                <div key={pc._id} style={{ padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", marginBottom: "8px" }}>
                  <strong>{pc.title}</strong> - {pc.category} ({pc.difficulty})
                  <div style={{ marginTop: "6px" }}>
                    <button onClick={() => handleApproveCourse(pc._id, "approved")} className="btn-primary" style={{ marginRight: "6px", width: "auto", padding: "6px 12px" }}>Approve</button>
                    <button onClick={() => handleApproveCourse(pc._id, "rejected")} className="btn-danger">Reject</button>
                  </div>
                </div>
              ))
            )}

            {/* User Governance */}
            <h3 style={{ marginTop: "20px" }}>User Role Management</h3>
            {allUsers.map((u) => (
              <div key={u._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                <span>{u.full_name} ({u.email})</span>
                <select value={u.role} onChange={(e) => handleUpdateRole(u._id, e.target.value)} className="input-field" style={{ width: "auto" }}>
                  <option value="student">Student</option>
                  <option value="instructor">Instructor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* AI Tutor Floating Widget */}
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