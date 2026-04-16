import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSessions } from "../services/api";
import { motion } from "framer-motion";
import { Clock, Calendar, ChevronRight, Activity, Search } from "lucide-react";
import { formatLocalDate, formatLocalTime } from "../utils/dateUtils";
import { useSearch } from "../contexts/SearchContext";
import { useSubjects } from "../contexts/SubjectsContext";

export default function RecentSessionsPage() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { searchQuery } = useSearch();
    const { subjectMap } = useSubjects();

    const filteredSessions = sessions.filter(s => {
        const query = searchQuery.toLowerCase();
        return (s.session_id?.toLowerCase().includes(query) ||
            s.subject_name?.toLowerCase().includes(query));
    });

    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);
    const LIMIT = 10;

    useEffect(() => {
        async function loadInitial() {
            setLoading(true);
            try {
                // Fetch initial batch of sessions
                const data = await getSessions(LIMIT, 0);

                const enriched = data.map(session => ({
                    ...session,
                    subject_name: subjectMap[session.subject_id] || session.subject || "General"
                }));

                setSessions(enriched);
                if (data.length < LIMIT) setHasMore(false);
            } catch (err) {
                console.error("Failed to load sessions:", err);
            } finally {
                setLoading(false);
            }
        }
        loadInitial();
    }, [subjectMap]);

    const loadMore = async () => {
        const nextOffset = (page + 1) * LIMIT;
        try {
            const data = await getSessions(LIMIT, nextOffset);
            if (data.length < LIMIT) setHasMore(false);

            const enriched = data.map(session => ({
                ...session,
                subject_name: subjectMap[session.subject_id] || session.subject || "General"
            }));

            setSessions(prev => [...prev, ...enriched]);
            setPage(page + 1);
        } catch (err) {
            console.error("Failed to load more sessions:", err);
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-10">
            <header className="mb-10">
                <h1 className="text-3xl font-bold text-soft-900 mb-2">Recent Sessions</h1>
                <p className="text-soft-500 font-medium italic">Overview of all your recorded classroom sessions</p>
            </header>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-40">
                    <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin"></div>
                    <p className="mt-6 text-soft-500 font-bold uppercase tracking-widest text-xs">Synchronizing Workspace...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredSessions.map((s, i) => {
                        const normalizedAt = (s.started_at && !s.started_at.endsWith('Z') && !s.started_at.includes('+')) 
                            ? `${s.started_at}Z` 
                            : s.started_at;
                        const startDate = normalizedAt ? new Date(normalizedAt) : new Date();
                        const month = startDate.toLocaleDateString([], { month: 'short' }).toUpperCase();
                        const day = startDate.getDate();
                        const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        
                        let duration = "Ongoing";
                        if (s.ended_at) {
                            const diff = new Date(s.ended_at) - startDate;
                            duration = Math.round(diff / 60000) + "m";
                        } else if (s.status === "active") {
                            duration = "Live";
                        }

                        return (
                            <motion.div
                                key={s.session_id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                onClick={() => navigate(`/session/${s.session_id}`)}
                                className="bg-white p-6 rounded-[2rem] border border-soft-100 shadow-soft hover:border-primary-200 hover:shadow-soft-xl cursor-pointer group soft-transition relative overflow-hidden"
                            >
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 rounded-2xl bg-soft-50 flex flex-col items-center justify-center border border-soft-100 group-hover:bg-primary-50 group-hover:border-primary-100 soft-transition">
                                        <span className="text-[10px] font-bold text-soft-400 uppercase tracking-tighter">{month}</span>
                                        <span className="text-2xl font-black text-soft-900 group-hover:text-primary-600 leading-none">{day}</span>
                                    </div>

                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${s.status === 'active' ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                                            <span className="text-[10px] font-bold text-soft-400 uppercase tracking-[0.2em]">{s.subject_name}</span>
                                        </div>
                                        <h3 className="text-xl font-bold text-soft-900 group-hover:text-primary-500 soft-transition">
                                            {s.session_id.includes('-') ? `Session for ${s.subject_name}` : `Session ${s.session_id.substring(0, 8)}`}
                                        </h3>
                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="flex items-center gap-1.5 text-xs text-soft-500 font-medium">
                                                <Clock className="w-3.5 h-3.5" />
                                                {duration}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-soft-500 font-medium">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {startTime}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-soft-500 font-medium">
                                                <Activity className="w-3.5 h-3.5" />
                                                {s.status === "active" ? "Analyzing..." : "Analyzed"}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-full bg-soft-50 text-soft-300 group-hover:bg-primary-500 group-hover:text-white soft-transition">
                                        <ChevronRight className="w-6 h-6" />
                                    </div>
                                </div>
                                <div className="absolute top-0 right-10 w-24 h-full bg-primary-500/5 skew-x-[-30deg] translate-x-20 group-hover:translate-x-0 transition-transform duration-700 pointer-events-none"></div>
                            </motion.div>
                        );
                    })}

                    {sessions.length === 0 && (
                        <div className="py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-soft-200">
                            <Clock className="w-12 h-12 text-soft-200 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-soft-900">No session history yet</h3>
                            <p className="text-soft-500 mt-2">Recordings from all subjects will appear here.</p>
                        </div>
                    )}
                </div>
            )}

            {!loading && hasMore && sessions.length > 0 && (
                <div className="mt-12 flex justify-center">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={loadMore}
                        className="bg-white border-2 border-primary-100 text-primary-600 px-8 py-4 rounded-2xl font-bold shadow-soft hover:bg-primary-50 hover:border-primary-200 soft-transition flex items-center gap-2"
                    >
                        Load More Sessions
                        <ChevronRight className="w-5 h-5" />
                    </motion.button>
                </div>
            )}
        </div>
    );
}
