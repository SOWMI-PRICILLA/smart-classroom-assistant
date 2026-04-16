import { Search, Bell, User, ChevronDown, CheckCircle2, AlertCircle, Clock, Calendar, Activity, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSearch } from "../contexts/SearchContext";

const notifications_placeholder = []; // Removed hardcoded data

export default function Topbar() {
    const [notifications, setNotifications] = useState([]);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const { user } = useAuth();
    const { searchQuery, setSearchQuery } = useSearch();
    const navigate = useNavigate();

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        async function fetchNotifications() {
            try {
                const { getNotifications } = await import("../services/api");
                const data = await getNotifications();
                
                const mapped = data.map(n => {
                    let icon = Bell;
                    let color = "text-primary-500";
                    let route = "/";
                    
                    if (n.type === "session") {
                        const isLive = n.status === "active";
                        icon = isLive ? Activity : CheckCircle2;
                        color = isLive ? "text-red-500" : "text-green-500";
                        route = user?.role === "teacher" ? `/teacher/session/${n.id}` : `/session/${n.id}`;
                    } else if (n.type === "announcement") {
                        icon = AlertCircle;
                        color = "text-orange-500";
                        route = user?.role === "teacher" ? `/teacher/subject/${n.subject_id}?tab=Sessions` : `/subject/${n.subject_id}?tab=Sessions`;
                    } else if (n.type === "material") {
                        icon = BookOpen;
                        color = "text-blue-500";
                        route = user?.role === "teacher" ? `/teacher/subject/${n.subject_id}?tab=Materials` : `/subject/${n.subject_id}?tab=Materials`;
                    } else if (n.type === "assignment") {
                        icon = Clock;
                        color = "text-purple-500";
                        route = user?.role === "teacher" ? `/teacher/subject/${n.subject_id}?tab=Assignments` : `/subject/${n.subject_id}?tab=Assignments`;
                    }
                    
                    return {
                        ...n,
                        title: n.title,
                        time: n.timestamp ? (() => {
                            const diff = new Date() - new Date(n.timestamp);
                            const mins = Math.floor(diff / 60000);
                            if (mins < 1) return "Just now";
                            if (mins < 60) return `${mins}m ago`;
                            const hours = Math.floor(mins / 60);
                            if (hours < 24) return `${hours}h ago`;
                            return `${Math.floor(hours / 24)}d ago`;
                        })() : "Recently",
                        icon,
                        color,
                        route
                    };
                });
                setNotifications(mapped);
            } catch (err) {
                console.error("Failed to fetch notifications:", err);
            }
        }

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [user]);

    const timeString = currentTime.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
    
    const dateString = currentTime.toLocaleDateString([], { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });

    return (
        <header className="h-20 px-6 md:px-10 flex justify-between items-center z-30">
            <div className="relative group w-96">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-soft-400 group-focus-within:text-primary-500 soft-transition" />
                <input
                    placeholder="Search sessions, topics, or notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-soft-200 rounded-2xl pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 soft-transition shadow-sm"
                />
            </div>

            <div className="hidden lg:flex items-center gap-6 px-6 py-2 bg-soft-50/50 rounded-2xl border border-soft-100/50 shadow-inner-soft">
                <div className="flex items-center gap-2 group">
                    <div className="p-1.5 bg-white rounded-lg shadow-sm group-hover:bg-primary-500 group-hover:text-white soft-transition">
                        <Clock className="w-3.5 h-3.5 text-primary-500 group-hover:text-white" />
                    </div>
                    <span className="text-sm font-black text-soft-800 tabular-nums tracking-tight">
                        {timeString}
                    </span>
                </div>
                <div className="h-4 w-px bg-soft-200"></div>
                <div className="flex items-center gap-2 group">
                    <div className="p-1.5 bg-white rounded-lg shadow-sm group-hover:bg-primary-500 group-hover:text-white soft-transition">
                        <Calendar className="w-3.5 h-3.5 text-primary-500 group-hover:text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-soft-500 uppercase tracking-[0.1em]">
                        {dateString}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsNotifOpen(!isNotifOpen)}
                        className={`p-2.5 rounded-xl border soft-transition relative ${isNotifOpen ? "bg-primary-50 border-primary-100 text-primary-500" : "text-soft-500 hover:text-primary-500 hover:bg-white border-transparent hover:border-soft-200"}`}
                    >
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-soft-50"></span>
                    </motion.button>

                    <AnimatePresence>
                        {isNotifOpen && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 z-10"
                                    onClick={() => setIsNotifOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="absolute right-0 mt-3 w-80 bg-white rounded-[2rem] shadow-soft-xl border border-soft-100 py-6 px-2 z-20"
                                >
                                    <div className="px-6 mb-4 flex justify-between items-center">
                                        <h3 className="font-bold text-soft-900">Notifications</h3>
                                        <span className="text-[10px] font-bold text-primary-500 uppercase tracking-widest bg-primary-50 px-2 py-1 rounded-lg">
                                            {notifications.length} New
                                        </span>
                                    </div>
                                    <div className="space-y-1 max-h-96 overflow-y-auto custom-scrollbar">
                                        {notifications.length > 0 ? (
                                            notifications.map((n, i) => (
                                                <div 
                                                    key={i} 
                                                    onClick={() => {
                                                        navigate(n.route);
                                                        setIsNotifOpen(false);
                                                    }}
                                                    className="px-4 py-3 hover:bg-soft-50 rounded-2xl cursor-pointer soft-transition group mx-2"
                                                >
                                                    <div className="flex gap-3">
                                                        <div className={`mt-1 ${n.color}`}>
                                                            <n.icon className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-soft-800 group-hover:text-primary-600 soft-transition">{n.title}</p>
                                                            <p className="text-xs text-soft-400 font-medium mt-0.5">{n.time}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="px-6 py-10 text-center">
                                                <div className="w-12 h-12 bg-soft-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                    <Bell className="w-6 h-6 text-soft-300" />
                                                </div>
                                                <p className="text-xs font-bold text-soft-400 uppercase tracking-widest">No new notifications</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-4 px-2">
                                        <button 
                                            onClick={() => navigate("/recent-sessions")}
                                            className="w-full py-3 text-xs font-bold text-soft-500 hover:text-primary-500 hover:bg-primary-50 rounded-xl soft-transition"
                                        >
                                            View all activity
                                        </button>
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>

                <div className="h-8 w-px bg-soft-200 mx-2"></div>

                <Link to="/profile">
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-2xl border border-transparent hover:border-soft-200 hover:bg-white cursor-pointer soft-transition"
                    >
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold text-soft-900 leading-none">{user?.full_name || "Guest"}</p>
                            <p className="text-[10px] font-medium text-soft-400 uppercase tracking-wider mt-1">{user?.role || "Instructor"}</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white shadow-soft">
                            <User className="w-6 h-6" />
                        </div>
                        <ChevronDown className="w-4 h-4 text-soft-400 mr-1" />
                    </motion.div>
                </Link>
            </div>
        </header>
    );
}
