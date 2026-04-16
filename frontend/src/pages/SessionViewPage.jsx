import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    getSessionTranscripts,
    getSessionAnalysis,
    getSessionDetail,
    finalizeSessionAnalysis,
    downloadSessionPDF,
    getSessionResources,
    resolveUrl,
    generateRagQuiz,
    getSessionQuiz,
    submitRagQuiz,
    getQuizResults,
    indexSessionMaterials,
    askAI,
    gradeQuizAnswer
} from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronLeft,
    MessageSquare,
    Sparkles,
    FileText,
    HelpCircle,
    Lightbulb,
    Clock,
    Download,
    Share2,
    Activity,
    CheckCircle,
    Loader2,
    Zap,
    ZapOff,
    BookOpen,
    Brain,
    ChevronRight,
    Monitor,
    Users,
    Hand,
    X,
    Layers,
    PlayCircle,
    ExternalLink,
    Youtube,
    Volume2,
    VolumeX,
    Mic,
    MicOff,
    Bell,
    Send,
    Bot,
    Trophy,
    AlertCircle,
    Square,
} from "lucide-react";

const renderMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('###')) {
            return <h3 key={idx} className="text-sm font-black text-indigo-700 mt-6 mb-3 uppercase tracking-wider">{trimmed.replace('###', '').trim()}</h3>;
        }
        if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
            return <div key={idx} className="flex gap-3 mb-2 items-start px-2">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 flex-shrink-0" />
                <p className="text-sm text-soft-600 leading-snug">{trimmed.substring(1).trim()}</p>
            </div>;
        }
        if (trimmed.length === 0) return <div key={idx} className="h-2" />;
        return <p key={idx} className="text-sm text-soft-600 leading-relaxed mb-4">{trimmed}</p>;
    });
};

