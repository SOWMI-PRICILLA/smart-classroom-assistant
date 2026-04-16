import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getActiveSessions } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { formatLocalTime } from "../utils/dateUtils";

export default function ActiveSessionAlert() {
    const { user } = useAuth();
    const [activeSessions, setActiveSessions] = useState([]);
    const [isVisible, setIsVisible] = useState(true);
    const navigate = useNavigate();

    // Teachers don't need to see the join alert for their own/others classes here
    const isStudent = user?.role === "student";

    useEffect(() => {
        if (!isStudent) return;

        const fetchSessions = async () => {
            try {
                const sessions = await getActiveSessions();
                setActiveSessions(Array.isArray(sessions) ? sessions : []);
            } catch (err) {
                console.error("Failed to fetch active sessions:", err);
                setActiveSessions([]);
            }
        };

        fetchSessions();
        const interval = setInterval(fetchSessions, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [isStudent]);

    if (!isStudent || !isVisible || !activeSessions || activeSessions.length === 0) return null;

    const latestSession = activeSessions[0];
    if (!latestSession) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-indigo-600 text-white overflow-hidden relative"
            >
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg">
                            <Zap className="w-4 h-4 text-white animate-pulse" />
                        </div>
                        <div>
                            <p className="text-sm font-bold">
                                Live Session: <span className="opacity-90">{latestSession.subject_name || "Ongoing Class"}</span>
                            </p>
                            {latestSession.started_at ? (
                                <p className="text-[10px] opacity-70 uppercase tracking-wider font-bold">
                                    Started at {formatLocalTime(latestSession.started_at)}
                                </p>
                            ) : (
                                <p className="text-[10px] opacity-70 uppercase tracking-wider font-bold">
                                    Live Now
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(`/session/${latestSession.session_id}`)}
                            className="bg-white text-indigo-600 px-4 py-1.5 rounded-full text-xs font-bold hover:bg-indigo-50 soft-transition flex items-center gap-2"
                        >
                            Join Class
                            <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                            onClick={() => setIsVisible(false)}
                            className="p-1 hover:bg-white/10 rounded-full soft-transition"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 h-[2px] bg-white/30 w-full overflow-hidden">
                    <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="h-full w-1/3 bg-gradient-to-r from-transparent via-white to-transparent"
                    />
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
