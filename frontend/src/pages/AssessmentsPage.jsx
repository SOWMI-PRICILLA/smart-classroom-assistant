import React, { useState, useEffect } from "react";
import { 
    getGlobalQuizzes, getGlobalSubmissions, submitRagQuiz, 
    getSessionsBySubject, generateSubjectQuizPreview, 
    saveQuiz, resetStudentSubmission, deleteQuiz, updateQuiz
} from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useSubjects } from "../contexts/SubjectsContext";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Trophy, Sparkles, Clock, CheckCircle, 
    X, Loader2, BookOpen, ChevronRight, 
    HelpCircle, User, BarChart3, AlertCircle, Plus,
    Trash2, Edit3, Save, RotateCcw, TrendingUp, 
    Award, Target, Users, FileText, ChevronDown
} from "lucide-react";

export default function AssessmentsPage() {
    const { user } = useAuth();
    const [quizzes, setQuizzes] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("available");
    
    // Quiz Taking State
    const [takingQuiz, setTakingQuiz] = useState(null);
    const [ragAnswers, setRagAnswers] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionResult, setSubmissionResult] = useState(null);

    // Generation Modal State
    const [showGenModal, setShowGenModal] = useState(false);
    const [genStep, setGenStep] = useState(1);
    const { subjects, refreshSubjects } = useSubjects();
    const [subjectSessions, setSubjectSessions] = useState([]);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [selectedSessionIds, setSelectedSessionIds] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewQuestions, setPreviewQuestions] = useState([]);
    const [previewTitle, setPreviewTitle] = useState("");

    // Teacher Detail Modals
    const [viewingSubmission, setViewingSubmission] = useState(null);
    
    // Delete Confirmation State
    const [deletingQuiz, setDeletingQuiz] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Edit Quiz State
    const [editingQuiz, setEditingQuiz] = useState(null);
    const [editTitle, setEditTitle] = useState("");
    const [editQuestions, setEditQuestions] = useState([]);
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Expanded submission detail for students
    const [expandedSubmission, setExpandedSubmission] = useState(null);

    useEffect(() => {
        fetchData();
    }, [user]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [qData, sData] = await Promise.all([
                getGlobalQuizzes(),
                getGlobalSubmissions()
            ]);
            setQuizzes(Array.isArray(qData) ? qData : []);
            setSubmissions(Array.isArray(sData) ? sData : []);
            if (user?.role === "teacher") setActiveTab("my-quizzes");
        } catch (err) {
            console.error("Failed to fetch assessment data:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleStartQuiz = (quiz) => {
        setTakingQuiz(quiz);
        setRagAnswers({});
        setSubmissionResult(null);
    };

    const handleSubmitQuiz = async () => {
        if (!takingQuiz) return;
        setIsSubmitting(true);
        try {
            const result = await submitRagQuiz(takingQuiz.quiz_id, ragAnswers);
            setSubmissionResult(result);
            fetchData();
        } catch (err) {
            console.error("Submission failed:", err);
            alert("Failed to submit assessment. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGenerateSubjectQuizPreview = async () => {
        setIsGenerating(true);
        try {
            const preview = await generateSubjectQuizPreview(selectedSubject.subject_id, selectedSessionIds);
            if (!preview || !preview.questions) {
                throw new Error(preview?.detail || "Invalid response from server");
            }
            setPreviewTitle(preview.title);
            setPreviewQuestions(preview.questions);
            setGenStep(3);
        } catch (err) {
            console.error("Generation failed:", err);
            alert(`Assessment generation failed: ${err.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveQuiz = async () => {
        setIsGenerating(true);
        try {
            await saveQuiz({
                subject_id: selectedSubject.subject_id,
                session_ids: selectedSessionIds,
                title: previewTitle,
                questions: previewQuestions
            });
            setShowGenModal(false);
            fetchData();
        } catch (err) {
            console.error("Quiz save failed:", err);
            alert("Could not save the quiz.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSubjectSelect = async (subject) => {
        setSelectedSubject(subject);
        setGenStep(2);
        try {
            const data = await getSessionsBySubject(subject.subject_id);
            setSubjectSessions((Array.isArray(data) ? data : []).filter(s => s.status === 'finished' || s.status === 'completed'));
            setSelectedSessionIds([]);
        } catch (err) {
            console.error("Failed to fetch subject sessions:", err);
        }
    };

    const toggleSessionId = (id) => {
        setSelectedSessionIds(prev => 
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const handleResetSubmission = async (quizId, studentEmail) => {
        if (!window.confirm(`Reset access for ${studentEmail}? This deletes their current score.`)) return;
        try {
            await resetStudentSubmission(quizId, studentEmail);
            fetchData();
        } catch (err) {
            alert("Failed to reset access.");
        }
    };

    // --- Delete Quiz ---
    const handleDeleteQuiz = async () => {
        if (!deletingQuiz) return;
        setIsDeleting(true);
        try {
            await deleteQuiz(deletingQuiz.quiz_id);
            setDeletingQuiz(null);
            fetchData();
        } catch (err) {
            alert("Failed to delete assessment.");
        } finally {
            setIsDeleting(false);
        }
    };

    // --- Edit Quiz ---
    const openEditModal = (quiz) => {
        setEditingQuiz(quiz);
        setEditTitle(quiz.title);
        setEditQuestions(JSON.parse(JSON.stringify(quiz.questions || []))); // deep copy
    };

    const handleSaveEdit = async () => {
        setIsSavingEdit(true);
        try {
            await updateQuiz(editingQuiz.quiz_id, { title: editTitle, questions: editQuestions });
            setEditingQuiz(null);
            fetchData();
        } catch (err) {
            alert("Failed to save changes.");
        } finally {
            setIsSavingEdit(false);
        }
    };

    const addNewQuestion = () => {
        setEditQuestions(prev => [...prev, {
            id: `q_${Date.now()}`,
            type: "short_answer",
            question: "",
            max_points: 5,
            options: []
        }]);
    };

    const removeQuestion = (idx) => {
        setEditQuestions(prev => prev.filter((_, i) => i !== idx));
    };

    const updateQuestion = (idx, field, value) => {
        setEditQuestions(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], [field]: value };
            return updated;
        });
    };

    const toggleGenModal = async () => {
        if (!showGenModal) {
            setGenStep(1);
            setSelectedSubject(null);
            setSelectedSessionIds([]);
            refreshSubjects(true);
        }
        setShowGenModal(!showGenModal);
    };

    const formatDate = (dateStr) => {
        try {
            if (!dateStr) return "N/A";
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return "Recent";
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) { return "N/A"; }
    };

    const isSubmitted = (quizId) => submissions.some(s => s.quiz_id === quizId);
    const getSubmission = (quizId) => submissions.find(s => s.quiz_id === quizId);
    const getSubjectName = (subjectId) => {
        const flat = Object.values(subjects || {}).flatMap(dept => 
            Object.values(dept).flatMap(year => Object.values(year).flat())
        );
        return flat.find(s => s.subject_id === subjectId)?.subject_name || subjectId?.substring(0,12) + "...";
    };

    // Stats computations for teacher
    const totalParticipants = new Set(submissions.map(s => s.student_email)).size;
    const overallAvg = submissions.length > 0 
        ? (submissions.reduce((acc, s) => acc + (s.total_score / (s.max_score || 1)) * 100, 0) / submissions.length).toFixed(1)
        : "0.0";

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 bg-soft-50">
                <Loader2 className="w-12 h-12 text-primary-500 animate-spin mb-4" />
                <p className="text-soft-500 font-bold uppercase tracking-widest text-xs">Synchronizing Assessments...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto h-full flex flex-col pb-12">
            {/* Header */}
            <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-primary-600 p-2.5 rounded-2xl text-white shadow-soft-lg">
                            <Trophy className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-soft-900 tracking-tight">Assessment Hub</h1>
                            <p className="text-soft-500 font-medium tracking-wide uppercase text-[10px]">Grounded Learning Verification</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {user?.role === "teacher" && (
                        <button 
                            onClick={toggleGenModal}
                            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Create New Assessment
                        </button>
                    )}

                    <div className="flex p-1.5 bg-white border border-soft-200 rounded-2xl shadow-soft-sm">
                        {user?.role === "student" ? (
                            <>
                                <button 
                                    onClick={() => setActiveTab("available")}
                                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === "available" ? "bg-primary-500 text-white shadow-soft" : "text-soft-500 hover:text-soft-800"}`}
                                >
                                    Available Quizzes
                                </button>
                                <button 
                                    onClick={() => setActiveTab("completed")}
                                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === "completed" ? "bg-primary-500 text-white shadow-soft" : "text-soft-500 hover:text-soft-800"}`}
                                >
                                    Graded Results
                                </button>
                            </>
                        ) : (
                            <>
                                <button 
                                    onClick={() => setActiveTab("my-quizzes")}
                                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === "my-quizzes" ? "bg-indigo-600 text-white shadow-soft" : "text-soft-500 hover:text-soft-800"}`}
                                >
                                    My Assessments
                                </button>
                                <button 
                                    onClick={() => setActiveTab("stats")}
                                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === "stats" ? "bg-indigo-600 text-white shadow-soft" : "text-soft-500 hover:text-soft-800"}`}
                                >
                                    Performance Stats
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 px-2">
                <AnimatePresence mode="wait">
                    {takingQuiz ? (
                        // ── Quiz Taking Mode ──
                        <motion.div 
                            key="quiz-mode"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-[2.5rem] border border-soft-100 shadow-soft-xl overflow-hidden flex flex-col"
                        >
                            <div className="p-8 border-b border-soft-100 bg-soft-50/50 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setTakingQuiz(null)} className="p-2.5 bg-white rounded-xl text-soft-500 hover:text-soft-900 border border-soft-100 shadow-sm transition-all">
                                        <X className="w-4 h-4" />
                                    </button>
                                    <div>
                                        <h3 className="font-black text-soft-900 leading-tight">{takingQuiz.title}</h3>
                                        <p className="text-[10px] text-soft-400 font-bold uppercase tracking-widest">{getSubjectName(takingQuiz.subject_id)}</p>
                                    </div>
                                </div>
                                {!submissionResult && (
                                    <div className="px-5 py-2.5 bg-white border border-soft-100 rounded-2xl flex items-center gap-2">
                                        <AlertCircle className="w-3.5 h-3.5 text-primary-500" />
                                        <span className="text-[10px] font-black text-soft-500 uppercase tracking-wider">Source: Lecture Transcript</span>
                                    </div>
                                )}
                            </div>

                            <div className="p-8 overflow-y-auto max-h-[70vh] custom-scrollbar space-y-8 bg-soft-50/20">
                                {submissionResult ? (
                                    <div className="space-y-8 max-w-3xl mx-auto py-8">
                                        <div className="bg-emerald-50 border border-emerald-100 rounded-[2.5rem] p-12 text-center shadow-soft-sm relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-8 opacity-10"><Trophy className="w-32 h-32" /></div>
                                            <div className="w-20 h-20 bg-emerald-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30 rotate-3">
                                                <Trophy className="w-10 h-10" />
                                            </div>
                                            <h4 className="font-black text-emerald-900 text-3xl mb-2">Assessment Complete!</h4>
                                            <p className="text-emerald-700 font-bold mb-8">Your submission has been graded and recorded.</p>
                                            <div className="bg-white/60 p-6 rounded-3xl backdrop-blur-sm border border-emerald-100/50 inline-block px-12">
                                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">Total Score</p>
                                                <p className="text-4xl font-black text-emerald-900">{submissionResult.score} <span className="text-xl text-emerald-500">/ {submissionResult.max_score || 10}</span></p>
                                            </div>
                                            <div className="mt-12 pt-8 border-t border-emerald-100">
                                                <button onClick={() => { setTakingQuiz(null); setSubmissionResult(null); }} className="px-10 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                                                    Back to Assessment Hub
                                                </button>
                                            </div>
                                        </div>

                                        {submissionResult.results?.map((res, idx) => (
                                            <div key={idx} className={`bg-white rounded-[2rem] border p-8 shadow-soft-sm ${res.score >= (res.max_points || 10) / 2 ? 'border-emerald-100' : 'border-red-100'}`}>
                                                <div className="flex gap-6 items-start">
                                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${res.score >= (res.max_points || 10) / 2 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                        {res.score >= (res.max_points || 10) / 2 ? <CheckCircle className="w-6 h-6" /> : <X className="w-6 h-6" />}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start mb-3">
                                                            <p className="text-[10px] font-black text-soft-400 uppercase tracking-widest">Question {idx + 1}</p>
                                                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${res.score >= (res.max_points || 10) / 2 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                                Score: {res.score}/{res.max_points || 10}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-soft-800 font-bold mb-6">{res.feedback}</p>
                                                        {(res.evidence || res.teacher_quote) && (
                                                            <div className="bg-primary-50/50 border border-primary-100/50 rounded-2xl p-5">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <Sparkles className="w-3.5 h-3.5 text-primary-500" />
                                                                    <span className="text-[9px] font-black text-primary-600 uppercase tracking-wider">From Teacher's Explanation</span>
                                                                </div>
                                                                <p className="text-xs text-primary-900 italic font-medium leading-relaxed">"{res.evidence || res.teacher_quote}"</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-6 max-w-3xl mx-auto">
                                        {takingQuiz.questions?.map((q, qIndex) => (
                                            <div key={q.id || qIndex} className="bg-white rounded-3xl border border-soft-100 p-6 shadow-sm">
                                                <div className="flex gap-4 items-start">
                                                    <div className="w-8 h-8 rounded-xl bg-soft-50 text-soft-400 flex items-center justify-center font-bold text-xs flex-shrink-0 border border-soft-100">{qIndex + 1}</div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <p className="text-sm font-bold text-soft-900">{q.question}</p>
                                                            <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider ml-4 shrink-0">{q.max_points || '?'} pts</span>
                                                        </div>
                                                        {q.type === "mcq" ? (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                {q.options?.map((opt, oIndex) => (
                                                                    <button 
                                                                        key={oIndex} 
                                                                        onClick={() => setRagAnswers(prev => ({...prev, [q.id]: oIndex}))}
                                                                        className={`p-4 rounded-2xl text-left text-xs transition-all border-2 ${ragAnswers[q.id] === oIndex ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-soft-50 bg-soft-50 hover:bg-soft-100 text-soft-600'}`}
                                                                    >
                                                                        <span className="font-bold mr-2">{String.fromCharCode(65 + oIndex)}.</span> {opt}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <textarea 
                                                                value={ragAnswers[q.id] || ""} 
                                                                onChange={(e) => setRagAnswers(prev => ({...prev, [q.id]: e.target.value}))}
                                                                className="w-full bg-soft-50 border border-soft-100 rounded-2xl p-4 text-xs focus:ring-2 focus:ring-primary-500/20 focus:outline-none min-h-[100px]"
                                                                placeholder="Type your answer based on what was taught..."
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        <div className="flex justify-end pt-6">
                                            <button
                                                onClick={handleSubmitQuiz}
                                                disabled={isSubmitting}
                                                className="px-10 py-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary-500/20 transition-all active:scale-95 flex items-center gap-2"
                                            >
                                                {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Grading...</> : <><CheckCircle className="w-4 h-4" /> Submit Assessment</>}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="dashboard"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-8"
                        >
                            {/* ── TEACHER STATS SUMMARY BAR ── */}
                            {user?.role === "teacher" && activeTab === "my-quizzes" && (
                                <div className="grid grid-cols-3 gap-5">
                                    {[
                                        { label: "Total Assessments", value: quizzes.length, icon: FileText, color: "indigo" },
                                        { label: "Total Participants", value: totalParticipants, icon: Users, color: "emerald" },
                                        { label: "Average Score %", value: `${overallAvg}%`, icon: TrendingUp, color: "primary" }
                                    ].map(({ label, value, icon: Icon, color }) => (
                                        <div key={label} className={`bg-white border border-${color}-100 rounded-[2rem] p-6 shadow-soft-sm flex items-center gap-5`}>
                                            <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600`}><Icon className="w-6 h-6" /></div>
                                            <div>
                                                <p className="text-[9px] font-black text-soft-400 uppercase tracking-widest mb-1">{label}</p>
                                                <p className="text-2xl font-black text-soft-900">{value}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ── EMPTY STATES ── */}
                            {((activeTab === "available" && quizzes.filter(q => !isSubmitted(q.quiz_id)).length === 0) ||
                              (activeTab === "completed" && submissions.length === 0) ||
                              (user?.role === "teacher" && activeTab === "my-quizzes" && quizzes.length === 0)) && (
                                <div className="bg-white rounded-[2.5rem] border border-soft-100 p-20 text-center shadow-soft-sm">
                                    <div className="w-24 h-24 bg-soft-50 rounded-full flex items-center justify-center mx-auto mb-8">
                                        <BookOpen className="w-10 h-10 text-soft-300" />
                                    </div>
                                    <h4 className="font-black text-soft-900 text-xl mb-3 leading-tight">Nothing here yet</h4>
                                    <p className="text-sm text-soft-500 max-w-sm mx-auto mb-6 font-medium leading-relaxed">
                                        {user?.role === "teacher" 
                                            ? "You haven't generated any assessments yet. Click 'Create New Assessment' to begin."
                                            : activeTab === "available" && submissions.length > 0
                                                ? "You've completed all available assessments! Check your Graded Results."
                                                : "No active assessments are waiting for your response."}
                                    </p>
                                    {user?.role === "student" && activeTab === "available" && submissions.length > 0 && (
                                        <button onClick={() => setActiveTab("completed")} className="px-6 py-2.5 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary-500/20 transition-all hover:bg-primary-700 active:scale-95">
                                            View Graded Results
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* ── STUDENT: AVAILABLE QUIZZES ── */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {activeTab === "available" && quizzes.filter(q => !isSubmitted(q.quiz_id)).map((quiz) => (
                                    <motion.div 
                                        whileHover={{ y: -5 }}
                                        key={quiz.quiz_id} 
                                        onClick={() => handleStartQuiz(quiz)}
                                        className="bg-white rounded-[2.5rem] border border-soft-100 p-8 shadow-soft-sm transition-all border-b-4 border-b-primary-500/20 hover:shadow-soft-xl cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-start mb-10">
                                            <div className="bg-primary-50 p-4 rounded-[1.5rem] group-hover:scale-110 transition-transform">
                                                <Sparkles className="w-6 h-6 text-primary-500" />
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] font-black text-primary-600 uppercase tracking-widest bg-primary-50 px-3 py-1.5 rounded-full mb-2">Active</span>
                                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-soft-400 uppercase">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDate(quiz.created_at)}
                                                </div>
                                            </div>
                                        </div>
                                        <h4 className="text-lg font-black text-soft-900 mb-2 leading-tight group-hover:text-primary-700 transition-colors">{quiz.title}</h4>
                                        <p className="text-xs text-indigo-600 font-bold mb-8 bg-indigo-50 inline-block px-3 py-1 rounded-lg border border-indigo-100">{getSubjectName(quiz.subject_id)}</p>
                                        <div className="flex items-center justify-between pt-6 border-t border-soft-50">
                                            <span className="text-[10px] font-black text-soft-400 uppercase tracking-wider">{quiz.questions?.length || 0} Questions · {quiz.total_max_points || "?"} pts</span>
                                            <div className="flex items-center gap-1 text-primary-600 font-black text-[10px] uppercase tracking-widest group-hover:gap-3 transition-all">
                                                Start Assessment <ChevronRight className="w-3 h-3" />
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}

                                {/* ── STUDENT: GRADED RESULTS ── */}
                                {activeTab === "completed" && submissions.map((sub) => (
                                    <div key={sub.submission_id || sub.quiz_id} className="bg-white rounded-[2.5rem] border border-emerald-100 shadow-soft-sm border-b-4 border-b-emerald-500/20 overflow-hidden">
                                        <div className="p-8">
                                            <div className="flex justify-between items-start mb-8">
                                                <div className="bg-emerald-50 p-4 rounded-[1.5rem]">
                                                    <Award className="w-6 h-6 text-emerald-500" />
                                                </div>
                                                <div className="flex flex-col items-end text-right">
                                                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-full mb-2">Graded</span>
                                                    <span className="text-xl font-black text-emerald-900">{sub.total_score} <span className="text-sm font-bold text-soft-400">/ {sub.max_score || 10}</span></span>
                                                </div>
                                            </div>
                                            <h4 className="text-base font-black text-soft-900 mb-1 leading-tight">{sub.quiz_title || "Assessment Record"}</h4>
                                            <p className="text-xs text-soft-400 font-bold uppercase tracking-widest mb-4">{getSubjectName(sub.subject_id)}</p>
                                            
                                            {/* Mini score bar */}
                                            <div className="w-full bg-soft-50 rounded-full h-2 mb-6 overflow-hidden border border-soft-100">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all"
                                                    style={{ width: `${Math.min(100, (sub.total_score / (sub.max_score || 1)) * 100)}%` }}
                                                />
                                            </div>
                                            
                                            <div className="flex items-center justify-between pt-4 border-t border-soft-50">
                                                <span className="text-[9px] font-black text-soft-400 uppercase tracking-wider">{formatDate(sub.submitted_at)}</span>
                                                <button 
                                                    onClick={() => setExpandedSubmission(expandedSubmission === sub.submission_id ? null : sub.submission_id)}
                                                    className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest"
                                                >
                                                    {expandedSubmission === sub.submission_id ? "Collapse" : "Review Details"} 
                                                    <ChevronDown className={`w-3 h-3 transition-transform ${expandedSubmission === sub.submission_id ? 'rotate-180' : ''}`} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expandable detail */}
                                        <AnimatePresence>
                                            {expandedSubmission === sub.submission_id && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="px-8 pb-8 space-y-4 border-t border-soft-50 pt-6 bg-soft-50/30">
                                                        {sub.results?.map((res, idx) => (
                                                            <div key={idx} className={`p-4 rounded-2xl border text-xs ${res.score >= (res.max_points || 10) / 2 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
                                                                <div className="flex justify-between items-center mb-1.5">
                                                                    <span className="font-black text-soft-600 uppercase tracking-wider">Q{idx + 1}</span>
                                                                    <span className={`font-black ${res.score >= (res.max_points || 10) / 2 ? 'text-emerald-700' : 'text-red-700'}`}>{res.score}/{res.max_points || 10} pts</span>
                                                                </div>
                                                                <p className="text-soft-700 font-medium leading-relaxed">{res.feedback}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}

                                {/* ── TEACHER: MY ASSESSMENTS ── */}
                                {user?.role === "teacher" && activeTab === "my-quizzes" && quizzes.map((quiz) => {
                                    const quizSubs = submissions.filter(s => s.quiz_id === quiz.quiz_id);
                                    const avgScore = quizSubs.length > 0 
                                        ? (quizSubs.reduce((acc, s) => acc + s.total_score, 0) / quizSubs.length).toFixed(1) 
                                        : null;
                                    return (
                                        <div key={quiz.quiz_id} className="bg-white rounded-[2.5rem] border border-indigo-100 p-8 shadow-soft-sm border-b-4 border-b-indigo-500/20 flex flex-col">
                                            {/* Card header */}
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="bg-indigo-50 p-4 rounded-[1.5rem]">
                                                    <Sparkles className="w-6 h-6 text-indigo-500" />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {/* Edit button */}
                                                    <button
                                                        onClick={() => openEditModal(quiz)}
                                                        className="p-2.5 rounded-xl bg-soft-50 hover:bg-indigo-50 text-soft-400 hover:text-indigo-600 border border-transparent hover:border-indigo-100 transition-all"
                                                        title="Edit Assessment"
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    {/* Delete button */}
                                                    <button
                                                        onClick={() => setDeletingQuiz(quiz)}
                                                        className="p-2.5 rounded-xl bg-soft-50 hover:bg-red-50 text-soft-400 hover:text-red-600 border border-transparent hover:border-red-100 transition-all"
                                                        title="Delete Assessment"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            <h4 className="text-lg font-black text-soft-900 mb-1 leading-tight">{quiz.title}</h4>
                                            <p className="text-xs text-indigo-600 font-bold mb-1 uppercase tracking-widest">{getSubjectName(quiz.subject_id)}</p>
                                            <p className="text-[9px] text-soft-400 font-bold uppercase tracking-widest mb-6">{formatDate(quiz.created_at)} · {quiz.questions?.length || 0} Questions · {quiz.total_max_points || "?"} pts</p>

                                            {/* Stats grid */}
                                            <div className="grid grid-cols-2 gap-4 pb-6">
                                                <div className="p-4 bg-soft-50 rounded-[1.5rem] border border-soft-100 text-center">
                                                    <p className="text-[9px] font-black text-soft-400 uppercase tracking-widest mb-1">Participants</p>
                                                    <p className="text-xl font-black text-soft-900">{quizSubs.length}</p>
                                                </div>
                                                <div className="p-4 bg-soft-50 rounded-[1.5rem] border border-soft-100 text-center">
                                                    <p className="text-[9px] font-black text-soft-400 uppercase tracking-widest mb-1">Avg Score</p>
                                                    <p className="text-xl font-black text-indigo-600">{avgScore ?? "–"}</p>
                                                </div>
                                            </div>

                                            {/* Submission list */}
                                            <div className="mt-auto pt-4 border-t border-soft-100">
                                                <p className="text-[10px] font-black text-soft-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <User className="w-3 h-3" /> Recent Submissions
                                                </p>
                                                <div className="space-y-3 max-h-44 overflow-y-auto custom-scrollbar pr-2">
                                                    {quizSubs.slice(0, 5).map((sub, sIdx) => (
                                                        <div key={sIdx} className="flex items-center justify-between p-3 bg-soft-50/50 rounded-xl border border-soft-100 text-[10px]">
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="font-black text-soft-900 truncate">{sub.student_name}</span>
                                                                <span className="text-soft-400 font-bold truncate">{sub.student_email}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 ml-3 shrink-0">
                                                                <span className={`font-black ${sub.total_score >= (sub.max_score || 10) * 0.8 ? 'text-emerald-600' : sub.total_score >= (sub.max_score || 10) * 0.5 ? 'text-indigo-600' : 'text-red-600'}`}>
                                                                    {sub.total_score}/{sub.max_score || 10}
                                                                </span>
                                                                <button onClick={() => setViewingSubmission(sub)} className="p-1.5 hover:bg-indigo-50 text-soft-300 hover:text-indigo-500 rounded-lg transition-colors border border-transparent hover:border-indigo-100" title="View Details">
                                                                    <BookOpen className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={() => handleResetSubmission(quiz.quiz_id, sub.student_email)} className="p-1.5 hover:bg-orange-50 text-soft-300 hover:text-orange-500 rounded-lg transition-colors border border-transparent hover:border-orange-100" title="Reset & Allow Retake">
                                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {quizSubs.length === 0 && (
                                                        <p className="text-[10px] text-soft-400 italic font-medium py-2">No submissions recorded yet.</p>
                                                    )}
                                                    {quizSubs.length > 5 && (
                                                        <p className="text-[10px] text-indigo-500 font-black text-center py-1 cursor-pointer hover:underline">+ {quizSubs.length - 5} more</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* ── TEACHER: PERFORMANCE STATS ── */}
                                {user?.role === "teacher" && activeTab === "stats" && (
                                    <div className="col-span-full space-y-6">
                                        {/* Overall KPIs */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                            {[
                                                { label: "Total Assessments", value: quizzes.length, icon: FileText, color: "indigo" },
                                                { label: "Total Submissions", value: submissions.length, icon: CheckCircle, color: "emerald" },
                                                { label: "Unique Students", value: totalParticipants, icon: Users, color: "primary" },
                                                { label: "Overall Avg %", value: `${overallAvg}%`, icon: Target, color: "amber" }
                                            ].map(({ label, value, icon: Icon, color }) => (
                                                <div key={label} className={`bg-white border border-${color}-100 rounded-[2rem] p-6 shadow-soft-sm flex items-center gap-4`}>
                                                    <div className={`bg-${color}-50 p-3 rounded-xl text-${color}-600`}><Icon className="w-5 h-5" /></div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-soft-400 uppercase tracking-widest mb-0.5">{label}</p>
                                                        <p className="text-xl font-black text-soft-900">{value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Per-quiz breakdown */}
                                        <div className="bg-white rounded-[2.5rem] border border-soft-100 p-10 shadow-soft-sm">
                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="bg-indigo-600 p-4 rounded-[1.5rem] text-white"><BarChart3 className="w-6 h-6" /></div>
                                                <div>
                                                    <h4 className="text-xl font-black text-soft-900 leading-tight">Per-Assessment Breakdown</h4>
                                                    <p className="text-[10px] text-soft-400 font-bold uppercase tracking-widest">Score distribution per quiz</p>
                                                </div>
                                            </div>
                                            <div className="space-y-5">
                                                {quizzes.map(quiz => {
                                                    const qSubs = submissions.filter(s => s.quiz_id === quiz.quiz_id);
                                                    const avg = qSubs.length > 0 ? (qSubs.reduce((a, s) => a + (s.total_score / (s.max_score || 1)), 0) / qSubs.length * 100) : 0;
                                                    const maxPossible = quiz.total_max_points || 1;
                                                    return (
                                                        <div key={quiz.quiz_id} className="p-6 bg-soft-50 rounded-[2rem] border border-soft-100">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div>
                                                                    <p className="font-black text-soft-900 text-sm">{quiz.title}</p>
                                                                    <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">{getSubjectName(quiz.subject_id)}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-xl font-black text-indigo-600">{avg.toFixed(1)}%</span>
                                                                    <p className="text-[9px] text-soft-400 font-bold uppercase tracking-widest">{qSubs.length} submitted</p>
                                                                </div>
                                                            </div>
                                                            <div className="w-full bg-white rounded-full h-3 overflow-hidden border border-soft-100 shadow-inner">
                                                                <motion.div 
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: `${avg}%` }}
                                                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                                                    className={`h-full rounded-full ${avg >= 75 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : avg >= 50 ? 'bg-gradient-to-r from-indigo-400 to-indigo-500' : 'bg-gradient-to-r from-red-400 to-red-500'}`}
                                                                />
                                                            </div>
                                                            {/* Student score pills */}
                                                            {qSubs.length > 0 && (
                                                                <div className="flex flex-wrap gap-2 mt-4">
                                                                    {qSubs.map((s, si) => (
                                                                        <span key={si} className="text-[9px] font-black px-2 py-1 bg-white border border-soft-100 rounded-lg text-soft-600 shadow-sm">
                                                                            {s.student_name?.split(" ")[0]}: {s.total_score}/{s.max_score || maxPossible}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {quizzes.length === 0 && <p className="text-center text-soft-400 font-medium py-8">No assessments yet.</p>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ══════════════════════════════════════════════════
                MODALS
            ══════════════════════════════════════════════════ */}

            {/* ── Delete Confirmation Modal ── */}
            <AnimatePresence>
                {deletingQuiz && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isDeleting && setDeletingQuiz(null)} className="absolute inset-0 bg-soft-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl border border-soft-100 p-10 text-center z-10">
                            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <Trash2 className="w-8 h-8 text-red-500" />
                            </div>
                            <h3 className="font-black text-soft-900 text-xl mb-2">Delete Assessment?</h3>
                            <p className="text-soft-500 font-medium text-sm mb-2">You are about to permanently delete:</p>
                            <p className="font-black text-soft-900 mb-2">"{deletingQuiz.title}"</p>
                            <p className="text-xs text-red-600 font-bold bg-red-50 px-4 py-2 rounded-xl mb-8">⚠ This will also delete all {submissions.filter(s => s.quiz_id === deletingQuiz.quiz_id).length} student submission(s). This cannot be undone.</p>
                            <div className="flex gap-4">
                                <button onClick={() => setDeletingQuiz(null)} disabled={isDeleting} className="flex-1 py-3 border border-soft-200 rounded-2xl font-black text-sm text-soft-600 hover:bg-soft-50 transition-all">
                                    Cancel
                                </button>
                                <button onClick={handleDeleteQuiz} disabled={isDeleting} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-red-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete</>}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Edit Quiz Modal ── */}
            <AnimatePresence>
                {editingQuiz && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isSavingEdit && setEditingQuiz(null)} className="absolute inset-0 bg-soft-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-soft-100 overflow-hidden flex flex-col max-h-[90vh] z-10">
                            <div className="p-8 border-b border-soft-100 flex items-center justify-between bg-soft-50/50 shrink-0">
                                <div className="flex items-center gap-3">
                                    <Edit3 className="w-5 h-5 text-indigo-600" />
                                    <h3 className="text-xl font-black text-soft-900">Edit Assessment</h3>
                                </div>
                                <button onClick={() => setEditingQuiz(null)} className="p-2 hover:bg-white rounded-xl text-soft-400 hover:text-soft-900 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
                                {/* Title */}
                                <div className="relative">
                                    <label className="text-[9px] font-bold text-soft-400 uppercase tracking-widest ml-4 bg-white px-2 absolute -top-2 z-10">Assessment Title</label>
                                    <input 
                                        type="text" 
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full bg-transparent border-2 border-soft-200 rounded-2xl px-6 py-4 text-sm font-bold text-soft-900 focus:outline-none focus:border-indigo-400 transition-all"
                                    />
                                </div>

                                {/* Questions */}
                                {editQuestions.map((q, idx) => (
                                    <div key={idx} className="p-5 border border-soft-100 rounded-2xl bg-soft-50/30 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded">Q{idx + 1} — {q.type === 'mcq' ? 'MCQ' : 'Short Answer'}</span>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-bold text-soft-400 uppercase tracking-widest">Marks</span>
                                                    <input 
                                                        type="number" min="1" max="100"
                                                        value={q.max_points || (q.type === 'mcq' ? 2 : 5)}
                                                        onChange={(e) => updateQuestion(idx, 'max_points', parseInt(e.target.value) || 0)}
                                                        className="w-16 px-2 py-1 border border-soft-200 rounded-lg text-sm font-bold text-center focus:outline-none focus:border-indigo-400 bg-white"
                                                    />
                                                </div>
                                                <button onClick={() => removeQuestion(idx)} className="p-1.5 hover:bg-red-50 text-soft-300 hover:text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-100">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={q.question}
                                            onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                                            rows={2}
                                            className="w-full bg-white border border-soft-200 rounded-xl px-4 py-3 text-sm font-medium text-soft-900 focus:outline-none focus:border-indigo-400 transition-all resize-none"
                                            placeholder="Question text..."
                                        />
                                        {q.type === 'mcq' && q.options?.map((opt, oi) => (
                                            <div key={oi} className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-soft-400 w-5">{String.fromCharCode(65 + oi)}.</span>
                                                <input
                                                    value={opt}
                                                    onChange={(e) => {
                                                        const newOpts = [...q.options];
                                                        newOpts[oi] = e.target.value;
                                                        updateQuestion(idx, 'options', newOpts);
                                                    }}
                                                    className="flex-1 bg-white border border-soft-100 rounded-xl px-3 py-2 text-xs font-medium text-soft-900 focus:outline-none focus:border-indigo-300 transition-all"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ))}

                                <button onClick={addNewQuestion} className="w-full py-3.5 border-2 border-dashed border-soft-200 rounded-2xl text-sm font-black text-soft-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> Add Question
                                </button>
                            </div>

                            <div className="p-8 border-t border-soft-100 bg-soft-50/30 flex justify-between items-center shrink-0">
                                <p className="text-xs font-bold text-soft-400">Total: <span className="text-indigo-600">{editQuestions.reduce((acc, q) => acc + (q.max_points || 0), 0)} marks</span> · {editQuestions.length} questions</p>
                                <button onClick={handleSaveEdit} disabled={isSavingEdit} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2">
                                    {isSavingEdit ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Generate New Assessment Modal ── */}
            <AnimatePresence>
                {showGenModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGenModal(false)} className="absolute inset-0 bg-soft-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-soft-100 overflow-hidden">
                            {/* Modal Header */}
                            <div className="p-8 border-b border-soft-100 flex items-center justify-between bg-soft-50/50">
                                <div className="flex items-center gap-3">
                                    <Sparkles className="w-5 h-5 text-indigo-600" />
                                    <h3 className="text-xl font-black text-soft-900">
                                        {genStep === 1 ? "Select Subject" : genStep === 2 ? `Choose Sessions — ${selectedSubject?.subject_name}` : "Review & Set Marks"}
                                    </h3>
                                </div>
                                <button onClick={() => setShowGenModal(false)} className="p-2 hover:bg-white rounded-xl text-soft-400 hover:text-soft-900 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            
                            {/* Step indicator */}
                            <div className="px-8 pt-5 flex items-center gap-2">
                                {[1, 2, 3].map(step => (
                                    <React.Fragment key={step}>
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${genStep >= step ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-soft-200 text-soft-400'}`}>{step}</div>
                                        {step < 3 && <div className={`flex-1 h-0.5 transition-all ${genStep > step ? 'bg-indigo-600' : 'bg-soft-200'}`} />}
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 max-h-[55vh] overflow-y-auto custom-scrollbar">
                                {isGenerating ? (
                                    <div className="py-20 text-center">
                                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
                                        <p className="text-sm font-black text-soft-900 uppercase tracking-widest">Generating comprehensive assessment...</p>
                                        <p className="text-xs text-soft-500 font-medium mt-1">Cross-referencing context from {selectedSessionIds.length} sessions.</p>
                                    </div>
                                ) : genStep === 1 ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        {subjects && Object.values(subjects).flatMap(dept => Object.values(dept).flatMap(year => Object.values(year).flat())).length > 0
                                            ? Object.values(subjects).flatMap(dept => Object.values(dept).flatMap(year => Object.values(year).flat())).map((subject) => (
                                            <div key={subject.subject_id} onClick={() => handleSubjectSelect(subject)} className="p-6 border border-soft-100 rounded-3xl bg-soft-50/30 hover:bg-indigo-50 hover:border-indigo-200 transition-all cursor-pointer group">
                                                <div className="w-12 h-12 rounded-2xl bg-white shadow-soft-sm flex items-center justify-center mb-4 text-indigo-600 group-hover:scale-110 transition-transform">
                                                    <BookOpen className="w-6 h-6" />
                                                </div>
                                                <h4 className="font-black text-soft-900 leading-tight mb-1">{subject.subject_name}</h4>
                                                <p className="text-[10px] font-bold text-soft-400 uppercase tracking-widest">{subject.subject_code || subject.subject_id.substring(0,8)}</p>
                                            </div>
                                        )) : (
                                            <div className="col-span-2 py-12 text-center text-soft-400 font-medium">No subjects found.</div>
                                        )}
                                    </div>
                                ) : genStep === 2 ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between mb-4 px-2">
                                            <button onClick={() => setGenStep(1)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">← Back to Subjects</button>
                                            <span className="text-[10px] font-black text-soft-400 uppercase tracking-widest">{selectedSessionIds.length} Selected</span>
                                        </div>
                                        {subjectSessions.length > 0 ? subjectSessions.map((session) => (
                                            <div key={session.session_id} onClick={() => toggleSessionId(session.session_id)} className={`p-5 border rounded-2xl flex items-center justify-between cursor-pointer transition-all ${selectedSessionIds.includes(session.session_id) ? "border-indigo-600 bg-indigo-50/50 shadow-sm" : "border-soft-100 bg-white hover:border-soft-200"}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedSessionIds.includes(session.session_id) ? "bg-indigo-600 border-indigo-600 text-white" : "border-soft-200 bg-white"}`}>
                                                        {selectedSessionIds.includes(session.session_id) && <CheckCircle className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-soft-900 text-sm">{session.topic || `Session — ${formatDate(session.started_at || session.created_at)}`}</p>
                                                        <p className="text-[10px] font-bold text-soft-400 uppercase tracking-wider">{formatDate(session.started_at || session.created_at)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="py-12 text-center text-soft-400 font-medium bg-soft-50 rounded-3xl border border-dashed border-soft-200">No finished sessions found in this subject.</div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4 pt-2">
                                        <div className="flex items-center justify-between mb-4 px-2">
                                            <button onClick={() => setGenStep(2)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">← Back to Sessions</button>
                                            <span className="text-[10px] font-black text-soft-400 uppercase tracking-widest">Adjust Marks</span>
                                        </div>
                                        <div className="mb-4 relative">
                                            <label className="text-[9px] font-bold text-soft-400 uppercase tracking-widest ml-4 bg-white px-2 absolute -top-2">Assessment Title</label>
                                            <input type="text" value={previewTitle} onChange={(e) => setPreviewTitle(e.target.value)} className="w-full bg-transparent border-2 border-soft-200 rounded-2xl px-6 py-4 text-sm font-bold text-soft-900 focus:outline-none focus:border-indigo-400 transition-all" />
                                        </div>
                                        {previewQuestions?.map((q, idx) => (
                                            <div key={idx} className="p-5 border border-soft-100 rounded-2xl bg-white shadow-soft-sm">
                                                <div className="flex justify-between items-start mb-3">
                                                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded">Q{idx + 1} — {q.type === 'mcq' ? 'MCQ' : 'Short Answer'}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-bold text-soft-400 uppercase tracking-widest">Marks</span>
                                                        <input type="number" min="1" max="100" value={q.max_points || (q.type === 'mcq' ? 2 : 10)} onChange={(e) => { const newQ = [...previewQuestions]; newQ[idx].max_points = parseInt(e.target.value) || 0; setPreviewQuestions(newQ); }} className="w-16 px-2 py-1 border border-soft-200 rounded-lg text-sm font-bold text-center focus:outline-none focus:border-indigo-400" />
                                                    </div>
                                                </div>
                                                <p className="text-sm text-soft-800 font-bold">{q.question}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {genStep === 2 && !isGenerating && (
                                <div className="p-8 border-t border-soft-100 bg-soft-50/30 flex justify-between items-center">
                                    <p className="text-xs font-medium text-soft-500 italic">Select sessions to aggregate context for the quiz.</p>
                                    <button onClick={handleGenerateSubjectQuizPreview} disabled={selectedSessionIds.length === 0} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2">
                                        Generate & Review <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                            {genStep === 3 && !isGenerating && (
                                <div className="p-8 border-t border-soft-100 bg-soft-50/30 flex justify-between items-center">
                                    <p className="text-xs font-medium text-soft-500">Total: <span className="font-black text-indigo-600">{previewQuestions.reduce((acc, q) => acc + (q.max_points || 0), 0)} Marks</span></p>
                                    <button onClick={handleSaveQuiz} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all active:scale-95 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4" /> Publish Assessment
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Teacher: View Student Submission Modal ── */}
            <AnimatePresence>
                {viewingSubmission && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewingSubmission(null)} className="absolute inset-0 bg-soft-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-3xl bg-soft-50 rounded-[2.5rem] shadow-2xl border border-soft-100 overflow-hidden flex flex-col max-h-[90vh] z-10">
                            <div className="p-8 border-b border-soft-100 flex items-center justify-between bg-white shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600"><User className="w-6 h-6" /></div>
                                    <div>
                                        <h3 className="text-lg font-black text-soft-900">{viewingSubmission.student_name}'s Submission</h3>
                                        <p className="text-[10px] font-bold text-soft-400 uppercase tracking-widest">{viewingSubmission.quiz_title}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-soft-400 uppercase tracking-widest mb-1">Total Score</p>
                                        <p className="text-xl font-black text-indigo-900">{viewingSubmission.total_score} <span className="text-sm text-soft-400">/ {viewingSubmission.max_score || 10}</span></p>
                                    </div>
                                    <button onClick={() => setViewingSubmission(null)} className="p-2 hover:bg-soft-100 rounded-xl text-soft-400 transition-colors"><X className="w-5 h-5" /></button>
                                </div>
                            </div>
                            
                            <div className="p-8 overflow-y-auto custom-scrollbar space-y-6">
                                {viewingSubmission.results?.map((res, idx) => (
                                    <div key={idx} className={`bg-white rounded-[2rem] border p-6 shadow-soft-sm ${res.score >= (res.max_points || 10) / 2 ? 'border-emerald-100' : 'border-red-100'}`}>
                                        <div className="flex gap-4 items-start">
                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${res.score >= (res.max_points || 10) / 2 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                {res.score >= (res.max_points || 10) / 2 ? <CheckCircle className="w-6 h-6" /> : <X className="w-6 h-6" />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-3">
                                                    <p className="text-[10px] font-black text-soft-400 uppercase tracking-widest">Question {idx + 1}</p>
                                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${res.score >= (res.max_points || 10) / 2 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>Score: {res.score}/{res.max_points || 10}</span>
                                                </div>
                                                <p className="text-sm text-soft-800 font-bold mb-4">{res.feedback}</p>
                                                {(res.evidence || res.teacher_quote) && (
                                                    <div className="bg-primary-50/50 border border-primary-100/50 rounded-2xl p-5">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Sparkles className="w-3.5 h-3.5 text-primary-500" />
                                                            <span className="text-[9px] font-black text-primary-600 uppercase tracking-wider">Teacher's Explanation</span>
                                                        </div>
                                                        <p className="text-xs text-primary-900 italic font-medium leading-relaxed">"{res.evidence || res.teacher_quote}"</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
