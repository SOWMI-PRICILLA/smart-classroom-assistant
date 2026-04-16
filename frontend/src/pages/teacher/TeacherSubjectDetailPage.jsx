import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getSessionsBySubject, startSession } from "../../services/api";
import { motion } from "framer-motion";
import {
    ChevronLeft,
    Calendar,
    PlayCircle,
    CheckCircle2,
    Clock,
    MoreHorizontal,
    ArrowRight,
    Shield,
    Plus,
    Loader2,
    BookOpen
} from "lucide-react";

import { useSubjects } from "../../contexts/SubjectsContext";
import SubjectTabs from "../../components/subject/SubjectTabs";
import AnnouncementBanner from "../../components/subject/AnnouncementBanner";
import MaterialsTab from "../../components/subject/MaterialsTab";
import AssignmentsTab from "../../components/subject/AssignmentsTab";
import { formatLocalDate, formatLocalTime } from "../../utils/dateUtils";

export default function TeacherSubjectDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get("tab") || "Sessions";
    const [activeTab, setActiveTab] = useState(initialTab);
    const [isStarting, setIsStarting] = useState(false);
    const [sessions, setSessions] = useState([]);
    const { getSubjectName } = useSubjects();
    const subjectName = getSubjectName(id) || id;

    const loadSessions = async () => {
        const data = await getSessionsBySubject(id, 20, 0);
        setSessions(data || []);
    };

    useEffect(() => {
        loadSessions();
    }, [id]);

    const handleStartSession = async () => {
        setIsStarting(true);
        try {
            const data = await startSession(id);
            if (data.session_id) {
                navigate(`/teacher/session/${data.session_id}`);
            }
        } catch (err) {
            console.error("Failed to start session:", err);
            alert("Failed to start session. Please try again.");
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <button
                onClick={() => navigate("/teacher/subjects")}
                className="flex items-center gap-2 text-soft-500 hover:text-indigo-600 font-bold mb-8 soft-transition group"
            >
                <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 soft-transition" />
                Back to Subjects
            </button>

            <header className="mb-10 flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-5 h-5 text-indigo-600" />
                        <span className="text-indigo-600 font-bold text-sm uppercase tracking-wider">Teacher Subject Detail</span>
                    </div>
                    <h1 className="text-3xl font-bold text-soft-900 mb-2">{subjectName}</h1>
                    <p className="text-soft-500 font-medium">Recorded sessions for Subject: <span className="text-indigo-600">#{id}</span></p>
                </div>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStartSession}
                    disabled={isStarting}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3.5 rounded-2xl font-bold shadow-soft hover:bg-indigo-700 soft-transition disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isStarting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
                    Start New Class Session
                </motion.button>
            </header>

            <SubjectTabs activeTab={activeTab} setActiveTab={setActiveTab} />
            <AnnouncementBanner subjectId={id} isTeacher={true} />

            {activeTab === "Sessions" && (
                <motion.div
                    key="sessions"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-[2rem] shadow-soft border border-soft-100 overflow-hidden"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-soft-100 italic">
                                    <th className="px-8 py-5 text-soft-400 font-bold text-xs uppercase tracking-widest">Session Identity</th>
                                    <th className="px-8 py-5 text-soft-400 font-bold text-xs uppercase tracking-widest">Date & Time</th>
                                    <th className="px-8 py-5 text-soft-400 font-bold text-xs uppercase tracking-widest">Status</th>
                                    <th className="px-8 py-5 text-soft-400 font-bold text-xs uppercase tracking-widest text-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-soft-50">
                                {sessions.map((s) => (
                                    <tr key={s.session_id} className="group hover:bg-soft-50/50 soft-transition">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-soft-100 flex items-center justify-center text-soft-600 group-hover:bg-indigo-100 group-hover:text-indigo-600 soft-transition">
                                                    <Calendar className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-soft-900 leading-none mb-1">Session {s.session_id.substring(0, 8)}</p>
                                                    <p className="text-xs text-soft-400 font-medium tracking-wide">ID: {s.session_id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="text-sm font-bold text-soft-600 italic">
                                                {formatLocalDate(s.started_at)}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <Clock className="w-3.5 h-3.5 text-soft-400" />
                                                <span className="text-xs text-soft-400 font-medium">
                                                    {formatLocalTime(s.started_at)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl w-fit ${s.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-soft-50 text-soft-500'}`}>
                                                {s.status === 'active' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                                <span className="text-xs font-bold uppercase tracking-wider">{s.status || "Completed"}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button
                                                onClick={() => navigate(`/teacher/session/${s.session_id}`)}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-soft-200 text-soft-700 rounded-xl font-bold hover:bg-indigo-600 hover:text-white hover:border-indigo-600 soft-transition shadow-sm group/btn"
                                            >
                                                Manage Session
                                                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 soft-transition" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {sessions.length === 0 && (
                        <div className="py-20 text-center">
                            <div className="bg-soft-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Clock className="w-10 h-10 text-soft-300" />
                            </div>
                            <h3 className="text-xl font-bold text-soft-900">No sessions available</h3>
                            <p className="text-soft-500 mt-2">Start your first recording to see it here.</p>
                        </div>
                    )}
                </motion.div>
            )}

            {activeTab === "Materials" && (
                <motion.div key="materials" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <MaterialsTab subjectId={id} isTeacher={true} />
                </motion.div>
            )}

            {activeTab === "Assignments" && (
                <motion.div key="assignments" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <AssignmentsTab subjectId={id} isTeacher={true} />
                </motion.div>
            )}
        </div>
    );
}
