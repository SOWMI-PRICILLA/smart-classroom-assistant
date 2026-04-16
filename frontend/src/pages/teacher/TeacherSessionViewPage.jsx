import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    getSessionTranscripts,
    getSessionAnalysis,
    getSessionDetail,
    finalizeSessionAnalysis,
    stopSession,
    uploadMaterial,
    updateSessionMetadata,
    downloadSessionPDF,
    getSessionResources,
    fetchSessionResources,
    addSessionResource,
    updateSessionResource,
    deleteSessionResource,
    deleteSessionMaterial, // Use consistent API method
    generateRagQuiz,
    indexSessionMaterials,
    resolveUrl,           // Dynamic URL resolution
} from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronLeft,
    ChevronRight,
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
    BookOpen,
    Brain,
    Monitor,
    Shield,
    Square,
    Plus,
    Camera,
    Users,
    Hand,
    X,
    RefreshCw,
    Mic,
    MicOff,
    Trash2,
    PlayCircle,
    ExternalLink,
    Edit2,
    Youtube,
    Volume2,
    Save,
    Trophy,
    Send,
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

export default function TeacherSessionViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // --- Core state ---
    const [transcripts, setTranscripts] = useState([]);
    const [partialText, setPartialText] = useState("");
    const [autoScroll, setAutoScroll] = useState(true);
    const [isStopping, setIsStopping] = useState(false);
    const transcriptRef = useRef(null);

    // --- Teaching Materials State ---
    const [teachingMaterials, setTeachingMaterials] = useState([]); // Array of { id, name, type, url }
    const [currentMaterialIndex, setCurrentMaterialIndex] = useState(-1);
    const [currentPage, setCurrentPage] = useState(1);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isWebcamSharing, setIsWebcamSharing] = useState(false);
    const [syncMode, setSyncMode] = useState(true); // Control whether to broadcast context or not
    const screenStreamRef = useRef(null);
    const screenIntervalRef = useRef(null);
    const webcamStreamRef = useRef(null);
    const webcamIntervalRef = useRef(null);
    const screenVideoRef = useRef(null); // Teacher's own screen preview
    const webcamVideoRef = useRef(null); // Teacher's own webcam preview
    const isSharingRef = useRef(false);  // Guard to kill screen capture loop
    const isWebcamRef = useRef(false);   // Guard to kill webcam capture loop
    const [isMuted, setIsMuted] = useState(false);
    const isMutedRef = useRef(false);
    const lastFinalizedIndexRef = useRef(-1); // Unique index tracking for browser transcription segments
    const lastGlobalFinalizedTextRef = useRef(""); // Final safety to prevent cross-session repetition
    const lastTranscriptionActivityRef = useRef(Date.now()); // Watchdog for stalling
    const recognitionStartTimeRef = useRef(Date.now()); // Proactive rotation (45s restart)
    const [isExporting, setIsExporting] = useState(false);
    const [isWsConnected, setIsWsConnected] = useState(false);

    // --- Session state ---
    const [sessionStatus, setSessionStatus] = useState("loading"); // "loading" | "active" | "finished"
    const [isUploading, setIsUploading] = useState(false);
    const [participantCount, setParticipantCount] = useState(1);
    const [participants, setParticipants] = useState([]);
    const [showParticipantList, setShowParticipantList] = useState(false);
    const [showQuestionsBoard, setShowQuestionsBoard] = useState(false);
    const [doubts, setDoubts] = useState([]); // Same logic as student side
    const [reactions, setReactions] = useState([]);
    const [handRaises, setHandRaises] = useState([]); // Array of { id, sender, timestamp }
    const isFinished = sessionStatus === "finished" || sessionStatus === "completed";
    const isActive = sessionStatus === "active";

    // --- Feature 5: Pop Quiz ---
    const [showQuizModal, setShowQuizModal] = useState(false);
    const [quizQuestion, setQuizQuestion] = useState("");
    const [activeQuizQuestion, setActiveQuizQuestion] = useState("");
    const [quizResponses, setQuizResponses] = useState([]);
    const [showQuizResponses, setShowQuizResponses] = useState(false);

    const handleStopSession = async () => {
        if (!window.confirm("Are you sure you want to stop this session? This will finalize the recording.")) return;
        setIsStopping(true);
        try {
            await stopSession(id);
            setSessionStatus("finished");
            
            // Auto-trigger material indexing to prepare for RAG
            try {
                await indexSessionMaterials(id);
            } catch (indexErr) {
                console.error("Non-critical indexing failure:", indexErr);
            }
            
            // Broadcast termination to students
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: "session_terminated",
                    session_id: id
                }));
            }

            await loadAnalysis();
        } catch (err) {
            console.error("Failed to stop session:", err);
            alert("Failed to stop session. Please try again.");
        } finally {
            setIsStopping(false);
        }
    };

    // --- Analysis state ---
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
    const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
    const [generateError, setGenerateError] = useState(null);

    // --- Recommended Resources ---
    const [resources, setResources] = useState({}); // { concept: [...] }
    const [resourcesLoading, setResourcesLoading] = useState(false);
    const [isFetchingYT, setIsFetchingYT] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addFormData, setAddFormData] = useState({ concept: "", title: "", url: "", type: "youtube" });
    const [isAddingResource, setIsAddingResource] = useState(false);
    const [editingResourceId, setEditingResourceId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // --- Engagement Metrics ---


    const toggleMute = () => {
        const newState = !isMuted;
        setIsMuted(newState);
        isMutedRef.current = newState;
        if (streamRef.current) {
            streamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !newState;
            });
        }
        // Handle SpeechRecognition mute
        if (recognitionRef.current) {
            if (newState) {
                try { recognitionRef.current.stop(); } catch (e) {}
            } else {
                try { recognitionRef.current.start(); } catch (e) {}
            }
        }
    };

    // --- File Handling ---
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const result = await uploadMaterial(file);
            const newMaterial = {
                id: Math.random().toString(36).substr(2, 9),
                name: result.name,
                type: file.type.startsWith("image/") ? "image" : "pdf",
                url: result.url // Store RELATIVE path, resolved on demand by each client
            };
            const updatedList = [...teachingMaterials, newMaterial];
            setTeachingMaterials(updatedList);

            // Persist to backend - AWAIT this to ensure we catch errors and it finish
            await updateSessionMetadata(id, { teaching_materials: updatedList });

            // Always switch to the newly uploaded material if it's the only one or if teacher wants immediate feedback
            const newIndex = updatedList.length - 1;
            setCurrentMaterialIndex(newIndex);
            setCurrentPage(1);
            persistContext(1, newIndex);
        } catch (err) {
            console.error("Upload failed:", err);
            alert("File upload failed. Please check your connection.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteMaterial = async (e, materialId) => {
        e.stopPropagation();
        if (!window.confirm("Delete this material?")) return;
        try {
            await deleteSessionMaterial(id, materialId);
            const updatedList = teachingMaterials.filter(m => m.id !== materialId);
            setTeachingMaterials(updatedList);
            if (currentMaterialIndex >= 0 && teachingMaterials[currentMaterialIndex].id === materialId) {
                setCurrentMaterialIndex(-1);
            }
        } catch (err) {
            console.error("Delete failed:", err);
            alert("Failed to delete material.");
        }
    };

    const handleNextPage = () => {
        const next = currentPage + 1;
        setCurrentPage(next);
        persistContext(next, currentMaterialIndex);
    };
    const handlePrevPage = () => {
        const prev = Math.max(1, currentPage - 1);
        setCurrentPage(prev);
        persistContext(prev, currentMaterialIndex);
    };

    const persistContext = (page, materialIdx, customContext = null) => {
        let contextToPersist = customContext;
        if (!contextToPersist && materialIdx >= 0) {
            const material = teachingMaterials[materialIdx];
            contextToPersist = {
                type: material.type,
                id: material.id,
                name: material.name,
                url: material.url,
                page: page
            };
        }
        if (contextToPersist) {
            updateSessionMetadata(id, {
                current_context: contextToPersist
            }).catch(err => console.error("Failed to persist context:", err));

            // NEW: Immediately broadcast context update via WebSocket for zero-latency UI switching
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: "context_update",
                    session_id: id,
                    context: contextToPersist
                }));
            }
        }
    };

    // -----------------------------------------------------------------------
    // Fetch session detail (status, stored analysis)
    // -----------------------------------------------------------------------
    const loadSessionDetail = useCallback(async () => {
        try {
            const detail = await getSessionDetail(id);
            const status = detail.status || "active";
            setSessionStatus(status);

            if (detail.teaching_materials) {
                const normalizedMaterials = (detail.teaching_materials || []).map(m => ({
                    ...m,
                    url: resolveUrl(m.url)
                }));
                setTeachingMaterials(normalizedMaterials);
            }
            if (detail.current_context) {
                // If it was a material, find its index
                if (detail.current_context.type === "pdf" || detail.current_context.type === "image") {
                    const idx = (detail.teaching_materials || []).findIndex(m => m.id === detail.current_context.id);
                    if (idx !== -1) {
                        setCurrentMaterialIndex(idx);
                        setCurrentPage(detail.current_context.page || 1);
                    }
                } else if (detail.current_context.type === "screen") {
                    setIsScreenSharing(true);
                }
            }
        } catch (err) {
            console.error("Failed to load session detail:", err);
        }
    }, [id]);

    // -----------------------------------------------------------------------
    // Screen Sharing Logic
    // -----------------------------------------------------------------------
    async function toggleScreenSharing() {
        if (isScreenSharing) {
            stopScreenSharing();
        } else {
            startScreenSharing();
        }
    }

    async function startScreenSharing() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: false
            });
            screenStreamRef.current = stream;
            isSharingRef.current = true;
            setIsScreenSharing(true);

            // Show teacher's own live preview in the left panel
            if (screenVideoRef.current) {
                screenVideoRef.current.srcObject = stream;
                screenVideoRef.current.play().catch(() => {});
            }

            // Notify backend about the new context
            const screenCtx = { type: "screen", url: "live_stream", page: 1, name: "Screen Share" };
            persistContext(1, -1, screenCtx);

            // Set up frame capture — dedicated video element for canvas drawing
            const captureVideo = document.createElement('video');
            captureVideo.srcObject = stream;
            
            // Wait for video to be ready before starting to take snapshots
            await new Promise((resolve) => {
                captureVideo.onloadedmetadata = () => {
                    captureVideo.play().then(resolve);
                };
            });

            const canvas = document.createElement('canvas');
            const ctx2d = canvas.getContext('2d');

            screenIntervalRef.current = setInterval(() => {
                // Guard: bail immediately if sharing was stopped
                if (!isSharingRef.current) {
                    clearInterval(screenIntervalRef.current);
                    screenIntervalRef.current = null;
                    return;
                }
                if (!stream.active) {
                    stopScreenSharing();
                    return;
                }
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                if (!captureVideo.videoWidth || !captureVideo.videoHeight) return;

                // Lower resolution (960px) reduces encoding time significantly
                const targetW = 960;
                const targetH = Math.round((captureVideo.videoHeight / captureVideo.videoWidth) * targetW);
                if (canvas.width !== targetW) {
                    canvas.width = targetW;
                    canvas.height = targetH;
                }
                ctx2d.drawImage(captureVideo, 0, 0, targetW, targetH);

                const frame = canvas.toDataURL('image/jpeg', 0.55);
                wsRef.current.send(JSON.stringify({
                    type: "screen_frame",
                    session_id: id,
                    frame: frame
                }));
            }, 100); // 10 FPS — Smoother experience

            stream.getVideoTracks()[0].onended = () => stopScreenSharing();

        } catch (err) {
            console.error("Screen sharing error:", err);
            isSharingRef.current = false;
            setIsScreenSharing(false);
        }
    }

    function stopScreenSharing() {
        // Kill the capture loop guard FIRST — stops any in-flight interval callback immediately
        isSharingRef.current = false;

        // Clear interval
        if (screenIntervalRef.current) {
            clearInterval(screenIntervalRef.current);
            screenIntervalRef.current = null;
        }
        // Stop all tracks
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }
        // Clear teacher's own preview
        if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
        }
        setIsScreenSharing(false);
        // Revert to slides if available
        if (teachingMaterials.length > 0) {
            const idx = currentMaterialIndex >= 0 ? currentMaterialIndex : 0;
            persistContext(currentPage, idx);
        } else {
            persistContext(1, -1, null);
        }
    }

    // -----------------------------------------------------------------------
    // Webcam Sharing Logic
    // -----------------------------------------------------------------------
    async function toggleWebcam() {
        if (isWebcamSharing) {
            stopWebcam();
        } else {
            startWebcam();
        }
    }

    async function startWebcam() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, frameRate: 15 },
                audio: false
            });
            webcamStreamRef.current = stream;
            isWebcamRef.current = true;
            setIsWebcamSharing(true);

            if (webcamVideoRef.current) {
                webcamVideoRef.current.srcObject = stream;
                webcamVideoRef.current.play().catch(() => {});
            }

            const captureVideo = document.createElement('video');
            captureVideo.srcObject = stream;
            await new Promise((resolve) => {
                captureVideo.onloadedmetadata = () => {
                    captureVideo.play().then(resolve);
                };
            });

            const canvas = document.createElement('canvas');
            const ctx2d = canvas.getContext('2d');
            canvas.width = 160; // Very small for thumbnail stream
            canvas.height = 120;

            webcamIntervalRef.current = setInterval(() => {
                if (!isWebcamRef.current) {
                    clearInterval(webcamIntervalRef.current);
                    return;
                }
                if (!stream.active) {
                    stopWebcam();
                    return;
                }
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                
                ctx2d.drawImage(captureVideo, 0, 0, canvas.width, canvas.height);
                const frame = canvas.toDataURL('image/jpeg', 0.6);
                wsRef.current.send(JSON.stringify({
                    type: "webcam_frame",
                    session_id: id,
                    frame: frame
                }));
            }, 100); // 10 FPS for a smoother thumbnail

        } catch (err) {
            console.error("Webcam error:", err);
            setIsWebcamSharing(false);
            isWebcamRef.current = false;
        }
    }

    function stopWebcam() {
        isWebcamRef.current = false;
        if (webcamIntervalRef.current) {
            clearInterval(webcamIntervalRef.current);
            webcamIntervalRef.current = null;
        }
        if (webcamStreamRef.current) {
            webcamStreamRef.current.getTracks().forEach(track => track.stop());
            webcamStreamRef.current = null;
        }
        if (webcamVideoRef.current) {
            webcamVideoRef.current.srcObject = null;
        }
        setIsWebcamSharing(false);
    }
    useEffect(() => {
        if (isScreenSharing && screenVideoRef.current && screenStreamRef.current) {
            screenVideoRef.current.srcObject = screenStreamRef.current;
        }
    }, [isScreenSharing]);

    useEffect(() => {
        if (isWebcamSharing && webcamVideoRef.current && webcamStreamRef.current) {
            webcamVideoRef.current.srcObject = webcamStreamRef.current;
            webcamVideoRef.current.play().catch(() => {});
        }
    }, [isWebcamSharing]);

    // -----------------------------------------------------------------------
    // Fetch analysis
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
                taxonomy: data.taxonomy || {},
                questions: normalizeStringArray(data.questions),
                analysis_ready: data.analysis_ready || false,
                analyzed_at: data.analyzed_at || null,
                audio_summary_url: resolveUrl(data.audio_summary_url),
            });
            if (data.status) {
                setSessionStatus(data.status);
            }
        } catch (err) {
            console.error("Failed to fetch analysis:", err);
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
                const seenStarts = new Set(prev.filter(t => t.start != null).map(t => t.start));
                const newItems = history.filter(t => !seenStarts.has(t.start));
                
                if (newItems.length === 0) return prev;

                const combined = [...prev, ...newItems];
                return combined.sort((a, b) => (a.start || 0) - (b.start || 0));
            });
        } catch (err) {
            console.error("Failed to load transcripts:", err);
        }
    }, [id]);

    useEffect(() => {
        loadTranscripts();
        let interval;
        if (isActive || sessionStatus === "active") {
            interval = setInterval(loadTranscripts, 15000);
        }
        return () => clearInterval(interval);
    }, [id, isActive, sessionStatus, loadTranscripts]);

    // -----------------------------------------------------------------------
    // Load session detail + analysis on mount
    // -----------------------------------------------------------------------
    useEffect(() => {
        loadSessionDetail();
        loadAnalysis();
    }, [id]);

    // -----------------------------------------------------------------------
    // Poll session status while active
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (sessionStatus === "loading" || sessionStatus === "finished") return;

        const interval = setInterval(async () => {
            try {
                const detail = await getSessionDetail(id);
                const newStatus = detail.status || "active";
                if (newStatus !== sessionStatus) {
                    setSessionStatus(newStatus);
                    if (newStatus === "finished") {
                        clearInterval(interval);
                        // Session just ended — reload final transcript list and analysis
                        const data = await getSessionTranscripts(id);
                        setTranscripts(data.transcripts || []);
                        await loadAnalysis();
                    }
                }
            } catch (_) { }
        }, 5000); // Poll every 5 seconds so teacher dashboard stays responsive

        return () => clearInterval(interval);
    }, [sessionStatus, id, loadAnalysis]);

    // -----------------------------------------------------------------------
    // WebSocket & Audio Capture logic
    // -----------------------------------------------------------------------
    const audioContextRef = useRef(null);
    const audioProcessorRef = useRef(null);
    const streamRef = useRef(null);
    const wsRef = useRef(null);
    const isRecordingStarted = useRef(false);
    const audioCtxRef = useRef(null);
    const pcmPlayerRef = useRef(null);
    const recognitionRef = useRef(null);

    // Effect 1: Manage WebSocket lifecycle (dependent only on session ID)
    useEffect(() => {
        if (sessionStatus === "finished" || sessionStatus === "loading") return;
        console.log("Initializing WebSocket for session:", id);
        const wsUrl = `ws://${window.location.hostname}:8765`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WebSocket opened context:", id);
            setIsWsConnected(true);
            // Always subscribe to see transcripts
            ws.send(JSON.stringify({ type: "subscribe", session_id: id }));
            
            // Register as a participant (Teacher)
            if (user) {
                ws.send(JSON.stringify({
                    type: "join",
                    session_id: id,
                    role: "teacher",
                    name: user.full_name,
                    email: user.email
                }));
                
                // CRITICAL: Initialize as producer to start transcription engine
                ws.send(JSON.stringify({
                    type: "p_init",
                    session_id: id
                }));
            }
        };

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                // Incoming student audio chunk (Raw 16kHz PCM)
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
                
                const now = audioCtx.currentTime;
                if (!pcmPlayerRef.current || pcmPlayerRef.current < now) {
                    pcmPlayerRef.current = now;
                }
                source.start(pcmPlayerRef.current);
                pcmPlayerRef.current += buffer.duration;
                return;
            }

            const data = JSON.parse(event.data);
            if (data.session_id !== id) return;
            if (data.type === "partial") setPartialText(data.text);
            else if (data.type === "final") {
                setPartialText("");
                setTranscripts((prev) => {
                    // Avoid duplicating if polling already got it
                    const isDup = prev.some(t => t.text === data.text && Math.abs((t.start || 0) - (data.start || 0)) < 0.1);
                    if (isDup) return prev;
                    return [
                        ...prev,
                        {
                            text: data.text,
                            start: data.start,
                            duration: data.duration,
                            timestamp: new Date().toLocaleTimeString(),
                            context: data.context // Capture teaching context
                        },
                    ].sort((a, b) => (a.start || 0) - (b.start || 0));
                });

                // Auto-extract doubts for teacher
                if (data.text?.includes("?") && data.text.length > 10) {
                    const doubtId = Math.random().toString(36).substr(2, 9);
                    setDoubts(prev => [
                        {
                            id: doubtId,
                            text: data.text,
                            sender: data.text.split(":")[0]?.length < 20 ? data.text.split(":")[0] : "Student",
                            time: new Date().toLocaleTimeString()
                        },
                        ...prev
                    ].slice(0, 15));
                }
            } else if (data.type === "participant_count") {
                setParticipantCount(data.count);
                setParticipants(data.participants || []);
            } else if (data.type === "new_doubt") {
                const doubtId = Math.random().toString(36).substr(2, 9);
                setDoubts(prev => [
                    {
                        id: doubtId,
                        text: data.text,
                        sender: data.sender || "Student",
                        time: new Date().toLocaleTimeString()
                    },
                    ...prev
                ].slice(0, 15));
            } else if (data.type === "reaction") {
                const rid = Math.random().toString(36).substr(2, 9);
                setReactions(prev => [...prev, {
                    id: rid,
                    emoji: data.reaction,
                    sender: data.sender || "Student",
                    x: Math.random() * 80 + 10,
                }]);
                setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 3000);
            } else if (data.type === "raise_hand") {
                const hid = Math.random().toString(36).substr(2, 9);
                setHandRaises(prev => [...prev, { id: hid, sender: data.sender, time: new Date().toLocaleTimeString() }]);
            } else if (data.type === "quiz_response") {
                // Feature 5: Student submitted their graded quiz answer
                setQuizResponses(prev => [
                    ...prev.filter(r => r.student_name !== data.student_name),
                    {
                        student_name: data.student_name,
                        score: data.score,
                        grade: data.grade,
                        feedback: data.feedback,
                        answer: data.answer,
                        time: new Date().toLocaleTimeString()
                    }
                ]);
                setShowQuizResponses(true);
            }
        };

        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
            // Stop screen sharing if WS errors out to prevent orphaned capture loop
            stopScreenSharing();
        };

        ws.onclose = () => {
            console.log("WebSocket closed for session:", id);
            setIsWsConnected(false);
            // Ensure capture loop is killed when connection drops
            stopScreenSharing();
        };

        return () => {
            console.log("Cleaning up WebSocket for session:", id);
            stopScreenSharing(); // Kill capture loop before WS closes
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };
    }, [id, sessionStatus]);

    // Cleanup AudioContext on unmount
    useEffect(() => {
        return () => {
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => {});
            }
        };
    }, []);

    // --- Context Sync Effect (Teacher -> Student) ---
    useEffect(() => {
        if (!isActive || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (!syncMode) return;

        let context = { type: "none" };
        if (isScreenSharing) {
            context = { type: "screen", active: true };
        } else if (currentMaterialIndex >= 0) {
            const material = teachingMaterials[currentMaterialIndex];
            context = {
                type: material.type,
                id: material.id,
                name: material.name,
                url: material.url,
                page: currentPage
            };
        }

        console.log("Broadcasting context update:", context);
        wsRef.current.send(JSON.stringify({
            type: "context_update",
            session_id: id,
            context: context
        }));
    }, [id, isActive, currentMaterialIndex, currentPage, isScreenSharing, syncMode, teachingMaterials, isWsConnected]);

    const forceSync = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        let ctx = { type: "none" };
        if (isScreenSharing) {
            ctx = { type: "screen", active: true };
        } else if (currentMaterialIndex >= 0) {
            const material = teachingMaterials[currentMaterialIndex];
            ctx = {
                type: material.type,
                id: material.id,
                name: material.name,
                url: material.url,
                page: currentPage
            };
        }
        wsRef.current.send(JSON.stringify({
            type: "context_update",
            session_id: id,
            context: ctx
        }));
    };

    // Effect 2: Manage Audio Capture lifecycle (dependent on sessionStatus + WS readiness)
    useEffect(() => {
        if (!isActive || isRecordingStarted.current || !wsRef.current || !isWsConnected || sessionStatus === "loading") return;

        const startCapture = async () => {
            const ws = wsRef.current;
            if (ws.readyState !== WebSocket.OPEN) {
                // Wait for open if connecting
                if (ws.readyState === WebSocket.CONNECTING) {
                    ws.addEventListener('open', startCapture, { once: true });
                }
                return;
            }

            console.log("Starting Audio Capture for active session:", id);
            try {
                // Register as producer
                ws.send(JSON.stringify({ type: "p_init", session_id: id }));

                // Browser-based transcription (Web Speech API) - Highly efficient, zero-latency
                if (window.SpeechRecognition || window.webkitSpeechRecognition) {
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    const recognition = new SpeechRecognition();
                    recognition.lang = 'en-IN'; // Improved accuracy for local context
                    recognition.interimResults = true;
                    recognition.continuous = true;

                    recognition.onresult = (event) => {
                        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                        lastTranscriptionActivityRef.current = Date.now(); // Feed the watchdog

                        // Iterate through all results to find newly finalized segments
                        for (let i = event.resultIndex; i < event.results.length; i++) {
                            const result = event.results[i];
                            const text = result[0].transcript.trim();

                            if (result.isFinal) {
                                // Only send if we haven't finalized this exact index yet AND it's not a repeat of the global last text
                                if (i > lastFinalizedIndexRef.current && text !== lastGlobalFinalizedTextRef.current) {
                                    wsRef.current.send(JSON.stringify({
                                        type: "browser_transcript",
                                        session_id: id,
                                        text: text,
                                        is_final: true
                                    }));
                                    lastFinalizedIndexRef.current = i;
                                    lastGlobalFinalizedTextRef.current = text;
                                }
                            } else {
                                // For the latest non-final segment, send as a partial update
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

                    recognition.onerror = (event) => {
                        console.error("Speech Recognition Error:", event.error);
                        // Network/Aborted errors require a hard restart
                        if (['network', 'aborted'].includes(event.error)) {
                            console.log("Recoverable error, forcing restart...");
                            try { recognition.stop(); } catch (e) {}
                        }
                        if (event.error === 'not-allowed') {
                            alert("Microphone permission denied for transcription.");
                        }
                    };

                    recognition.onend = () => {
                        // Reset segment tracking when the recognition session ends
                        lastFinalizedIndexRef.current = -1;
                        if (isRecordingStarted.current && !isMutedRef.current && isActive) {
                            console.log("Restarting Speech Recognition session...");
                            recognitionStartTimeRef.current = Date.now();
                            lastTranscriptionActivityRef.current = Date.now();
                            try { recognition.start(); } catch (e) {}
                        }
                    };

                    recognitionRef.current = recognition;
                    if (!isMutedRef.current) {
                        try { 
                            recognition.start();
                            recognitionStartTimeRef.current = Date.now();
                            lastTranscriptionActivityRef.current = Date.now();
                        } catch (e) { console.warn("Recognition start failed:", e); }
                    }

                    // Reliability Watchdog & Proactive Rotation
                    const checkInterval = setInterval(() => {
                        if (!isActive || !isRecordingStarted.current || isMutedRef.current) return;
                        
                        const now = Date.now();
                        const timeSinceLastResult = now - lastTranscriptionActivityRef.current;
                        const sessionDuration = now - recognitionStartTimeRef.current;

                        // 0. Audio Context Guard: Ensure browser hasn't suspended the mic processor
                        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                            audioCtxRef.current.resume().catch(() => {});
                        }

                        // 1. Proactive Rotation: Browser limits (60s) are bypassed by restarting anyway at 45s
                        if (sessionDuration > 45000) {
                            console.log("[Watchdog] Proactive session rotation (45s limit)...");
                            try { recognition.abort(); } catch (e) {} // Use ABORT for hard reset
                        }
                        // 2. Inactivity Watchdog: Wake up stalled browser engine
                        else if (timeSinceLastResult > 10000) {
                            console.log("[Watchdog] Transcription stall detected (10s), forcing hard wake-up...");
                            try { recognition.abort(); } catch (e) {} // Use ABORT for hard reset
                        }
                        // 3. Fallback: Always try to start if it's dead
                        else {
                            try { recognition.start(); } catch (e) {}
                        }
                    }, 5000);
                    
                    recognitionRef.current._checkInterval = checkInterval;
                    console.log("Teacher Speech Recognition initialized (Watchdog Enabled)");
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                streamRef.current = stream;
                // Sync initial mute state to track
                stream.getAudioTracks().forEach(track => {
                    track.enabled = !isMuted;
                });

                const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                audioContextRef.current = audioContext;

                const source = audioContext.createMediaStreamSource(stream);
                const processor = audioContext.createScriptProcessor(4096, 1, 1);
                audioProcessorRef.current = processor;

                processor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcmData = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                    }
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        if (!isMutedRef.current) {
                            wsRef.current.send(pcmData.buffer);
                        }
                    }
                };

                source.connect(processor);
                processor.connect(audioContext.destination);
                isRecordingStarted.current = true;
                console.log("Audio capture successfully started");
            } catch (err) {
                console.error("Microphone access error:", err);
            }
        };

        startCapture();

        return () => {
            console.log("Cleaning up Audio Capture for session:", id);
            if (recognitionRef.current) {
                if (recognitionRef.current._checkInterval) {
                    clearInterval(recognitionRef.current._checkInterval);
                }
                try { recognitionRef.current.stop(); } catch (e) {}
                recognitionRef.current = null;
            }
            if (audioProcessorRef.current) {
                try { audioProcessorRef.current.disconnect(); } catch (e) { }
                audioProcessorRef.current = null;
            }
            if (audioContextRef.current) {
                try { audioContextRef.current.close(); } catch (e) { }
                audioContextRef.current = null;
            }
            if (streamRef.current) { // This was streamRef, not screenStreamRef
                try { streamRef.current.getTracks().forEach(track => track.stop()); } catch (e) { }
                streamRef.current = null;
            }
            if (screenStreamRef.current) {
                try { screenStreamRef.current.getTracks().forEach(track => track.stop()); } catch (e) { }
                screenStreamRef.current = null;
            }
            if (screenIntervalRef.current) {
                clearInterval(screenIntervalRef.current);
                screenIntervalRef.current = null;
            }
            if (webcamStreamRef.current) {
                try { webcamStreamRef.current.getTracks().forEach(track => track.stop()); } catch (e) { }
                webcamStreamRef.current = null;
            }
            if (webcamIntervalRef.current) {
                clearInterval(webcamIntervalRef.current);
                webcamIntervalRef.current = null;
            }
            isRecordingStarted.current = false;
        };
    }, [id, isActive, isWsConnected]);

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
        if (lower.includes("?")) return "question";
        if (lower.includes("important") || lower.includes("remember") || lower.includes("exam")) return "important";
        if (lower.includes("defined as") || lower.includes("means") || lower.includes("definition")) return "concept";
        return "normal";
    }

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
            });
            // Auto-fetch YouTube resources for new concepts
            try {
                setIsFetchingYT(true);
                await fetchSessionResources(id);
                await loadResources();
            } catch (ytErr) {
                console.error("YouTube fetch error (non-critical):", ytErr);
            } finally {
                setIsFetchingYT(false);
            }
        } catch (err) {
            console.error("Failed to generate analysis:", err);
            setGenerateError("Failed to generate analysis. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    }

    // -----------------------------------------------------------------------
    // Recommended Resources helpers
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

    useEffect(() => {
        if (isFinished) loadResources();
    }, [isFinished, loadResources]);

    const handleAddResource = async () => {
        if (!addFormData.concept || !addFormData.title || !addFormData.url) {
            alert("Please fill in Concept, Title, and URL.");
            return;
        }
        setIsAddingResource(true);
        try {
            await addSessionResource(id, addFormData);
            setAddFormData({ concept: "", title: "", url: "", type: "youtube" });
            setShowAddForm(false);
            await loadResources();
        } catch (err) {
            console.error("Failed to add resource:", err);
        } finally {
            setIsAddingResource(false);
        }
    };

    const handleSaveEdit = async (resourceId) => {
        try {
            await updateSessionResource(id, resourceId, editFormData);
            setEditingResourceId(null);
            setEditFormData({});
            await loadResources();
        } catch (err) {
            console.error("Failed to update resource:", err);
        }
    };

    const handleDeleteResource = async (resourceId) => {
        if (!window.confirm("Delete this resource?")) return;
        try {
            await deleteSessionResource(id, resourceId);
            await loadResources();
        } catch (err) {
            console.error("Failed to delete resource:", err);
        } finally {
        }
    };

    const handleCreateRagAssessment = async () => {
        setIsGeneratingQuiz(true);
        try {
            await generateRagQuiz(id);
            alert("RAG Assessment generated successfully! View it in the Assessment Hub.");
        } catch (err) {
            console.error("Failed to generate RAG quiz:", err);
            alert("Could not generate assessment. Ensure the session is finalized and materials are indexed.");
        } finally {
            setIsGeneratingQuiz(false);
        }
    };

    // -----------------------------------------------------------------------
    // Render helpers
    // -----------------------------------------------------------------------

    return (
        <div className="flex flex-col h-full gap-6">

            {/* ---- Header ---- */}
            <header className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2.5 bg-white border border-soft-200 rounded-xl text-soft-500 hover:text-indigo-600 hover:border-indigo-200 soft-transition shadow-sm"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <Shield className="w-4 h-4 text-indigo-600" />
                            <span className="text-indigo-600 font-bold text-[10px] uppercase tracking-widest">Teacher Review Mode</span>
                        </div>
                        <h1 className="text-2xl font-bold text-soft-900 leading-tight">Session Review</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-soft-400 uppercase tracking-wider">ID: {id.substring(0, 8)}</span>
                            <span className="w-1 h-1 rounded-full bg-soft-300"></span>

                            {/* Status badge */}
                            {isActive && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-green-600">
                                    <Activity className="w-3.5 h-3.5" />
                                    LIVE — MONITORING ACTIVE
                                </div>
                            )}
                            {isFinished && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-soft-400">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    SESSION ARCHIVED
                                </div>
                            )}
                            {sessionStatus === "loading" && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-soft-400">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    LOADING...
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6 relative">
                    <div 
                        onClick={() => setShowParticipantList(!showParticipantList)}
                        className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 shadow-sm transition-all hover:bg-indigo-100 cursor-pointer"
                    >
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span className="text-xs font-bold text-indigo-700">{participantCount} Active Students</span>
                        <ChevronRight className={`w-3 h-3 text-indigo-400 transition-transform ${showParticipantList ? 'rotate-90' : ''}`} />
                    </div>



                    <button
                        onClick={() => setShowQuestionsBoard(!showQuestionsBoard)}
                        className={`p-2.5 rounded-2xl border shadow-sm soft-transition ${
                            showQuestionsBoard 
                                ? "bg-orange-500 border-orange-600 text-white" 
                                : "bg-white border-soft-100 text-soft-400 hover:text-soft-600"
                        }`}
                        title="Questions Board"
                    >
                        <HelpCircle className="w-5 h-5" />
                        {doubts.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                                {doubts.length}
                            </span>
                        )}
                    </button>

                    <AnimatePresence>
                        {showParticipantList && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-full right-0 mt-2 w-64 bg-white rounded-3xl shadow-soft-xl border border-soft-100 z-[100] overflow-hidden"
                            >
                                <div className="p-4 border-b border-soft-50 bg-soft-50/50">
                                    <h3 className="text-xs font-black text-soft-900 uppercase tracking-widest">Active Participants</h3>
                                </div>
                                <div className="max-h-64 overflow-y-auto p-2">
                                    {participants.filter(p => p.role === 'student').length > 0 ? 
                                        participants.filter(p => p.role === 'student').map((p, i) => (
                                            <div key={i} className="flex items-center gap-3 p-2 hover:bg-soft-50 rounded-xl soft-transition">
                                                <div className="w-8 h-8 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-600">
                                                    {p.name.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-soft-700">{p.name}</span>
                                                    <span className="text-[8px] font-black text-soft-400 uppercase tracking-widest">{p.role}</span>
                                                </div>
                                            </div>
                                        )) : (
                                        <div className="p-4 text-center text-xs text-soft-400 font-medium">
                                            No students joined yet.
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Questions Board Overlay */}
                    <AnimatePresence>
                        {showQuestionsBoard && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="absolute top-full right-0 mt-4 w-96 bg-white rounded-[2rem] shadow-2xl border border-orange-100 z-[100] overflow-hidden text-left"
                            >
                                <div className="p-6 border-b border-orange-50 bg-orange-50/50 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <HelpCircle className="w-5 h-5 text-orange-500" />
                                        <h3 className="font-bold text-orange-900">Questions Board</h3>
                                    </div>
                                    <button onClick={() => setShowQuestionsBoard(false)} className="text-orange-400 hover:text-orange-600">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                    {doubts.length > 0 ? doubts.map((d) => (
                                        <div key={d.id} className="p-4 bg-white border border-soft-100 rounded-2xl hover:border-orange-200 transition-colors shadow-sm text-left">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">{d.sender}</span>
                                                <span className="text-[10px] text-soft-400">{d.time}</span>
                                            </div>
                                            <p className="text-sm text-soft-700 leading-relaxed font-medium italic">"{d.text}"</p>
                                        </div>
                                    )) : (
                                        <div className="py-12 text-center">
                                            <div className="w-12 h-12 bg-soft-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <HelpCircle className="w-6 h-6 text-soft-200" />
                                            </div>
                                            <p className="text-xs text-soft-400 font-medium">No questions collected so far.</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex gap-3">
                    {sessionStatus !== 'finished' && (
                        <>
                        <button
                            onClick={toggleScreenSharing}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold soft-transition shadow-sm ${isScreenSharing ? 'bg-indigo-600 text-white' : 'bg-white border border-soft-200 text-soft-700 hover:bg-soft-50'}`}
                        >
                            <Monitor className="w-4 h-4" />
                            {isScreenSharing ? "Stop Sharing" : "Share Screen"}
                        </button>
                        <button
                            onClick={toggleWebcam}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold soft-transition shadow-sm ${isWebcamSharing ? 'bg-indigo-600 text-white' : 'bg-white border border-soft-200 text-soft-700 hover:bg-soft-50'}`}
                        >
                            <Camera className="w-4 h-4" />
                            {isWebcamSharing ? "Stop Webcam" : "Share Webcam"}
                        </button>
                        {isActive && (
                            <button
                                onClick={handleStopSession}
                                disabled={isStopping}
                                className="flex items-center gap-2 px-5 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-2xl font-bold hover:bg-red-600 hover:text-white soft-transition shadow-sm disabled:opacity-50"
                            >
                                {isStopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                                Stop Session
                            </button>
                        )}
                        {isActive && (
                            <button
                                id="pop-quiz-btn"
                                onClick={() => { setShowQuizModal(true); setQuizQuestion(""); }}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold soft-transition shadow-sm"
                                style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "white" }}
                                title="Launch a Pop Quiz for all students"
                            >
                                <Trophy className="w-4 h-4" />
                                Pop Quiz
                                {quizResponses.length > 0 && (
                                    <span className="w-5 h-5 bg-white text-amber-600 text-[10px] font-black rounded-full flex items-center justify-center ml-1">
                                        {quizResponses.length}
                                    </span>
                                )}
                            </button>
                        )}
                        </>
                    )}
                    <button
                        onClick={forceSync}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-soft-200 text-soft-700 rounded-2xl font-bold hover:bg-soft-50 soft-transition shadow-sm"
                        title="Force students to synchronize with your current view"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Force Sync
                    </button>

                    {isFinished && (
                        <button
                            onClick={handleCreateRagAssessment}
                            disabled={isGeneratingQuiz}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 shadow-md transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isGeneratingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Generate RAG Assessment
                        </button>
                    )}

                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(window.location.href);
                            alert("Teacher portal link copied to clipboard!");
                        }}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-soft-200 text-soft-700 rounded-2xl font-bold hover:bg-soft-50 soft-transition shadow-sm"
                    >
                        <Share2 className="w-4 h-4" />
                        Share Portal
                    </button>
                    
                    <button
                        onClick={async () => {
                            setIsExporting(true);
                            try {
                                await downloadSessionPDF(id, `session_${id}_insights.pdf`);
                            } catch (err) {
                                console.error("Export failed:", err);
                                alert("Failed to export insights. Please ensure the session is finished.");
                            } finally {
                                setIsExporting(false);
                            }
                        }}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 shadow-soft soft-transition disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Export Insights
                    </button>
                </div>
            </div>
        </header>

            {/* ---- Teaching Materials Header/Manager ---- */}
            <div className="bg-white rounded-3xl p-6 shadow-soft border border-soft-100 mb-2">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 overflow-x-auto pb-2 flex-1 scrollbar-hide">
                        <div className="flex-shrink-0">
                          <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-soft-500 hover:bg-soft-50 cursor-pointer soft-transition border border-soft-100 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> : <Plus className="w-4 h-4" />}
                            <span className="text-sm font-semibold">{isUploading ? "Uploading..." : "ADD SLIDES"}</span>
                            <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf" disabled={isUploading} />
                        </label>

                        </div>
                        {teachingMaterials.map((m, idx) => (
                            <div key={m.id} className="relative group flex-shrink-0">
                                <button
                                    onClick={() => { setCurrentMaterialIndex(idx); setCurrentPage(1); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider soft-transition border ${currentMaterialIndex === idx
                                        ? "bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm"
                                        : "bg-white border-soft-100 text-soft-400 hover:border-soft-300"
                                        }`}
                                >
                                    {m.name.length > 15 ? m.name.substring(0, 15) + "..." : m.name}
                                </button>
                                <button
                                    onClick={(e) => handleDeleteMaterial(e, m.id)}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 soft-transition shadow-sm hover:bg-red-600"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-4">
                        {isActive && (
                            <button
                                onClick={toggleMute}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold soft-transition border ${isMuted ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-600'}`}
                                title={isMuted ? "You are muted" : "Microphone is live"}
                            >
                                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                <span>{isMuted ? "MUTED" : "UNMUTED"}</span>
                            </button>
                        )}
                        <div className="w-px h-6 bg-soft-100"></div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-soft-400 uppercase tracking-widest mr-2">Sync:</span>
                            <button
                                onClick={() => setSyncMode(!syncMode)}
                                className={`p-2 rounded-lg soft-transition ${syncMode ? "bg-green-50 text-green-600" : "bg-soft-100 text-soft-400"}`}
                                title={syncMode ? "Live Syncing Active" : "Syncing Paused"}
                            >
                                <Activity className={`w-4 h-4 ${syncMode ? "animate-pulse" : ""}`} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {/* ---- Main Dashboard Split: Notes/Screen (Left) | Transcripts (Right) ---- */}
            <div className="flex flex-col gap-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px] lg:h-[calc(100vh-320px)]">
                    
                    {/* Synchronized Material/Screen Viewer (50%) */}
                    <div className="bg-white rounded-[2.5rem] shadow-soft border border-soft-100 overflow-hidden flex flex-col min-h-0">
                        <div className="px-8 py-4 border-b border-soft-100 flex justify-between items-center bg-soft-50/30">
                            <div className="flex items-center gap-2">
                                {isScreenSharing ? <Monitor className="w-4 h-4 text-indigo-600" /> : <BookOpen className="w-4 h-4 text-indigo-600" />}
                                <span className="font-bold text-soft-900 text-sm">
                                    {isScreenSharing ? "Live Screen Share" : currentMaterialIndex >= 0 ? teachingMaterials[currentMaterialIndex].name : "No Material Selected"}
                                </span>
                            </div>
                            {!isScreenSharing && currentMaterialIndex >= 0 && (
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 bg-white border border-soft-200 rounded-lg px-2 py-1">
                                        <button onClick={handlePrevPage} className="p-1 hover:bg-soft-50 rounded text-soft-500"><ChevronLeft className="w-4 h-4" /></button>
                                        <span className="text-[10px] font-black text-soft-600 w-12 text-center uppercase tracking-widest">Page {currentPage}</span>
                                        <button onClick={handleNextPage} className="p-1 hover:bg-soft-50 rounded text-soft-500"><ChevronRight className="w-4 h-4" /></button>
                                    </div>
                                    <button 
                                        onClick={() => setCurrentMaterialIndex(-1)}
                                        className="text-soft-400 hover:text-red-500 p-1"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 bg-soft-900 flex items-center justify-center p-4 relative overflow-hidden">
                          {isScreenSharing ? (
                                <div className="relative w-full h-full flex items-center justify-center">
                                    {/* Live preview of teacher's own screen */}
                                    <video
                                        ref={screenVideoRef}
                                        autoPlay
                                        muted
                                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                        style={{ background: '#000' }}
                                    />
                                    {/* Overlay badge */}
                                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600/90 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full backdrop-blur-sm shadow">
                                        <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                                        Live — Your Screen
                                    </div>
                                </div>
                            ) : currentMaterialIndex >= 0 ? (
                                teachingMaterials[currentMaterialIndex].type === "image" ? (
                                    <img 
                                        src={resolveUrl(teachingMaterials[currentMaterialIndex].url)} 
                                        className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                                        alt="Teaching material"
                                    />
                                ) : (
                                    <iframe 
                                    key={`pdf-${teachingMaterials[currentMaterialIndex].url}-${currentPage}`}
                                    src={`${resolveUrl(teachingMaterials[currentMaterialIndex].url)}#page=${currentPage}`}
                                    className="w-full h-full border-0"
                                    title="Teaching Material"
                                />
                                )
                            ) : (
                                <div className="text-white/20 flex flex-col items-center gap-4">
                                    <BookOpen className="w-16 h-16" />
                                    <p className="text-sm font-bold tracking-widest uppercase">Select or Upload Slides</p>
                                </div>
                            )}

                            {/* Live Reactions Overlay */}
                            <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
                                <AnimatePresence>
                                    {reactions.map((r) => (
                                        <motion.div
                                            key={r.id}
                                            initial={{ y: "100%", opacity: 0, scale: 0.5 }}
                                            animate={{ y: "-20%", opacity: 1, scale: 1.5 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 2.5, ease: "easeOut" }}
                                            className="absolute bottom-0 text-3xl"
                                            style={{ left: `${r.x}%` }}
                                        >
                                            {r.emoji}
                                            <div className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full backdrop-blur-sm whitespace-nowrap mt-1 text-center font-bold">
                                                {r.sender}
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>

                            {/* Hand Raise Notifications */}
                            <div className="absolute top-6 left-6 flex flex-col gap-2 z-30">
                                <AnimatePresence>
                                    {handRaises.map((h) => (
                                        <motion.div
                                            key={h.id}
                                            initial={{ x: -100, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            exit={{ x: -100, opacity: 0 }}
                                            className="bg-red-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-red-400"
                                        >
                                            <div className="p-1.5 bg-white/20 rounded-lg">
                                                <Hand className="w-4 h-4 animate-bounce" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Hand Raised</p>
                                                <p className="text-sm font-bold">{h.sender} needs help</p>
                                            </div>
                                            <button 
                                                onClick={() => setHandRaises(prev => prev.filter(item => item.id !== h.id))}
                                                className="ml-4 p-1 hover:bg-white/20 rounded-lg"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>


                    {/* Transcript Panel (50%) */}
                    <div className="flex flex-col bg-white rounded-[2.5rem] shadow-soft border border-soft-100 overflow-hidden relative min-h-0">
                        <div className="px-8 py-5 border-b border-soft-100 flex justify-between items-center bg-soft-50/50">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-indigo-600" />
                                <h2 className="text-base font-bold text-soft-900 tracking-tight">Real-time Transcript</h2>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex gap-1.5 p-1 bg-soft-100 rounded-xl">
                                    <button
                                        onClick={() => setAutoScroll(true)}
                                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg soft-transition ${autoScroll ? 'bg-white text-indigo-600 shadow-sm' : 'text-soft-400 hover:text-soft-600'}`}
                                    >Auto</button>
                                    <button
                                        onClick={() => setAutoScroll(false)}
                                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg soft-transition ${!autoScroll ? 'bg-white text-indigo-600 shadow-sm' : 'text-soft-400 hover:text-soft-600'}`}
                                    >Pause</button>
                                </div>
                            </div>
                        </div>

                        <div
                            ref={transcriptRef}
                            onScroll={handleScroll}
                            className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin scrollbar-thumb-soft-200 scrollbar-track-transparent"
                        >
                            {transcripts.length > 0 ? transcripts.map((t, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="group"
                                >
                                    <div className="flex gap-4 items-start">
                                        <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-full bg-soft-50 border border-soft-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                                            {id.substring(0, 1)}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-black text-soft-400 uppercase tracking-widest">00:{Math.floor(t.start || 0).toString().padStart(2, '0')}</span>
                                                {t.context && (
                                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-500 text-[8px] font-black uppercase tracking-widest rounded-md">
                                                        {t.context.type === 'screen' ? 'Screen Share' : `P${t.context.page}`}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-sm leading-relaxed ${classifyLine(t.text) === 'important' ? 'text-indigo-900 font-bold' : classifyLine(t.text) === 'concept' ? 'text-indigo-700 italic border-l-2 border-indigo-200 pl-3' : 'text-soft-700'}`}>
                                                {t.text}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )) : !partialText && (
                                <div className="h-full flex flex-col items-center justify-center text-center p-12">
                                    <div className="w-16 h-16 bg-soft-50 rounded-full flex items-center justify-center mb-4">
                                        <MessageSquare className="w-8 h-8 text-soft-300" />
                                    </div>
                                    <h3 className="text-sm font-bold text-soft-900 mb-1">Waiting for audio...</h3>
                                    <p className="text-xs text-soft-400 max-w-[200px]">Transcripts will appear here in real-time as you speak.</p>
                                </div>
                            )}
                            
                            {partialText && (
                                <div className="flex gap-4 items-start opacity-50 italic">
                                    <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-full bg-soft-50 animate-pulse"></div>
                                    <div className="flex-1"><p className="text-sm text-soft-500">{partialText}...</p></div>
                                </div>
                            )}
                        </div>

                        {!autoScroll && (
                            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
                                <button
                                    onClick={() => setAutoScroll(true)}
                                    className="bg-indigo-600 text-white px-4 py-2 rounded-full shadow-soft-xl border border-indigo-400 animate-bounce text-xs font-bold"
                                >
                                    Resume Auto-scroll
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ---- Analytics & Insights Section (Bottom) ---- */}
            <div className="mt-6 space-y-6 pb-12">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-indigo-100 rounded-xl">
                        <Zap className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-soft-900">Educational Insights</h2>
                        <p className="text-xs text-soft-500">Deep analysis of the teaching session and student engagement</p>
                    </div>
                </div>

                <div className="bg-white rounded-[2.5rem] shadow-soft border border-soft-100 overflow-hidden">

                    {/* Panel header — changes based on session state */}
                    <div className="px-8 py-5 border-b border-soft-100 bg-soft-50/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {isFinished ? (
                                    <>
                                        <Brain className="w-5 h-5 text-indigo-600" />
                                        <h2 className="font-bold uppercase tracking-wider text-sm text-indigo-600">
                                            Educational Analysis
                                        </h2>
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-5 h-5 text-green-500" />
                                        <h2 className="font-bold uppercase tracking-wider text-sm text-green-600">
                                            Teacher Monitoring
                                        </h2>
                                    </>
                                )}
                            </div>

                            {isFinished && analysis.sessionType && (
                                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-indigo-200">
                                    {analysis.sessionType}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-soft-400 mt-1 font-medium">
                            {isFinished
                                ? "Intelligent insights generated by Groq Llama-3"
                                : "Tracking classroom keywords and concepts in real-time."}
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-8">

                        {isActive && (
                            <>
                                {/* Concepts (live) */}
                                <section>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Lightbulb className="w-4 h-4 text-soft-400" />
                                        <h3 className="font-bold text-soft-900">Captured Concepts</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {analysis.concepts.length > 0 ? (
                                            analysis.concepts.map((c, i) => (
                                                <motion.span
                                                    key={i}
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: i * 0.05 }}
                                                    className="px-4 py-2 bg-green-50 text-green-700 text-xs font-bold rounded-xl border border-green-100 shadow-sm"
                                                >
                                                    {c}
                                                </motion.span>
                                            ))
                                        ) : (
                                            <div className="w-full border-2 border-dashed border-soft-100 rounded-2xl py-6 flex flex-col items-center justify-center gap-2">
                                                <Activity className="w-6 h-6 text-soft-200 animate-pulse" />
                                                <p className="text-xs text-soft-400 font-bold italic tracking-wide">
                                                    Monitoring topics...
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Summary & Questions placeholders */}
                                <section>
                                    <div className="flex items-center gap-2 mb-4">
                                        <FileText className="w-4 h-4 text-soft-400" />
                                        <h3 className="font-bold text-soft-900">Post-Session Summary</h3>
                                    </div>
                                    <div className="bg-soft-50 rounded-2xl p-5 border border-soft-100 border-dashed">
                                        <p className="text-sm text-soft-400 font-medium italic text-center py-4">
                                            A concise narrative summary will be available once the session ends.
                                        </p>
                                    </div>
                                </section>

                                <section>
                                    <div className="flex items-center gap-2 mb-4">
                                        <HelpCircle className="w-4 h-4 text-soft-400" />
                                        <h3 className="font-bold text-soft-900">Generated Quiz Items</h3>
                                    </div>
                                    <div className="border-2 border-dashed border-soft-100 rounded-2xl py-6 flex flex-col items-center justify-center gap-2">
                                        <BookOpen className="w-6 h-6 text-soft-200" />
                                        <p className="text-xs text-soft-400 font-bold italic text-center px-4">
                                            Study questions will be auto-generated later.
                                        </p>
                                    </div>
                                </section>
                            </>
                        )}

                        {isFinished && (
                            <>
                                {analysis.analysis_ready && (
                                    <>
                                        {/* Summary */}
                                        <section>
                                            <div className="flex items-center gap-2 mb-4">
                                                <FileText className="w-4 h-4 text-soft-400" />
                                                <h3 className="font-bold text-soft-900">Educational Summary</h3>
                                            </div>

                                            {analysis.audio_summary_url && (
                                                <div className="relative overflow-hidden rounded-3xl mb-6 group shadow-soft-xl" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81, #4338ca)' }}>
                                                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                                        <Volume2 className="w-32 h-32 text-white" />
                                                    </div>
                                                    <div className="relative p-8 flex flex-col md:flex-row items-center gap-8">
                                                        <div className="w-32 h-32 bg-white/10 backdrop-blur-xl rounded-[2rem] flex items-center justify-center border border-white/20 shadow-2xl relative group-hover:scale-105 transition-transform duration-500">
                                                            <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full animate-pulse"></div>
                                                            <Sparkles className="w-12 h-12 text-indigo-200 relative z-10" />
                                                        </div>
                                                        <div className="flex-1 text-center md:text-left space-y-3">
                                                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-full">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
                                                                <span className="text-[10px] font-black text-indigo-100 uppercase tracking-widest">AI Audio Summary Available</span>
                                                            </div>
                                                            <h4 className="text-2xl font-black text-white leading-tight tracking-tight">Listen to the Podcast Reflection</h4>
                                                            <p className="text-indigo-100/70 text-xs font-medium max-w-md">Our AI host has synthesized the key takeaways into a concise, professional audio reflection. Perfect for reviewing the core concepts from this session.</p>
                                                            <div className="pt-4 flex flex-col gap-4">
                                                                <audio 
                                                                    controls 
                                                                    src={analysis.audio_summary_url} 
                                                                    className="w-full h-10 rounded-xl opacity-90 hover:opacity-100 transition-opacity filter invert grayscale brightness-200"
                                                                />
                                                                <div className="flex items-center gap-6 text-[10px] font-black text-indigo-200 uppercase tracking-widest justify-center md:justify-start overflow-hidden">
                                                                    <div className="flex items-center gap-1.5 shrink-0"><CheckCircle className="w-3.5 h-3.5 text-indigo-400" /> High Fidelity</div>
                                                                    <div className="flex items-center gap-1.5 shrink-0"><Brain className="w-3.5 h-3.5 text-indigo-400" /> Neural Synthesis</div>
                                                                    <div className="flex items-center gap-1.5 shrink-0"><Clock className="w-3.5 h-3.5 text-indigo-400" /> Professional Tone</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="space-y-4">
                                                <div className="bg-indigo-50/30 rounded-2xl p-5 border border-indigo-100 relative group">
                                                    <div className="absolute -top-2 -left-2 text-indigo-500 opacity-20 group-hover:opacity-100 soft-transition">
                                                        <Sparkles className="w-6 h-6" />
                                                    </div>
                                                    <div className="text-left">
                                                        {renderMarkdown(analysis.summary)}
                                                    </div>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Taxonomy */}
                                        <section>
                                            <div className="flex items-center gap-2 mb-4">
                                                <Lightbulb className="w-4 h-4 text-soft-400" />
                                                <h3 className="font-bold text-soft-900">Strategic Concepts</h3>
                                            </div>

                                            <div className="space-y-4">
                                                {Object.entries(analysis.taxonomy).length > 0 ? (
                                                    Object.entries(analysis.taxonomy).map(([category, items], idx) => (
                                                        <div key={category} className="space-y-2">
                                                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest pl-1">
                                                                {category}
                                                            </h4>
                                                            <div className="flex flex-wrap gap-2">
                                                                {items.map((item, i) => (
                                                                    <motion.span
                                                                        key={i}
                                                                        initial={{ opacity: 0, scale: 0.9 }}
                                                                        animate={{ opacity: 1, scale: 1 }}
                                                                        transition={{ delay: (idx * 0.1) + (i * 0.03) }}
                                                                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100/50 shadow-sm"
                                                                    >
                                                                        {item}
                                                                    </motion.span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : analysis.concepts.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {analysis.concepts.map((c, i) => (
                                                            <motion.span
                                                                key={i}
                                                                initial={{ opacity: 0, scale: 0.9 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                transition={{ delay: i * 0.05 }}
                                                                className="px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-100 shadow-sm"
                                                            >
                                                                {c}
                                                            </motion.span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-soft-400 italic">No concepts extracted.</p>
                                                )}
                                            </div>
                                        </section>

                                        {/* Questions */}
                                        <section>
                                            <div className="flex items-center gap-2 mb-4">
                                                <HelpCircle className="w-4 h-4 text-soft-400" />
                                                <h3 className="font-bold text-soft-900">Intelligence Questions</h3>
                                            </div>
                                            <div className="space-y-3">
                                                {analysis.questions.length > 0 ? (
                                                    analysis.questions.map((q, i) => (
                                                        <motion.div
                                                            key={i}
                                                            initial={{ opacity: 0, x: 10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: i * 0.07 }}
                                                            className="flex gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100"
                                                        >
                                                            <span className="shrink-0 w-6 h-6 bg-white rounded-lg flex items-center justify-center text-amber-600 font-bold text-xs border border-amber-200">
                                                                Q
                                                            </span>
                                                            <span className="text-sm font-bold text-amber-900/80 leading-normal">{q}</span>
                                                        </motion.div>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-soft-400 font-bold italic text-center py-4 border-2 border-dashed border-soft-100 rounded-2xl">
                                                        No study questions generated.
                                                    </p>
                                                )}
                                            </div>
                                        </section>

                                        {/* ── Recommended Resources ── */}
                                        <section>
                                            <div className="flex items-center justify-between gap-3 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <PlayCircle className="w-4 h-4 text-violet-500" />
                                                    <h3 className="font-bold text-soft-900">Recommended Resources</h3>
                                                    {isFetchingYT && (
                                                        <span className="flex items-center gap-1 text-[9px] font-black text-violet-500 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                                            <Loader2 className="w-3 h-3 animate-spin" /> Fetching...
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => setShowAddForm(v => !v)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 soft-transition shadow-sm"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Add Resource
                                                </button>
                                            </div>

                                            {/* Add Resource Form */}
                                            {showAddForm && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="bg-violet-50 rounded-2xl p-5 border border-violet-100 mb-5 space-y-3"
                                                >
                                                    <h4 className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-2">New Resource</h4>
                                                    {/* Concept selector */}
                                                    <select
                                                        value={addFormData.concept}
                                                        onChange={e => setAddFormData(d => ({ ...d, concept: e.target.value }))}
                                                        className="w-full px-3 py-2 text-xs rounded-xl border border-violet-200 bg-white text-soft-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-300"
                                                    >
                                                        <option value="">Select Concept</option>
                                                        {analysis.concepts.map((c, i) => (
                                                            <option key={i} value={typeof c === 'string' ? c : String(c)}>
                                                                {typeof c === 'string' ? c : String(c)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        placeholder="Resource title"
                                                        value={addFormData.title}
                                                        onChange={e => setAddFormData(d => ({ ...d, title: e.target.value }))}
                                                        className="w-full px-3 py-2 text-xs rounded-xl border border-violet-200 bg-white text-soft-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-300"
                                                    />
                                                    <input
                                                        type="url"
                                                        placeholder="URL (e.g. https://youtube.com/watch?v=...)"
                                                        value={addFormData.url}
                                                        onChange={e => setAddFormData(d => ({ ...d, url: e.target.value }))}
                                                        className="w-full px-3 py-2 text-xs rounded-xl border border-violet-200 bg-white text-soft-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-300"
                                                    />
                                                    <select
                                                        value={addFormData.type}
                                                        onChange={e => setAddFormData(d => ({ ...d, type: e.target.value }))}
                                                        className="w-full px-3 py-2 text-xs rounded-xl border border-violet-200 bg-white text-soft-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-300"
                                                    >
                                                        <option value="youtube">YouTube</option>
                                                        <option value="pdf">PDF</option>
                                                        <option value="document">Document</option>
                                                        <option value="website">Website</option>
                                                    </select>
                                                    <div className="flex gap-2 pt-1">
                                                        <button
                                                            onClick={handleAddResource}
                                                            disabled={isAddingResource}
                                                            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 disabled:opacity-50 soft-transition"
                                                        >
                                                            {isAddingResource ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={() => setShowAddForm(false)}
                                                            className="px-4 py-2 bg-white text-soft-500 text-xs font-bold rounded-xl border border-soft-200 hover:bg-soft-50 soft-transition"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}

                                            {/* Resources list */}
                                            {resourcesLoading ? (
                                                <div className="flex items-center justify-center py-8 gap-3">
                                                    <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                                                    <span className="text-xs text-soft-400 font-medium">Loading resources...</span>
                                                </div>
                                            ) : Object.keys(resources).length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-8 gap-3 opacity-50 border-2 border-dashed border-soft-100 rounded-2xl">
                                                    <Youtube className="w-8 h-8 text-soft-300" />
                                                    <p className="text-xs text-soft-400 font-bold text-center">No resources yet — generate analysis to auto-fetch from YouTube</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-6">
                                                    {Object.entries(resources).map(([concept, items]) => (
                                                        <div key={concept}>
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <span className="w-2 h-2 rounded-full bg-violet-500" />
                                                                <h4 className="text-xs font-black text-soft-700 uppercase tracking-widest">{concept}</h4>
                                                            </div>
                                                            <div className="space-y-3">
                                                                {items.map((resource) => (
                                                                    <div key={resource.resource_id} className="rounded-2xl border border-soft-100 overflow-hidden">
                                                                        {editingResourceId === resource.resource_id ? (
                                                                            /* Inline edit mode */
                                                                            <div className="p-4 bg-violet-50 space-y-2">
                                                                                <input
                                                                                    type="text"
                                                                                    value={editFormData.title ?? resource.title}
                                                                                    onChange={e => setEditFormData(d => ({ ...d, title: e.target.value }))}
                                                                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-violet-200 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-violet-300"
                                                                                    placeholder="Title"
                                                                                />
                                                                                <input
                                                                                    type="url"
                                                                                    value={editFormData.url ?? resource.url}
                                                                                    onChange={e => setEditFormData(d => ({ ...d, url: e.target.value }))}
                                                                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-violet-200 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-violet-300"
                                                                                    placeholder="URL"
                                                                                />
                                                                                <div className="flex gap-2">
                                                                                    <button
                                                                                        onClick={() => handleSaveEdit(resource.resource_id)}
                                                                                        className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white text-[10px] font-black rounded-lg hover:bg-violet-700 soft-transition"
                                                                                    >
                                                                                        <Save className="w-3 h-3" /> Save
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => { setEditingResourceId(null); setEditFormData({}); }}
                                                                                        className="px-3 py-1.5 bg-white text-soft-400 text-[10px] font-black rounded-lg border border-soft-200 hover:bg-soft-50 soft-transition"
                                                                                    >
                                                                                        Cancel
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            /* Normal view */
                                                                            <div className="flex gap-3 p-3 hover:bg-soft-50/50 soft-transition group">
                                                                                <div className="flex-shrink-0 w-20 h-14 rounded-xl overflow-hidden bg-soft-100 relative">
                                                                                    {resource.thumbnail ? (
                                                                                        <img src={resource.thumbnail} alt={resource.title} className="w-full h-full object-cover" />
                                                                                    ) : (
                                                                                        <div className="w-full h-full flex items-center justify-center">
                                                                                            <Youtube className="w-5 h-5 text-soft-300" />
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-xs font-bold text-soft-800 leading-tight line-clamp-2 mb-1">{resource.title}</p>
                                                                                    {resource.channel && <p className="text-[10px] text-soft-400 font-medium mb-1.5">{resource.channel}</p>}
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                                                                                            resource.source === 'auto'
                                                                                                ? 'bg-blue-50 text-blue-500 border-blue-100'
                                                                                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                                                        }`}>
                                                                                            {resource.source === 'auto' ? 'Auto' : 'Teacher'}
                                                                                        </span>
                                                                                        <a
                                                                                            href={resource.url}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            className="flex items-center gap-1 text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest"
                                                                                        >
                                                                                            {resource.type === 'youtube' ? <PlayCircle className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                                                                                            {resource.type === 'youtube' ? 'Watch' : 'Open'}
                                                                                        </a>
                                                                                    </div>
                                                                                </div>
                                                                                {/* Edit / Delete actions */}
                                                                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 soft-transition">
                                                                                    <button
                                                                                        onClick={() => { setEditingResourceId(resource.resource_id); setEditFormData({ title: resource.title, url: resource.url }); }}
                                                                                        className="p-1.5 text-soft-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg soft-transition"
                                                                                        title="Edit"
                                                                                    >
                                                                                        <Edit2 className="w-3.5 h-3.5" />
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleDeleteResource(resource.resource_id)}
                                                                                        className="p-1.5 text-soft-400 hover:text-red-500 hover:bg-red-50 rounded-lg soft-transition"
                                                                                        title="Delete"
                                                                                    >
                                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </section>
                                    </>
                                )}

                                {!analysis.analysis_ready && (
                                    <div className="flex flex-col items-center justify-center flex-1 gap-6 py-8">
                                        <div className="w-16 h-16 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                            <Brain className="w-8 h-8 text-indigo-400" />
                                        </div>
                                        <div className="text-center">
                                            <h3 className="font-bold text-soft-800 mb-2">Analysis Awaiting Generation</h3>
                                            <p className="text-sm text-soft-500 font-medium leading-relaxed max-w-[220px] mx-auto">
                                                Generate a full summary and study questions from the complete session transcript.
                                            </p>
                                        </div>
                                        {generateError && (
                                            <p className="text-xs text-red-500 font-bold text-center px-4">{generateError}</p>
                                        )}
                                        <button
                                            onClick={handleGenerateAnalysis}
                                            disabled={isGenerating}
                                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 shadow-soft soft-transition disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {isGenerating ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Analyzing...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="w-4 h-4" />
                                                    Generate Portal Analysis
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {sessionStatus === "loading" && (
                            <div className="flex flex-col items-center justify-center flex-1 gap-4 py-16">
                                <Loader2 className="w-8 h-8 text-soft-300 animate-spin" />
                                <p className="text-xs text-soft-400 font-bold uppercase tracking-widest">
                                    Loading session...
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Panel footer */}
                    <div className="p-6 bg-soft-50/50 border-t border-soft-100 flex items-center justify-center gap-4">
                        {isActive ? (
                            <>
                                <Activity className="w-4 h-4 text-green-400" />
                                <span className="text-[10px] font-bold text-green-500 uppercase tracking-[0.2em]">Live Monitoring Enabled</span>
                            </>
                        ) : analysis.analyzed_at ? (
                            <>
                                <Clock className="w-4 h-4 text-soft-300" />
                                <span className="text-[10px] font-bold text-soft-400 uppercase tracking-[0.15em]">
                                    Processed {new Date(analysis.analyzed_at).toLocaleDateString()}
                                </span>
                            </>
                        ) : (
                            <>
                                <Clock className="w-4 h-4 text-soft-300" />
                                <span className="text-[10px] font-bold text-soft-400 uppercase tracking-[0.2em]">Ready for Analysis</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ---- Teacher's Own Live Webcam Preview Overlay ---- */}
            {isWebcamSharing && (
                <div className="fixed bottom-6 right-6 w-64 bg-white rounded-3xl shadow-soft-2xl border-4 border-indigo-100 overflow-hidden z-[100]">
                    <div className="absolute top-3 left-3 px-2 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-lg shadow-sm z-10 flex items-center gap-1.5 animate-pulse">
                        <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                        YOUR WEBCAM
                    </div>
                    <video 
                        ref={webcamVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-40 object-cover scale-x-[-1]"
                    />
                </div>
            )}

            {/* ════════════════════════════════════════════════════ */}
            {/* Feature 5: Pop Quiz Launch Modal                    */}
            {/* ════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showQuizModal && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowQuizModal(false)}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80]"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="fixed inset-0 flex items-center justify-center z-[81] p-6 pointer-events-none"
                        >
                            <div
                                className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl pointer-events-auto"
                                style={{ background: "linear-gradient(145deg, #0f0a1e, #1e1048)", border: "1px solid rgba(245,158,11,0.3)" }}
                            >
                                <div className="px-8 pt-8 pb-6">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
                                            <Trophy className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-white font-black text-lg">Launch Pop Quiz</p>
                                            <p className="text-amber-300 text-xs">Students will hear the question via TTS &amp; answer via PTT</p>
                                        </div>
                                        <button onClick={() => setShowQuizModal(false)} className="ml-auto p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-amber-300 text-xs font-bold uppercase mb-2 block">Quiz Question</label>
                                            <textarea
                                                id="quiz-question-input"
                                                value={quizQuestion}
                                                onChange={(e) => setQuizQuestion(e.target.value)}
                                                placeholder="e.g. List 3 key differences between SQL and MongoDB..."
                                                rows={4}
                                                className="w-full rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                                                style={{ background: "rgba(255,255,255,0.08)", color: "#f3f4f6", border: "1px solid rgba(245,158,11,0.3)" }}
                                            />
                                        </div>

                                        <div className="bg-white/5 rounded-2xl p-4 text-xs text-white/60 space-y-1.5">
                                            <p>✓ Question broadcasts to all students via WebSocket</p>
                                            <p>✓ Browser TTS reads the question aloud to each student</p>
                                            <p>✓ Students answer via Push-to-Talk; AI grades their response</p>
                                            <p>✓ Results stream back here in real-time</p>
                                        </div>

                                        <div className="flex gap-3 pt-1">
                                            <button
                                                onClick={() => setShowQuizModal(false)}
                                                className="flex-1 py-3 rounded-xl text-white/60 font-bold text-sm"
                                                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                id="launch-quiz-btn"
                                                onClick={() => {
                                                    if (!quizQuestion.trim()) return;
                                                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                                                        wsRef.current.send(JSON.stringify({
                                                            type: "pop_quiz",
                                                            session_id: id,
                                                            question: quizQuestion.trim(),
                                                            duration: 120,
                                                            sender: user?.full_name || "Teacher"
                                                        }));
                                                    }
                                                    setActiveQuizQuestion(quizQuestion.trim());
                                                    setQuizResponses([]);
                                                    setShowQuizModal(false);
                                                    setShowQuizResponses(true);
                                                }}
                                                disabled={!quizQuestion.trim()}
                                                className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                                                style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
                                            >
                                                <Trophy className="w-4 h-4" />
                                                Launch Quiz
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ════════════════════════════════════════════════════ */}
            {/* Feature 5: Quiz Responses Drawer (slide from right) */}
            {/* ════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showQuizResponses && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowQuizResponses(false)}
                            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[70]"
                        />
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="fixed top-0 right-0 h-full w-[380px] z-[71] flex flex-col"
                            style={{ background: "linear-gradient(180deg, #0f0a1e 0%, #1a0f3a 100%)", borderLeft: "1px solid rgba(245,158,11,0.2)" }}
                        >
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid rgba(245,158,11,0.15)" }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
                                        <Trophy className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-white font-bold text-sm">Quiz Responses</p>
                                        <p className="text-amber-300 text-[10px]">{quizResponses.length} student{quizResponses.length !== 1 ? "s" : ""} answered</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowQuizResponses(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Active Question */}
                            {activeQuizQuestion && (
                                <div className="mx-5 mt-4 p-4 rounded-2xl" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
                                    <p className="text-amber-300 text-[10px] font-bold uppercase mb-1.5">Active Question</p>
                                    <p className="text-white text-sm leading-relaxed">{activeQuizQuestion}</p>
                                </div>
                            )}

                            {/* Responses List */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
                                {quizResponses.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-center">
                                        <Loader2 className="w-9 h-9 text-amber-400 animate-spin mb-3 opacity-60" />
                                        <p className="text-white text-sm font-bold opacity-70">Waiting for answers...</p>
                                        <p className="text-white/40 text-xs mt-1">Students are responding via Push-to-Talk</p>
                                    </div>
                                ) : quizResponses.map((resp, idx) => (
                                    <div key={idx} className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                                                    style={{ background: resp.grade === "A" ? "#34d399" : resp.grade === "B" ? "#60a5fa" : resp.grade === "C" ? "#fbbf24" : "#f87171" }}
                                                >
                                                    {resp.grade}
                                                </div>
                                                <p className="text-white text-xs font-bold">{resp.student_name}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-black text-sm">{resp.score}</span>
                                                <span className="text-white/40 text-xs">/10</span>
                                                <span className="text-white/30 text-[10px] ml-1">{resp.time}</span>
                                            </div>
                                        </div>
                                        <div className="px-4 py-3 space-y-1.5">
                                            {resp.answer && (
                                                <p className="text-white/50 text-xs italic">"{resp.answer.substring(0, 100)}{resp.answer.length > 100 ? "..." : ""}"</p>
                                            )}
                                            <p className="text-white/70 text-xs leading-relaxed">{resp.feedback}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Class Average Footer */}
                            {quizResponses.length > 0 && (
                                <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(245,158,11,0.15)" }}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-amber-300 text-[10px] font-bold uppercase">Class Average</p>
                                            <p className="text-white font-black text-2xl">
                                                {(quizResponses.reduce((s, r) => s + (r.score || 0), 0) / quizResponses.length).toFixed(1)}
                                                <span className="text-white/40 text-sm font-normal">/10</span>
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-1.5 items-end">
                                            <button
                                                onClick={() => { setShowQuizModal(true); setQuizQuestion(""); }}
                                                className="px-4 py-2 rounded-xl text-white text-xs font-bold"
                                                style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
                                            >
                                                New Quiz
                                            </button>
                                            <button
                                                onClick={() => { setActiveQuizQuestion(""); setQuizResponses([]); setShowQuizResponses(false); }}
                                                className="px-4 py-1.5 rounded-xl text-amber-300 text-xs font-bold hover:bg-white/10 transition-colors"
                                            >
                                                Clear Results
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