export default function SessionViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // --- Core state ---
    const [transcripts, setTranscripts] = useState([]);
    const [partialText, setPartialText] = useState("");
    const [autoScroll, setAutoScroll] = useState(true);
    const transcriptRef = useRef(null);

    // --- Session state ---
    const [sessionStatus, setSessionStatus] = useState("loading"); // "loading" | "active" | "finished" | "completed"
    const isFinished = sessionStatus === "finished" || sessionStatus === "completed";
    const isActive = sessionStatus === "active";

    // --- Analysis state ---
    const [showInsights, setShowInsights] = useState(true);
    const [analysis, setAnalysis] = useState({
        summary: null,
        sessionType: null,
        concepts: [],
        taxonomy: {},
        questions: [],
        analysis_ready: false,
        analyzed_at: null,
        audio_summary_url: null,
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    // --- Recommended Resources ---
    const [resources, setResources] = useState({}); // { conceptName: [resource, ...] }
    const [resourcesLoading, setResourcesLoading] = useState(false);

    // --- Remote Classroom Context ---
    const [currentContext, setCurrentContext] = useState(null); // { type, id, name, url, page }
    const [teachingMaterials, setTeachingMaterials] = useState([]);
    const [isPeekMode, setIsPeekMode] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("transcript"); // "transcript" | "insights"
    const [screenFrame, setScreenFrame] = useState(null);
    const [webcamFrame, setWebcamFrame] = useState(null);
    const [isLiveAudioEnabled, setIsLiveAudioEnabled] = useState(false);
    useEffect(() => {
        // Disabled auto-join due to browser auto-play policies.
    }, [id]);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [doubts, setDoubts] = useState([]); // Only from new_doubt WS messages
    const [unreadDoubts, setUnreadDoubts] = useState(0);
    const [newDoubtText, setNewDoubtText] = useState("");
    const [showSmartSidebar, setShowSmartSidebar] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState([]); // Recent activity
    const [unreadNotifs, setUnreadNotifs] = useState(0);
    const [participantCount, setParticipantCount] = useState(0);
    const [participantsList, setParticipantsList] = useState([]);
    const [showParticipantsPopover, setShowParticipantsPopover] = useState(false);
    const [reactions, setReactions] = useState([]);
    const [isWsConnected, setIsWsConnected] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    // --- Feature 1: AI Teaching Assistant ---
    const [showAiChat, setShowAiChat] = useState(false);
    const [aiChatHistory, setAiChatHistory] = useState([]);
    const [aiQuestion, setAiQuestion] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isSpeakingAi, setIsSpeakingAi] = useState(false);
    const aiChatBottomRef = useRef(null);

    // --- Feature 5: Interactive Voice Quiz ---
    const [activeQuiz, setActiveQuiz] = useState(null); // { question, duration }
    const [quizMode, setQuizMode] = useState(false);
    const quizModeRef = useRef(false);
    useEffect(() => { quizModeRef.current = quizMode; }, [quizMode]);
    const [quizAnswer, setQuizAnswer] = useState("");
    const [quizResult, setQuizResult] = useState(null); // { score, grade, feedback }
    const [isGrading, setIsGrading] = useState(false);
    const [quizCountdown, setQuizCountdown] = useState(0);
    const quizCountdownRef = useRef(null);
    // Quiz local speech recognition (keeps quiz audio OUT of server pipeline)
    const [isQuizListening, setIsQuizListening] = useState(false);
    const quizRecognitionRef = useRef(null);

    // --- Feature: RAG Assessments ---
    const [ragQuiz, setRagQuiz] = useState(null);
    const [ragAnswers, setRagAnswers] = useState({}); // { q_id: answer }
    const [ragQuizResults, setRagQuizResults] = useState(null);
    const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
    const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
    const [showRagQuiz, setShowRagQuiz] = useState(false);
    const [isIndexing, setIsIndexing] = useState(false);

    const wsRef = useRef(null);
    // Audio State & Refs
    const audioCtxRef = useRef(null);
    const pcmPlayerRef = useRef(null);
    const studentStreamRef = useRef(null);
    const studentProcessorRef = useRef(null);
    const studentAudioCtxRef = useRef(null);
    const isRecordingRef = useRef(false);
    const lastFinalizedIndexRef = useRef(-1); // Unique index tracking for student transcription segments
    const lastGlobalPTTTextRef = useRef(""); // Guard for student across session repeats
    const lastPTTActivityRef = useRef(Date.now()); // Watchdog for student speech
    const pttStartTimeRef = useRef(Date.now()); // Rotation for student speech
    // AI chat voice input refs (were missing — caused toggleAiListening crashes)
    const [isRecordingAi, setIsRecordingAi] = useState(false);
    const recognitionRef = useRef(null);

    // -----------------------------------------------------------------------
    // Fetch session detail (status, stored analysis)
    // -----------------------------------------------------------------------
    const [actualSessionId, setActualSessionId] = useState(id);
    
    const loadSessionDetail = useCallback(async () => {
        try {
            const detail = await getSessionDetail(actualSessionId || id);
            setSessionStatus(detail.status || "active");
            if (detail.session_id) setActualSessionId(detail.session_id);
            if (detail.teaching_materials) {
                const normalizedMaterials = (detail.teaching_materials || []).map(m => ({
                    ...m,
                    url: resolveUrl(m.url)
                }));
                setTeachingMaterials(normalizedMaterials);
            }
        } catch (err) {
            console.error("Failed to fetch session detail:", err);
            // Don't set error state immediately so polling can recover if it's intermittent
        }
    }, [id, actualSessionId]);

    // -----------------------------------------------------------------------
    // Fetch analysis — only once; no polling
    // On finished sessions, returns stored DB values (fast).
    // On active sessions, returns live concept tags + empty summary/questions.
    // -----------------------------------------------------------------------
    const loadAnalysis = useCallback(async () => {
        try {
            const data = await getSessionAnalysis(id);

            // Normalize: LLM may return summary as object, questions as object, etc.
            const normalizeSummary = (s) => {
                if (!s) return null;
                if (typeof s === 'object') return Object.values(s).join(' ');
                return String(s);
            };
            const normalizeStringArray = (arr) => {
                if (!arr) return [];
                if (typeof arr === 'object' && !Array.isArray(arr))
                    return Object.entries(arr).map(([k, v]) => `${k}: ${v}`);
                return arr.map(item =>
                    typeof item === 'object' ? Object.values(item).join(' ') : String(item)
                );
            };

            setAnalysis({
                summary: normalizeSummary(data.summary),
                sessionType: data.session_type || null,
                concepts: normalizeStringArray(data.concepts),
                questions: normalizeStringArray(data.questions),
                audio_summary_url: resolveUrl(data.audio_summary_url),
            });
            // Update status from analysis response if available
            if (data.status) {
                setSessionStatus(data.status);
            }
        } catch (err) {
            console.error("Failed to fetch analysis:", err);
        }
    }, [id]);

    // -----------------------------------------------------------------------
    // Load recommended resources (finished sessions only)
    // -----------------------------------------------------------------------
    const loadResources = useCallback(async () => {
        setResourcesLoading(true);
        try {
            const data = await getSessionResources(id);
            setResources(data.resources || {});
        } catch (err) {
            console.error("Failed to load resources:", err);
        } finally {
            setResourcesLoading(false);
        }
    }, [id]);


    // -----------------------------------------------------------------------
    // Load transcripts & Sync History
    // -----------------------------------------------------------------------
    const loadTranscripts = useCallback(async () => {
        try {
            const data = await getSessionTranscripts(id);
            const history = data.transcripts || [];
            
            setTranscripts(prev => {
                // Merge history with existing (WS) transcripts, avoid duplicates
                // Use 'start' as the primary key for uniqueness
                const seenStarts = new Set(prev.filter(t => t.start != null).map(t => t.start));
                const newItems = history.filter(t => !seenStarts.has(t.start));
                
                if (newItems.length === 0) return prev;

                const combined = [...prev, ...newItems];
                // Sort by start time/index
                return combined.sort((a, b) => (a.start || 0) - (b.start || 0));
            });
        } catch (err) {
            console.error("Failed to load transcripts:", err);
        }
    }, [id]);

    useEffect(() => {
        loadTranscripts();
        
        // While active, poll history every 15s to catch anything missed by WS or flusher delay
        let interval;
        if (isActive) {
            interval = setInterval(loadTranscripts, 15000);
        }
        return () => clearInterval(interval);
    }, [id, isActive, loadTranscripts]);

    // -----------------------------------------------------------------------
    // Load session detail + analysis on mount (once)
    // -----------------------------------------------------------------------
    useEffect(() => {
        loadSessionDetail();
        loadAnalysis();
    }, [id]);

    // Load resources when session is finished
    useEffect(() => {
        if (isFinished) loadResources();
    }, [isFinished, loadResources]);

    // -----------------------------------------------------------------------
    // Poll session status while active
    // When a session flips to "finished", reload analysis + final transcripts
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (sessionStatus === "loading" || sessionStatus === "finished") return;

        const interval = setInterval(async () => {
            try {
                const detail = await getSessionDetail(id);
                // Sync materials periodically — apply resolveUrl so mid-session uploads have correct URLs
                if (detail.teaching_materials) {
                    const normalizedMaterials = (detail.teaching_materials || []).map(m => ({
                        ...m,
                        url: resolveUrl(m.url)
                    }));
                    setTeachingMaterials(normalizedMaterials);
                }

                const newStatus = detail.status || "active";
                if (newStatus !== sessionStatus) {
                    setSessionStatus(newStatus);
                    if (newStatus === "finished") {
                        clearInterval(interval);
                        // Session just ended — reload final transcript list, full session detail, and analysis
                        const [transcriptData] = await Promise.all([
                            getSessionTranscripts(id),
                        ]);
                        // Merge instead of replace to preserve WebSocket data not yet in DB
                        setTranscripts((prev) => {
                            const seenStarts = new Set(prev.filter(t => t.start != null).map(t => t.start));
                            const newItems = (transcriptData.transcripts || []).filter(t => !seenStarts.has(t.start));
                            return [...prev, ...newItems].sort((a, b) => (a.start || 0) - (b.start || 0));
                        });
                        // Reload full session detail to get persisted teaching_materials
                        await loadSessionDetail();
                        await loadAnalysis();
                    }
                }
            } catch (_) { }
        }, 5000);

        return () => clearInterval(interval);
    }, [sessionStatus, id, loadAnalysis, loadSessionDetail]);

    // -----------------------------------------------------------------------
    // WebSocket for live transcript updates
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!id || isFinished) return; // Don't connect if session is finished

        const wsUrl = `ws://${window.location.hostname}:8765`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("Student connected to WebSocket for session:", id);
            setIsWsConnected(true);
            ws.send(JSON.stringify({ type: "subscribe", session_id: id }));
            
            // Register as a participant (student)
            if (user) {
                ws.send(JSON.stringify({
                    type: "join",
                    session_id: id,
                    role: "student",
                    name: user.full_name,
                    email: user.email
                }));
            }
        };
        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                // Incoming RAW PCM audio chunk from Teacher
                if (!isLiveAudioEnabled) return;

                if (!audioCtxRef.current) {
                    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                }

                const audioCtx = audioCtxRef.current;
                const pcmData = new Int16Array(event.data);
                if (pcmData.length === 0) return;

                const floatData = new Float32Array(pcmData.length);
                for (let i = 0; i < pcmData.length; i++) {
                    floatData[i] = pcmData[i] / 32768.0;
                }

                const buffer = audioCtx.createBuffer(1, floatData.length, 16000);
                buffer.getChannelData(0).set(floatData);

                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);
                
                // Use a strict scheduling logic to avoid gaps while preventing latency accumulation
                const now = audioCtx.currentTime;
                if (!pcmPlayerRef.current || pcmPlayerRef.current < now) {
                    pcmPlayerRef.current = now;
                } else if (pcmPlayerRef.current - now > 0.5) {
                    // Maximum 500ms jitter buffer: Snap back to prevent 10-second delays
                    pcmPlayerRef.current = now + 0.1;
                }
                source.start(pcmPlayerRef.current);
                pcmPlayerRef.current += buffer.duration;
                source.connect(audioCtx.destination); // Moved connect here to ensure it's always connected
            } else {
                const data = JSON.parse(event.data);
                if (data.session_id !== id) return;

                if (data.type === "final") {
                    setPartialText("");
                    // ROUTING FIX: During quiz mode, WS final messages are class transcript only.
                    // Quiz answers are captured locally via SpeechRecognition (never hit the server pipeline).
                    // So we always push to class transcript regardless of quizMode.
                    setTranscripts((prev) => {
                        const seenStarts = new Set(prev.filter(t => t.start != null).map(t => t.start));
                        if (data.start != null && seenStarts.has(data.start)) return prev;
                        return [...prev, data].sort((a, b) => (a.start || 0) - (b.start || 0));
                    });
                } else if (data.type === "partial") {
                    setPartialText(data.text);
                } else if (data.type === "concept_update") {
                    if (data.concepts) setAnalysis(prev => ({ ...prev, concepts: data.concepts }));
                } else if (data.type === "screen_frame") {
                    setScreenFrame(data.frame);
                } else if (data.type === "webcam_frame") {
                    setWebcamFrame(data.frame);
                } else if (data.type === "reaction") {
                    const rid = Math.random().toString(36).substr(2, 9);
                    setReactions(prev => [...prev, {
                        id: rid,
                        emoji: data.emoji,
                        sender: data.sender || "Someone",
                        x: Math.random() * 80 + 10,
                    }]);
                    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 3000);
                } else if (data.type === "raise_hand") {
                    // Add raise hand as a notification
                    const notif = { id: Math.random().toString(36).substr(2,9), text: `${data.sender || 'A student'} raised their hand`, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), icon: '✋' };
                    setNotifications(prev => [notif, ...prev].slice(0, 20));
                    setUnreadNotifs(n => n + 1);
                } else if (data.type === "pop_quiz") {
                    // Feature 5: Teacher launched a pop quiz
                    const quiz = { question: data.question, duration: data.duration || 60 };
                    setActiveQuiz(quiz);
                    setQuizMode(true);
                    setQuizAnswer("");
                    setQuizResult(null);
                    setIsGrading(false);
                    setQuizCountdown(quiz.duration);
                    // Auto-TTS: read quiz question aloud
                    if (window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                        const utterance = new SpeechSynthesisUtterance(
                            `Pop quiz starting now: ${data.question}`
                        );
                        utterance.rate = 0.95;
                        utterance.pitch = 1.0;
                        window.speechSynthesis.speak(utterance);
                    }
                    // Start countdown timer
                    if (quizCountdownRef.current) clearInterval(quizCountdownRef.current);
                    quizCountdownRef.current = setInterval(() => {
                        setQuizCountdown(prev => {
                            if (prev <= 1) {
                                clearInterval(quizCountdownRef.current);
                                quizCountdownRef.current = null;
                                setQuizMode(false);
                                setActiveQuiz(null);
                                setQuizAnswer("");
                                return 0;
                            }
                            return prev - 1;
                        });
                    }, 1000);
                } else if (data.type === "session_terminated") {
                    alert("The teacher has ended this session.");
                    navigate("/dashboard");
                } else if (data.type === "context_sync" || data.type === "context_update") {
                    if (data.context?.type === "none") {
                        if (!isPeekMode) setCurrentContext(null);
                        setScreenFrame(null);
                    } else {
                        if (!isPeekMode) setCurrentContext(data.context);
                        if (data.context?.type !== "screen") setScreenFrame(null);
                        
                        // NEW: Automatically switch to the "material" (Live Vision) tab when teacher shares context
                        if (data.context?.type && data.context.type !== "none") {
                            setActiveTab("material");
                        }
                    }
                } else if (data.type === "participant_count") {
                    setParticipantCount(data.count);
                    setParticipantsList(data.participants || []);
                } else if (data.type === "new_doubt") {
                    // Only add doubts from explicit student submissions
                    const dObj = {
                        id: Math.random().toString(36).substr(2, 9),
                        text: data.text,
                        sender: data.sender || "Student",
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    };
                    setDoubts(prev => [dObj, ...prev].slice(0, 20));
                    setUnreadDoubts(n => n + 1);
                    // Also add to activity notifications
                    const notif = { id: dObj.id + '_n', text: `${data.sender || 'Student'}: ${data.text.substring(0,50)}${data.text.length>50?'...':''}`, time: dObj.time, icon: '❓' };
                    setNotifications(prev => [notif, ...prev].slice(0, 20));
                    setUnreadNotifs(n => n + 1);
                }
            }
        };

        ws.onclose = () => {
            console.log("WebSocket closed. Attempting to reload history...");
            setIsWsConnected(false);
            loadTranscripts();
        };

        ws.onerror = (err) => console.error("WebSocket error:", err);
        return () => ws.close();
    }, [id, loadTranscripts, isLiveAudioEnabled, user, isFinished]);

    // Handle AudioContext initialization/cleanup for live audio
    useEffect(() => {
        if (!isLiveAudioEnabled) {
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => {});
                audioCtxRef.current = null;
            }
            return;
        }
    }, [isLiveAudioEnabled]);

    // -----------------------------------------------------------------------
    // Auto-scroll
    // -----------------------------------------------------------------------
    function handleScroll() {
        const el = transcriptRef.current;
        if (!el) return;
        setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
    }

    useEffect(() => {
        if (!autoScroll) return;
        const el = transcriptRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, [transcripts, partialText, autoScroll]);

    // -----------------------------------------------------------------------
    // Classify transcript lines for inline highlighting
    // -----------------------------------------------------------------------
    function classifyLine(text) {
        if (!text) return "normal";
        const lower = text.toLowerCase();
        if (lower.includes("?") ) return "question";
        if (lower.includes("important") || lower.includes("remember") || lower.includes("exam")) return "important";
        if (lower.includes("defined as") || lower.includes("means") || lower.includes("definition")) return "concept";
        return "normal";
    }

    // --- Text to Speech ---
    const speak = (text, rate = 1.0) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        setIsSpeakingAi(false);
        
        if (!text) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = 1.0;
        
        utterance.onstart = () => setIsSpeakingAi(true);
        utterance.onend = () => setIsSpeakingAi(false);
        utterance.onerror = () => setIsSpeakingAi(false);
        
        window.speechSynthesis.speak(utterance);
    };

    // --- Feature 1: Ask AI Question ---
    const askAIQuestion = async () => {
        const q = aiQuestion.trim();
        if (!q || isAiLoading) return;
        setAiQuestion("");
        setIsAiLoading(true);
        const userMsg = { role: "user", text: q, id: Date.now() };
        setAiChatHistory(prev => [...prev, userMsg]);
        try {
            // Pass last 8 transcript lines as context
            const contextLines = transcripts.slice(-8).map(t => t.text);
            const data = await askAI(q, id, contextLines);
            const botMsg = { role: "bot", text: data.answer, id: Date.now() + 1 };
            setAiChatHistory(prev => [...prev, botMsg]);
            // Auto-TTS: read answer aloud
            speak(data.answer, 0.95);
        } catch (err) {
            const errMsg = { role: "bot", text: "Sorry, I couldn't reach the AI right now. Please try again.", id: Date.now() + 1, isError: true };
            setAiChatHistory(prev => [...prev, errMsg]);
        } finally {
            setIsAiLoading(false);
        }
    };

    // Auto-scroll AI chat
    useEffect(() => {
        if (aiChatBottomRef.current) {
            aiChatBottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [aiChatHistory]);

    const toggleAiListening = () => {
        if (isRecordingAi) {
            recognitionRef.current?.stop();
            setIsRecordingAi(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setAiQuestion(transcript);
            setIsRecordingAi(false);
        };

        recognition.onerror = () => setIsRecordingAi(false);
        recognition.onend = () => setIsRecordingAi(false);

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecordingAi(true);
    };

    // --- Feature 5: Submit Quiz Answer ---
    const submitQuizAnswer = async () => {
        if (!activeQuiz || !quizAnswer.trim() || isGrading) return;
        if (quizCountdownRef.current) {
            clearInterval(quizCountdownRef.current);
            quizCountdownRef.current = null;
        }
        setIsGrading(true);
        setQuizMode(false);
        try {
            const result = await gradeQuizAnswer(activeQuiz.question, quizAnswer.trim(), user?.full_name || "Student");
            setQuizResult(result);
            // TTS: read feedback aloud
            const feedbackText = `Your grade is ${result.grade}, score ${result.score} out of 10. ${result.feedback}`;
            speak(feedbackText, 0.9);
            // Send result back to teacher via WebSocket
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: "quiz_response",
                    session_id: id,
                    student_name: user?.full_name || "Student",
                    score: result.score,
                    grade: result.grade,
                    feedback: result.feedback,
                    answer: quizAnswer.trim()
                }));
            }
        } catch (err) {
            setQuizResult({ score: 0, grade: "?", feedback: "Grading failed. Please show your answer to the teacher." });
        } finally {
            setIsGrading(false);
        }
    };

    // Cleanup quiz countdown on unmount
    useEffect(() => {
        return () => { if (quizCountdownRef.current) clearInterval(quizCountdownRef.current); };
    }, []);

    // --- RAG Assessment Handlers ---
    const handleGenerateRagQuiz = async () => {
        setIsGeneratingQuiz(true);
        try {
            await generateRagQuiz(id);
            const quiz = await getSessionQuiz(id);
            setRagQuiz(quiz);
            alert("RAG Assessment generated successfully!");
        } catch (err) {
            console.error("Failed to generate RAG quiz:", err);
            alert("Failed to generate quiz. Make sure the session analysis is finalized.");
        } finally {
            setIsGeneratingQuiz(false);
        }
    };

    const handleFetchRagQuiz = async () => {
        try {
            const quiz = await getSessionQuiz(id);
            setRagQuiz(quiz);
            setShowRagQuiz(true);
        } catch (err) {
            console.error("No quiz found:", err);
        }
    };

    const handleSubmitRagQuiz = async () => {
        setIsSubmittingQuiz(true);
        try {
            const result = await submitRagQuiz(id, ragAnswers);
            setRagQuizResults(result);
        } catch (err) {
            console.error("Failed to submit quiz:", err);
            alert("Submission failed.");
        } finally {
            setIsSubmittingQuiz(false);
        }
    };

    const handleIndexMaterials = async () => {
        setIsIndexing(true);
        try {
            await indexSessionMaterials(id);
            alert("Material indexing started in background.");
        } catch (err) {
            console.error("Failed to index materials:", err);
        } finally {
            setIsIndexing(false);
        }
    };

    // --- Student Voice Feedback (Push-to-Talk) ---
    // ROUTING FIX: During quiz mode, PTT uses local SpeechRecognition so quiz audio
    // never enters the server's transcription pipeline (which would pollute class transcript).
    // Outside quiz mode, PTT sends binary PCM to the server as before.

    const startStudentRecording = async () => {
        if (isSpeaking || isRecordingRef.current) return;

        // ── QUIZ MODE: use local browser speech recognition ──────────────────
        if (quizModeRef.current) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert("Speech recognition is not supported in this browser. Please type your answer.");
                return;
            }
            // Stop any previous instance
            quizRecognitionRef.current?.stop();

            const recognition = new SpeechRecognition();
            recognition.lang = 'en-US';
            recognition.interimResults = true; // Show live preview in quiz answer box
            recognition.continuous = true;     // Keep listening until they release button
            recognition.maxAlternatives = 1;

            recognition.onresult = (event) => {
                let fullTranscript = '';
                for (let i = 0; i < event.results.length; i++) {
                    fullTranscript += event.results[i][0].transcript;
                }
                setQuizAnswer(fullTranscript);
            };

            recognition.onerror = () => {
                setIsQuizListening(false);
                setIsSpeaking(false);
                isRecordingRef.current = false;
            };
            recognition.onend = () => {
                setIsQuizListening(false);
                setIsSpeaking(false);
                isRecordingRef.current = false;
            };

            quizRecognitionRef.current = recognition;
            recognition.start();
            isRecordingRef.current = true;
            setIsQuizListening(true);
            setIsSpeaking(true);
            return;
        }
        // ── NORMAL MODE: use browser-based speech recognition for immediate results ──
        isRecordingRef.current = true;
        try {
            console.log('[PTT] Starting browser-based recording for question...');
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert("Speech recognition is not supported in this browser. Please type your question.");
                isRecordingRef.current = false;
                setIsSpeaking(false);
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.lang = 'en-IN'; // Improved accuracy for local context
            recognition.interimResults = true;
            recognition.continuous = true;

            recognition.onresult = (event) => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                lastPTTActivityRef.current = Date.now(); // Feed watchdog

                // Iterate through all results to find newly finalized segments
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    const text = result[0].transcript.trim();

                    if (result.isFinal) {
                        // Only send if NEW index AND not a session-repeat of identical text
                        if (i > lastFinalizedIndexRef.current && text !== lastGlobalPTTTextRef.current) {
                            wsRef.current.send(JSON.stringify({
                                type: "browser_transcript",
                                session_id: id,
                                text: text,
                                is_final: true
                            }));
                            lastFinalizedIndexRef.current = i;
                            lastGlobalPTTTextRef.current = text;
                        }
                    } else {
                        // Show immediate partial preview for the current segment
                        if (i >= event.results.length - 1) {
                            wsRef.current.send(JSON.stringify({
                                type: "browser_transcript",
                                session_id: id,
                                text: text,
                                is_final: false
                            }));
                        }
                    }
                }
            };

            recognition.onerror = () => {
                setIsSpeaking(false);
                isRecordingRef.current = false;
            };
            recognition.onend = () => {
                lastFinalizedIndexRef.current = -1; // Reset on end
                if (isRecordingRef.current) {
                    // Force restart if still intended to be recording (watchdog or rotation)
                    pttStartTimeRef.current = Date.now();
                    lastPTTActivityRef.current = Date.now();
                    try { recognition.start(); } catch (e) {}
                } else {
                    setIsSpeaking(false);
                }
            };

            // Reuse the same quizRecognitionRef for easier cleanup in stopStudentRecording
            quizRecognitionRef.current = recognition;
            recognition.start();
            pttStartTimeRef.current = Date.now();
            lastPTTActivityRef.current = Date.now();

            // Student PTT Watchdog
            const pttWatchdog = setInterval(() => {
                if (!isRecordingRef.current) {
                    clearInterval(pttWatchdog);
                    return;
                }
                const now = Date.now();
                const sessionDuration = now - pttStartTimeRef.current;
                
                // Rotate every 45s (browser limit) or if stalled for 10s (engine hang)
                if (sessionDuration > 45000 || (now - lastPTTActivityRef.current > 10000)) {
                    console.log("[PTT Watchdog] Restarting session (Hard Abort)...");
                    try { recognition.abort(); } catch (e) {} // Use ABORT
                }
            }, 5000);

            setIsSpeaking(true);
        } catch (err) {
            console.error('[PTT] Failed to start browser-based PTT:', err);
            isRecordingRef.current = false;
            setIsSpeaking(false);
        }
    };

    const stopStudentRecording = () => {
        if (!isRecordingRef.current) return;
        isRecordingRef.current = false;
        setIsSpeaking(false);

        // Stop quiz local recognition if active
        if (quizRecognitionRef.current) {
            lastFinalizedIndexRef.current = -1; // Reset when manually stopped
            quizRecognitionRef.current.stop();
            quizRecognitionRef.current = null;
            setIsQuizListening(false);
            return;
        }

        // Stop normal PTT resources
        console.log('[PTT] Stopping recording...');
        if (studentProcessorRef.current) {
            studentProcessorRef.current.onaudioprocess = null;
            studentProcessorRef.current.disconnect();
            studentProcessorRef.current = null;
        }
        if (studentAudioCtxRef.current) {
            studentAudioCtxRef.current.close().catch(() => {});
            studentAudioCtxRef.current = null;
        }
        if (studentStreamRef.current) {
            studentStreamRef.current.getTracks().forEach(track => track.stop());
            studentStreamRef.current = null;
        }
    };

    // -----------------------------------------------------------------------
    // Trigger full post-session analysis generation
    // -----------------------------------------------------------------------
    async function handleGenerateAnalysis() {
        setIsGenerating(true);
        setGenerateError(null);
        try {
            const data = await finalizeSessionAnalysis(id);
            setAnalysis({
                summary: data.summary || null,
                sessionType: data.session_type || null,
                concepts: data.concepts || [],
                taxonomy: data.taxonomy || {},
                questions: data.questions || [],
                analysis_ready: true,
                analyzed_at: data.analyzed_at || null,
                audio_summary_url: resolveUrl(data.audio_summary_url),
            });
        } catch (err) {
            console.error("Failed to generate analysis:", err);
            setGenerateError("Failed to generate analysis. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    }

    const sendReaction = (emoji) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: "reaction",
                session_id: id,
                reaction: emoji,
                sender: user?.full_name || "Student"
            }));
        }
    };

    const raiseHand = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: "raise_hand",
                session_id: id,
                sender: user?.full_name || "Student"
            }));
        }
    };
    const submitDoubt = () => {
        if (!newDoubtText.trim() || !wsRef.current) return;
        wsRef.current.send(JSON.stringify({
            type: "submit_doubt",
            session_id: id,
            text: newDoubtText,
            sender: user?.full_name || "Student"
        }));
        setNewDoubtText("");
    };

    return (
        <div className="flex flex-col h-full gap-6">
            <header className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2.5 bg-white border border-soft-200 rounded-xl text-soft-500 hover:text-primary-500 hover:border-primary-200 soft-transition shadow-sm"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-soft-900 leading-tight">Session Review</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-soft-400 uppercase tracking-wider">ID: {id.substring(0, 8)}</span>
                            <span className="w-1 h-1 rounded-full bg-soft-300"></span>
                            {isActive && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-green-600">
                                    <Activity className="w-3.5 h-3.5" />
                                    LIVE — TRANSCRIPTION ACTIVE
                                </div>
                            )}
                            {isFinished && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-soft-400">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    SESSION COMPLETED
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {!isFinished && (
                        <button
                            onClick={() => {
                                const newState = !isLiveAudioEnabled;
                                setIsLiveAudioEnabled(newState);
                                if (newState) {
                                    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                                        audioCtxRef.current.resume();
                                    } else if (!audioCtxRef.current) {
                                        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                                    }
                                }
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-2xl border shadow-sm soft-transition ${
                                isLiveAudioEnabled ? "bg-primary-50 border-primary-100 text-primary-600" : "bg-white border-soft-100 text-soft-400"
                            }`}
                        >
                            {isLiveAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                            <span className="text-xs font-bold">{isLiveAudioEnabled ? "Audio On" : "Join Audio"}</span>
                        </button>
                    )}
                    {!isFinished && (
                        <div className="relative">
                            <button onClick={() => setShowParticipantsPopover(!showParticipantsPopover)} className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-soft-100 shadow-sm hover:bg-soft-50">
                                <Users className="w-4 h-4 text-primary-500" />
                                <span className="text-xs font-bold text-soft-700">{participantCount} Online</span>
                            </button>
                            <AnimatePresence>
                                {showParticipantsPopover && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-full right-0 mt-2 w-52 bg-white border border-soft-100 rounded-2xl shadow-soft-2xl p-4 z-50">
                                        <h4 className="text-[10px] font-bold text-soft-400 uppercase tracking-widest mb-3">Active Participants</h4>
                                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                            {participantsList.map((p, idx) => (
                                                <div key={idx} className="flex items-center justify-between gap-2 p-1 hover:bg-soft-50 rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${p.role === 'teacher' ? 'bg-indigo-500' : 'bg-green-500'}`}></div>
                                                        <span className={`text-xs font-medium truncate ${p.role === 'teacher' ? 'text-indigo-700 font-bold' : 'text-soft-700'}`}>{p.name}</span>
                                                    </div>
                                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${p.role === 'teacher' ? 'bg-indigo-100 text-indigo-600' : 'bg-green-100 text-green-600'}`}>{p.role}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {!isFinished && (
                        <button onClick={() => { setShowSmartSidebar(true); setUnreadDoubts(0); }} className="relative flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-soft-100 shadow-sm hover:bg-soft-50">
                            <HelpCircle className="w-4 h-4 text-primary-500" />
                            <span className="text-xs font-bold text-soft-700">Questions</span>
                            {unreadDoubts > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">{unreadDoubts}</span>}
                        </button>
                    )}
                    <button onClick={() => setShowInsights(!showInsights)} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-soft-200 text-soft-700 rounded-2xl font-bold hover:bg-soft-50 shadow-sm">
                        {showInsights ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                        {showInsights ? "Hide Notes" : "Show Notes"}
                    </button>
                    <button
                        onClick={async () => {
                            setIsExporting(true);
                            try { await downloadSessionPDF(id, `session_${id}_insights.pdf`); } finally { setIsExporting(false); }
                        }}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-2xl font-bold hover:bg-primary-600 shadow-soft disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Export PDF
                    </button>
                    {!isFinished && (
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-bold hover:bg-red-100 shadow-sm soft-transition"
                        >
                            <X className="w-4 h-4" />
                            Leave Session
                        </button>
                    )}
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6 min-h-[600px] lg:h-[calc(100vh-180px)]">
                <div className="flex-1 flex gap-6 min-w-0">
                    {/* Transcription Panel */}
                    <div className={`${(showInsights || (currentContext?.type && currentContext.type !== "none")) ? (activeTab === "material" ? 'flex-[1]' : 'flex-[2]') : 'flex-1'} flex flex-col bg-white rounded-[2.5rem] shadow-soft border border-soft-100 overflow-hidden relative min-h-0`}>
                        <div className="px-8 py-5 border-b border-soft-100 flex justify-between items-center bg-soft-50/50">
                            <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-primary-500" /><h2 className="text-base font-bold text-soft-900">Transcript</h2></div>
                            <div className="flex gap-1.5 p-1 bg-soft-100 rounded-xl">
                                <button onClick={() => setAutoScroll(true)} className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg ${autoScroll ? 'bg-white text-primary-500' : 'text-soft-400'}`}>Auto</button>
                                <button onClick={() => setAutoScroll(false)} className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg ${!autoScroll ? 'bg-white text-primary-500' : 'text-soft-400'}`}>Pause</button>
                            </div>
                        </div>

                        <div ref={transcriptRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                            {transcripts.length > 0 ? transcripts.map((t, idx) => (
                                <div key={idx} className="flex gap-4 items-start">
                                    <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-full bg-soft-50 border border-soft-100 flex items-center justify-center text-[10px] font-bold text-primary-500">{id.substring(0, 1)}</div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-black text-soft-400 uppercase tracking-widest">00:{Math.floor(t.start || 0).toString().padStart(2, '0')}</span>
                                            <button onClick={() => speak(t.text)} className="ml-auto p-1 text-soft-300 hover:text-primary-500"><Zap className="w-3 h-3" /></button>
                                        </div>
                                        <p className={`text-sm leading-relaxed ${classifyLine(t.text) === 'important' ? 'text-primary-900 font-bold' : 'text-soft-700'}`}>{t.text}</p>
                                    </div>
                                </div>
                            )) : !partialText && <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-40"><MessageSquare className="w-8 h-8 mb-4" /><p className="text-xs">Waiting for class...</p></div>}
                            {partialText && <div className="flex gap-4 items-start opacity-50 italic"><div className="mt-1 w-8 h-8 rounded-full bg-soft-50 animate-pulse"></div><p className="text-sm">{partialText}...</p></div>}
                        </div>
                        
                        {!isFinished && (
                            <div className="px-6 py-4 border-t border-soft-100 bg-white flex items-center justify-between gap-4">
                                <div className="flex gap-1.5">
                                    {["👍", "❤️", "😮", "❓"].map((e) => (
                                        <button key={e} onClick={() => sendReaction(e)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary-50 active:scale-90 text-lg">{e}</button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={raiseHand} className="h-10 px-4 bg-orange-50 text-orange-600 rounded-xl font-bold text-[10px] uppercase hover:bg-orange-100 active:scale-95 flex items-center gap-2"><Hand className="w-3.5 h-3.5" />Hand</button>
                                    <button onMouseDown={startStudentRecording} onMouseUp={stopStudentRecording} onMouseLeave={stopStudentRecording} onTouchStart={startStudentRecording} onTouchEnd={stopStudentRecording} className={`h-10 px-5 rounded-xl font-bold text-[10px] uppercase shadow-sm flex items-center gap-2 ${isSpeaking ? "bg-red-500 text-white animate-pulse" : "bg-white border text-soft-600"}`}>
                                        {isSpeaking ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 text-soft-400" />}
                                        {isSpeaking ? "Speaking" : "PTT"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Panel */}
                    {(showInsights || activeTab === "assessment" || (currentContext?.type && currentContext.type !== "none")) && (
                        <div className={`${activeTab === "material" ? 'flex-[3]' : 'flex-[2]'} bg-white rounded-[2.5rem] shadow-soft border border-soft-100 overflow-hidden flex flex-col min-h-0`}>
                            <div className="px-8 py-5 border-b border-soft-100 bg-soft-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    {(currentContext?.type && currentContext.type !== "none") && (
                                        <button onClick={() => setActiveTab("material")} className={`font-bold pb-2 border-b-2 ${activeTab === "material" ? "border-primary-500 text-primary-500" : "text-soft-400"}`}>Live Vision</button>
                                    )}
                                    {showInsights && (
                                        <button onClick={() => setActiveTab("insights")} className={`font-bold pb-2 border-b-2 ${activeTab === "insights" || (!currentContext?.type || currentContext.type === "none") ? "border-primary-500 text-primary-500" : "text-soft-400"}`}>Insights</button>
                                    )}
                                    <button onClick={() => setActiveTab("assessment")} className={`font-bold pb-2 border-b-2 ${activeTab === "assessment" ? "border-primary-500 text-primary-500" : "text-soft-400"}`}>Assessment</button>
                                </div>
                                <button onClick={() => setShowInsights(false)} className="p-2 text-soft-400 hover:text-soft-600"><X className="w-4 h-4" /></button>
                            </div>
    
                            <div className="flex-1 overflow-y-auto bg-soft-50 relative custom-scrollbar">
                                {(activeTab === "material" && currentContext?.type && currentContext.type !== "none") ? (
                                    <div className="absolute inset-0 p-4">
                                        <div className="w-full h-full bg-white rounded-[2rem] shadow-sm border border-soft-200 overflow-hidden relative">
                                            {currentContext.type === "screen" ? (screenFrame ? <img src={screenFrame} alt="Screen" className="w-full h-full object-contain" /> : <div className="flex flex-col items-center justify-center h-full opacity-50"><Loader2 className="w-10 h-10 animate-spin mb-4" /><p className="text-[10px] font-black uppercase">Awaiting Stream...</p></div>) : currentContext.type === "pdf" ? <iframe src={`${resolveUrl(currentContext.url)}#page=${currentContext.page || 1}`} className="w-full h-full border-none bg-white" title="PDF" /> : <img src={resolveUrl(currentContext.url)} alt="Shared" className="w-full h-full object-contain" />}
                                            {webcamFrame && <div className="absolute bottom-6 right-6 w-48 h-32 bg-soft-900 rounded-2xl border-2 border-white shadow-soft-xl overflow-hidden z-30"><img src={webcamFrame} alt="Teacher" className="w-full h-full object-cover" /></div>}
                                        </div>
                                    </div>
                                ) : activeTab === "assessment" ? (
                                    <div className="p-8 space-y-6">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-primary-600 p-2.5 rounded-2xl text-white shadow-soft-sm">
                                                    <Trophy className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-soft-900 text-base">RAG Assessments</h3>
                                                    <p className="text-[10px] text-soft-400 uppercase font-black tracking-widest">Powered by Classroom Context</p>
                                                </div>
                                            </div>
                                            {user?.role === "teacher" && (
                                                <div className="flex gap-2">
                                                    <button onClick={handleIndexMaterials} disabled={isIndexing} className="h-9 px-4 bg-soft-100 hover:bg-soft-200 text-soft-700 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all">
                                                        {isIndexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                                                        Index Materials
                                                    </button>
                                                    <button onClick={handleGenerateRagQuiz} disabled={isGeneratingQuiz} className="h-9 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-2 transition-all">
                                                        {isGeneratingQuiz ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                        Generate Quiz
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {!ragQuiz && !ragQuizResults && (
                                            <div className="bg-white rounded-[2rem] border border-soft-100 p-12 text-center shadow-soft-sm">
                                                <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                                    <HelpCircle className="w-10 h-10 text-primary-400" />
                                                </div>
                                                <h4 className="font-bold text-soft-800 text-lg mb-2">No active assessment</h4>
                                                <p className="text-sm text-soft-500 max-w-sm mx-auto mb-8">
                                                    {user?.role === "teacher" 
                                                        ? "Generate a quiz from the lecture transcript and materials to test your students." 
                                                        : "Awaiting teacher to generate a RAG-based assessment for this session."}
                                                </p>
                                                <button onClick={handleFetchRagQuiz} className="px-6 py-3 bg-soft-100 hover:bg-soft-200 text-soft-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-colors">
                                                    Check for Quiz
                                                </button>
                                            </div>
                                        )}

                                        {ragQuiz && !ragQuizResults && (
                                            <div className="space-y-6">
                                                <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 mb-4">
                                                    <h4 className="font-bold text-indigo-900 mb-1">{ragQuiz.title}</h4>
                                                    <p className="text-xs text-indigo-700 opacity-70">This assessment is grounded in the teacher's explanation and session materials.</p>
                                                </div>
                                                
                                                {ragQuiz?.questions?.map((q, qIndex) => (
                                                    <div key={q.id} className="bg-white rounded-3xl border border-soft-100 p-6 shadow-sm">
                                                        <div className="flex gap-4 items-start">
                                                            <div className="w-8 h-8 rounded-xl bg-soft-50 text-soft-400 flex items-center justify-center font-bold text-xs flex-shrink-0 border border-soft-100">{qIndex + 1}</div>
                                                            <div className="flex-1">
                                                                <p className="text-sm font-bold text-soft-900 mb-4">{q.question}</p>
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
                                                
                                                <div className="flex justify-end pt-4">
                                                    <button onClick={handleSubmitRagQuiz} disabled={isSubmittingQuiz} className="h-12 px-10 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-bold text-sm uppercase shadow-lg shadow-primary-500/20 active:scale-95 transition-all flex items-center gap-2">
                                                        {isSubmittingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                                        Submit Assessment
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {ragQuizResults && (
                                            <div className="space-y-6">
                                                <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-8 text-center">
                                                    <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
                                                        <Trophy className="w-8 h-8" />
                                                    </div>
                                                    <h4 className="font-bold text-emerald-900 text-xl mb-1">Assessment Submitted!</h4>
                                                    <p className="text-sm text-emerald-700 font-bold mb-4">You scored {ragQuizResults.score} points</p>
                                                    <button onClick={() => {setRagQuizResults(null); setRagAnswers({});}} className="px-6 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider">Retake Quiz</button>
                                                </div>

                                                {ragQuizResults?.results?.map((res, idx) => (
                                                    <div key={idx} className={`bg-white rounded-3xl border p-6 shadow-sm ${res.score >= (res.max_points || 10) / 2 ? 'border-emerald-100' : 'border-red-100'}`}>
                                                        <div className="flex gap-4 items-start">
                                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${res.score >= (res.max_points || 10) / 2 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                                {res.score >= (res.max_points || 10) / 2 ? <CheckCircle className="w-5 h-5" /> : <X className="w-5 h-5" />}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <p className="text-[10px] font-black text-soft-400 uppercase tracking-widest">Question {idx + 1}</p>
                                                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${res.score >= (res.max_points || 10) / 2 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>Score: {res.score}/{res.max_points || 10}</span>
                                                                </div>
                                                                <p className="text-xs text-soft-600 mb-4">{res.feedback}</p>
                                                                
                                                                {(res.evidence || res.teacher_quote) && (
                                                                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <Sparkles className="w-3 h-3 text-indigo-500" />
                                                                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">Teacher's Explanation (Grounded Truth)</span>
                                                                        </div>
                                                                        <p className="text-xs text-indigo-900 italic font-medium leading-relaxed">
                                                                            "{res.evidence || res.teacher_quote}"
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-6 space-y-5">
                                        <div className="bg-white rounded-3xl p-6 border border-soft-100 shadow-sm">
                                            <div className="flex items-center gap-2 mb-4"><div className="bg-indigo-600 p-2 rounded-xl text-white"><Brain className="w-4 h-4" /></div><h3 className="font-bold text-soft-900 uppercase text-[10px]">Live Analysis</h3></div>
                                            {analysis?.summary ? (
                                                <div className="space-y-4">
                                                    {analysis.audio_summary_url && (
                                                        <div className="relative overflow-hidden rounded-2xl" style={{background: 'linear-gradient(135deg, #312e81, #4f46e5, #7c3aed)'}}>
                                                            {/* Decorative background circles */}
                                                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                                                <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                                                                <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                                                            </div>
                                                            <div className="relative z-10 p-4">
                                                                {/* Header */}
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                                                        <Mic className="w-4 h-4 text-white" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-white font-bold text-xs uppercase tracking-widest">Podcast Recap</p>
                                                                        <p className="text-purple-200 text-[10px]">AI-Generated Audio Summary</p>
                                                                    </div>
                                                                    <div className="ml-auto flex items-end gap-0.5 h-4">
                                                                        {[3, 5, 7, 4, 6, 3, 5, 7, 6, 4, 3].map((h, i) => (
                                                                            <div
                                                                                key={i}
                                                                                className="w-0.5 bg-white/60 rounded-full"
                                                                                style={{ height: `${h * 2}px`, opacity: 0.5 + (i % 3) * 0.2 }}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                {/* Audio player */}
                                                                <audio
                                                                    controls
                                                                    src={analysis.audio_summary_url}
                                                                    className="w-full"
                                                                    style={{ filter: 'invert(1) hue-rotate(180deg)', height: '36px' }}
                                                                />
                                                                <p className="text-purple-200 text-[10px] mt-2 text-center opacity-70">Powered by Microsoft Edge Neural TTS</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="bg-soft-50 p-6 rounded-2xl text-left border border-soft-100">{renderMarkdown(analysis.summary)}</div>
                                                </div>
                                            ) : (
                                                <div className="py-12 text-center opacity-40"><div className="w-16 h-16 bg-soft-50 rounded-full flex items-center justify-center mx-auto mb-4">{isGenerating ? <Loader2 className="w-8 h-8 animate-spin" /> : <Sparkles className="w-8 h-8" />}</div><h4 className="font-bold text-soft-900 mb-2">Awaiting Insight</h4><p className="text-[10px] max-w-[200px] mx-auto">Smart summary will be available soon.</p></div>
                                            )}
                                        </div>
                                        {isFinished && (
                                            <div className="bg-white rounded-3xl border border-soft-100 shadow-sm overflow-hidden">
                                                <div className="px-6 py-4 bg-gradient-to-r from-violet-50 to-indigo-50 border-b border-soft-100 flex items-center gap-2"><div className="p-2 bg-violet-600 rounded-xl text-white"><PlayCircle className="w-4 h-4" /></div><h3 className="font-bold text-soft-900 text-sm">Recommended</h3></div>
                                                <div className="p-5">
                                                    {Object.entries(resources).map(([concept, items]) => (
                                                        <div key={concept} className="mb-6">
                                                            <h4 className="text-xs font-black text-soft-700 uppercase mb-3">{concept}</h4>
                                                            <div className="space-y-3">
                                                                {items.map((res) => (
                                                                    <div key={res.resource_id} className="flex gap-3 p-3 rounded-2xl border border-soft-100 hover:bg-violet-50/30">
                                                                        <div className="w-24 h-16 bg-soft-100 rounded-xl overflow-hidden">{res.thumbnail && <img src={res.thumbnail} className="w-full h-full object-cover" />}</div>
                                                                        <div className="flex-1 min-w-0"><p className="text-xs font-bold text-soft-800 truncate mb-1">{res.title}</p><a href={res.url} target="_blank" className="text-[10px] font-black text-violet-600 uppercase hover:underline">Open</a></div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {showSmartSidebar && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSmartSidebar(false)} className="fixed inset-0 bg-soft-900/10 backdrop-blur-[2px] z-40" />
                        <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="fixed top-0 right-0 h-full w-80 bg-white border-l border-soft-100 shadow-2xl z-50 p-6 flex flex-col">
                            <div className="flex items-center justify-between mb-8"><h2 className="font-bold text-soft-800">Smart Insights</h2><button onClick={() => setShowSmartSidebar(false)} className="p-2 hover:bg-soft-50 rounded-xl"><X className="w-5 h-5" /></button></div>
                            <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
                                <section><h3 className="text-xs font-bold text-soft-400 uppercase mb-4">Concepts</h3>{analysis.concepts?.slice(0, 5).map((c, idx) => (<div key={idx} className="p-3 bg-white border border-soft-100 rounded-xl shadow-sm mb-3"><span className="text-sm font-bold text-soft-700">{c}</span></div>))}</section>
                                <section><h3 className="text-xs font-bold text-soft-400 uppercase mb-4">Doubts</h3>{doubts.map((d) => (<div key={d.id} className="p-3 bg-orange-50/30 border border-orange-100 rounded-xl mb-3"><p className="text-[10px] font-bold text-orange-700">{d.sender}</p><p className="text-xs text-soft-600 italic">"{d.text}"</p></div>))}</section>
                                <div className="mt-8 pt-6 border-t border-soft-100/50"><div className="flex gap-2 p-1 bg-soft-50 rounded-2xl border border-soft-100"><input type="text" value={newDoubtText} onChange={(e) => setNewDoubtText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitDoubt()} placeholder="Ask a question..." className="flex-1 bg-transparent px-4 py-2 text-xs focus:outline-none" /><button onClick={submitDoubt} className="p-2 bg-primary-500 text-white rounded-xl"><Share2 className="w-3.5 h-3.5 rotate-90" /></button></div></div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {/* Feature 1: Floating AI Teaching Assistant Button + Chat Panel          */}
            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}

            {/* Floating AI Bot Button */}
            <motion.button
                id="ai-assistant-btn"
                onClick={() => setShowAiChat(true)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="fixed bottom-8 right-8 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center"
                style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)",
                    boxShadow: "0 0 24px rgba(139, 92, 246, 0.5), 0 4px 20px rgba(0,0,0,0.2)"
                }}
                title="Ask AI Teaching Assistant"
            >
                <Bot className="w-6 h-6 text-white" />
            </motion.button>

            {/* AI Chat Panel */}
            <AnimatePresence>
                {showAiChat && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                setShowAiChat(false);
                                if (window.speechSynthesis) window.speechSynthesis.cancel();
                            }}
                            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 40, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 40, scale: 0.96 }}
                            className="fixed bottom-24 right-8 w-[400px] z-50 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
                            style={{
                                background: "rgba(15, 10, 30, 0.95)",
                                backdropFilter: "blur(20px)",
                                border: "1px solid rgba(139, 92, 246, 0.3)",
                                maxHeight: "70vh"
                            }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(139,92,246,0.2)" }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
                                        <Bot className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-white font-bold text-sm">AI Teaching Assistant</p>
                                        <p className="text-purple-300 text-[10px]">Ask anything about this session</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {isSpeakingAi && (
                                        <button 
                                            onClick={() => {
                                                window.speechSynthesis.cancel();
                                                setIsSpeakingAi(false);
                                            }} 
                                            className="p-1.5 rounded-lg hover:bg-white/10 text-red-400 hover:text-red-300 transition-colors animate-pulse"
                                            title="Stop Reading"
                                        >
                                            <Square className="w-4 h-4 fill-current" />
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => {
                                            setShowAiChat(false);
                                            if (window.speechSynthesis) window.speechSynthesis.cancel();
                                        }} 
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-purple-300 hover:text-white transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Chat Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" style={{ minHeight: "200px" }}>
                                {aiChatHistory.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-32 text-center opacity-50">
                                        <Sparkles className="w-8 h-8 text-purple-400 mb-2" />
                                        <p className="text-purple-200 text-xs">Ask me anything about what's being taught!</p>
                                        <p className="text-purple-400 text-[10px] mt-1">I have context from your session transcript</p>
                                    </div>
                                )}
                                {aiChatHistory.map((msg) => (
                                    <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                                        {msg.role === "bot" && (
                                            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
                                                <Bot className="w-3.5 h-3.5 text-white" />
                                            </div>
                                        )}
                                        <div
                                            className="max-w-[80%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed"
                                            style={{
                                                background: msg.role === "user"
                                                    ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                                                    : msg.isError
                                                    ? "rgba(239,68,68,0.15)"
                                                    : "rgba(255,255,255,0.08)",
                                                color: msg.role === "user" ? "white" : msg.isError ? "#fca5a5" : "#e2e8f0",
                                                border: msg.role === "bot" ? "1px solid rgba(139,92,246,0.2)" : "none"
                                            }}
                                        >
                                            {msg.text}
                                            {msg.role === "bot" && !msg.isError && (
                                                <button
                                                    onClick={() => speak(msg.text, 0.9)}
                                                    className="ml-2 opacity-50 hover:opacity-100 inline-flex items-center"
                                                    title="Read aloud"
                                                >
                                                    <Volume2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isAiLoading && (
                                    <div className="flex gap-2">
                                        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
                                            <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                                        </div>
                                        <div className="px-4 py-2.5 rounded-2xl" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                                            <div className="flex gap-1 items-center">
                                                {[0, 0.2, 0.4].map((d, i) => (
                                                    <div key={i} className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={aiChatBottomRef} />
                            </div>

                            {/* Input Area */}
                            <div className="p-4 flex gap-2" style={{ borderTop: "1px solid rgba(139,92,246,0.2)" }}>
                                <input
                                    id="ai-question-input"
                                    type="text"
                                    value={aiQuestion}
                                    onChange={(e) => setAiQuestion(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && askAIQuestion()}
                                    placeholder="Ask a question about the lesson..."
                                    className="flex-1 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    style={{ background: "rgba(255,255,255,0.08)", color: "#e2e8f0", border: "1px solid rgba(139,92,246,0.2)" }}
                                    disabled={isAiLoading}
                                />
                                <button
                                    id="ai-send-btn"
                                    onClick={askAIQuestion}
                                    disabled={isAiLoading || !aiQuestion.trim()}
                                    className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 transition-all"
                                    style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}
                                >
                                    <Send className="w-4 h-4 text-white" />
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {/* Feature 5: Pop Quiz Overlay                                           */}
            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <AnimatePresence>
                {activeQuiz && (quizMode || quizResult || isGrading) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-6"
                        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
                    >
                        <motion.div
                            initial={{ scale: 0.85, y: 30 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.85, y: 30 }}
                            className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
                            style={{
                                background: "linear-gradient(145deg, #0f0a1e, #1a0f3a)",
                                border: "1px solid rgba(139,92,246,0.4)"
                            }}
                        >
                            {/* Quiz Header */}
                            <div className="px-8 pt-8 pb-4" style={{ borderBottom: "1px solid rgba(139,92,246,0.2)" }}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
                                        <Trophy className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-amber-400 font-black text-xs uppercase tracking-widest">🧠 Pop Quiz!</p>
                                        <p className="text-white font-bold">Answer via Push-to-Talk</p>
                                    </div>
                                    {quizMode && quizCountdown > 0 && (
                                        <div className="ml-auto text-right">
                                            <p className={`text-2xl font-black ${quizCountdown <= 10 ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}>
                                                {quizCountdown}s
                                            </p>
                                            <p className="text-purple-400 text-[10px]">remaining</p>
                                        </div>
                                    )}
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 border border-purple-500/20">
                                    <p className="text-white text-sm leading-relaxed font-medium">{activeQuiz.question}</p>
                                </div>
                            </div>

                            {/* Quiz Body */}
                            <div className="px-8 py-6">
                                {isGrading && (
                                    <div className="flex flex-col items-center py-6">
                                        <Loader2 className="w-10 h-10 text-purple-400 animate-spin mb-3" />
                                        <p className="text-purple-200 font-bold">AI is grading your answer...</p>
                                        <p className="text-purple-400 text-xs mt-1">This takes just a moment</p>
                                    </div>
                                )}

                                {quizResult && (
                                    <div className="space-y-4">
                                        {/* Score Card */}
                                        <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))", border: "1px solid rgba(139,92,246,0.3)" }}>
                                            <div className="text-center">
                                                <p className="text-4xl font-black" style={{
                                                    color: quizResult.grade === 'A' ? '#34d399' : quizResult.grade === 'B' ? '#60a5fa' : quizResult.grade === 'C' ? '#fbbf24' : '#f87171'
                                                }}>{quizResult.grade}</p>
                                                <p className="text-purple-300 text-[10px] font-bold uppercase">Grade</p>
                                            </div>
                                            <div className="w-px h-12 bg-purple-500/30" />
                                            <div className="text-center">
                                                <p className="text-4xl font-black text-white">{quizResult.score}<span className="text-purple-400 text-lg">/10</span></p>
                                                <p className="text-purple-300 text-[10px] font-bold uppercase">Score</p>
                                            </div>
                                            <div className="flex-1">
                                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-1000"
                                                        style={{
                                                            width: `${quizResult.score * 10}%`,
                                                            background: quizResult.grade === 'A' ? '#34d399' : quizResult.grade === 'B' ? '#60a5fa' : quizResult.grade === 'C' ? '#fbbf24' : '#f87171'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {/* Feedback */}
                                        <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                            <p className="text-purple-300 text-[10px] font-bold uppercase mb-2">AI Feedback</p>
                                            <p className="text-white/80 text-sm leading-relaxed">{quizResult.feedback}</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => speak(`Your grade is ${quizResult.grade}, score ${quizResult.score} out of 10. ${quizResult.feedback}`, 0.9)}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-purple-300 hover:text-white text-sm font-bold transition-colors"
                                                style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
                                            >
                                                <Volume2 className="w-4 h-4" /> Read Aloud
                                            </button>
                                            <button
                                                onClick={() => { setActiveQuiz(null); setQuizResult(null); setQuizAnswer(""); setQuizMode(false); }}
                                                className="flex-1 py-3 rounded-xl text-white font-bold text-sm transition-all"
                                                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                                            >
                                                Done ✓
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {quizMode && !isGrading && !quizResult && (
                                    <div className="space-y-4">
                                        {/* Captured answer preview / editor */}
                                        <div className="p-4 rounded-2xl" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)" }}>
                                            <p className="text-indigo-300 text-[10px] font-bold uppercase mb-2">Your Answer (SPOKEN OR TYPED):</p>
                                            <textarea 
                                                value={quizAnswer}
                                                onChange={(e) => setQuizAnswer(e.target.value)}
                                                className="w-full bg-transparent text-white text-sm italic border-none focus:ring-0 p-0 custom-scrollbar resize-none h-20"
                                                placeholder="Capturing transcription... or type here."
                                            />
                                        </div>
                                        <div className="flex flex-col items-center gap-3 py-4">
                                            <p className="text-purple-200 text-xs text-center">Hold the PTT button below to record your answer, then submit</p>
                                            <div className="flex items-center gap-3">
                                                <div
                                                    onMouseDown={startStudentRecording}
                                                    onMouseUp={stopStudentRecording}
                                                    onMouseLeave={stopStudentRecording}
                                                    onTouchStart={startStudentRecording}
                                                    onTouchEnd={stopStudentRecording}
                                                    className={`w-16 h-16 rounded-full flex items-center justify-center cursor-pointer shadow-xl transition-all ${
                                                        isSpeaking ? "scale-110" : "scale-100"
                                                    }`}
                                                    style={{
                                                        background: isSpeaking
                                                            ? "linear-gradient(135deg, #ef4444, #dc2626)"
                                                            : "linear-gradient(135deg, #6366f1, #a855f7)",
                                                        boxShadow: isSpeaking ? "0 0 0 12px rgba(239,68,68,0.2)" : "0 0 0 0px transparent",
                                                        transition: "all 0.2s"
                                                    }}
                                                >
                                                    {isSpeaking ? <Mic className="w-7 h-7 text-white animate-pulse" /> : <MicOff className="w-7 h-7 text-white" />}
                                                </div>
                                            </div>
                                            <p className="text-purple-400 text-[10px]">{isSpeaking ? "Recording... release to stop" : "Hold to speak"}</p>
                                        </div>
                                        <button
                                            id="quiz-submit-btn"
                                            onClick={submitQuizAnswer}
                                            disabled={!quizAnswer.trim()}
                                            className="w-full py-3.5 rounded-xl font-bold text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", boxShadow: "0 4px 20px rgba(245,158,11,0.3)" }}
                                        >
                                            Submit Answer →
                                        </button>
                                        <button
                                            onClick={() => { setActiveQuiz(null); setQuizMode(false); setQuizAnswer(""); if (quizCountdownRef.current) { clearInterval(quizCountdownRef.current); } }}
                                            className="w-full py-2 text-purple-400 hover:text-purple-200 text-xs font-medium transition-colors"
                                        >
                                            Skip quiz
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
