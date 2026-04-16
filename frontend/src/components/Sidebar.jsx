import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { getGlobalQuizzes, getGlobalSubmissions } from "../services/api";
import {
    LayoutDashboard, BookOpen, History, User, LogOut,
    GraduationCap, Settings, Trophy, Calendar, ChevronRight
} from "lucide-react";

const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Subjects", path: "/subjects", icon: BookOpen },
    { name: "Timetable", path: "/timetable", icon: Calendar },
    { name: "Assessments", path: "/assessments", icon: Trophy },
    { name: "Recent Sessions", path: "/sessions", icon: History },
    { name: "Settings", path: "/settings", icon: Settings },
    { name: "Profile", path: "/profile", icon: User },
];

export default function Sidebar() {
    const location = useLocation();
    const { logout, user } = useAuth();
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (user) {
            const checkAssessments = async () => {
                try {
                    const [quizzes, submissions] = await Promise.all([
                        getGlobalQuizzes(),
                        getGlobalSubmissions()
                    ]);
                    // Fixed: use quiz_id not session_id for the submission check
                    const unsubmitted = (quizzes || []).filter(q => !(submissions || []).some(s => s.quiz_id === q.quiz_id));
                    setPendingCount(unsubmitted.length);
                } catch (err) {
                    console.error("Failed to check notifications:", err);
                }
            };
            checkAssessments();
            const interval = setInterval(checkAssessments, 60000);
            return () => clearInterval(interval);
        }
    }, [user]);

    const initials = (user?.full_name || "U").split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

    return (
        <aside className="w-72 glass-morphism border-r border-soft-200 h-screen flex flex-col p-5 z-20">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8 px-2">
                <div className="bg-primary-500 p-2.5 rounded-2xl shadow-soft shrink-0">
                    <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-base font-black leading-tight text-soft-900">Smart Assistant</h1>
                    <p className="text-[10px] text-soft-500 font-bold tracking-wider uppercase">Classroom · Student</p>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 space-y-1">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path ||
                        (item.path !== "/" && location.pathname.startsWith(item.path));
                    const Icon = item.icon;
                    const badge = item.name === "Assessments" && pendingCount > 0 ? pendingCount : null;

                    return (
                        <Link key={item.path} to={item.path}>
                            <motion.div
                                whileHover={{ x: 3 }}
                                whileTap={{ scale: 0.97 }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer soft-transition relative ${
                                    isActive
                                        ? "bg-primary-500 text-white shadow-soft"
                                        : "text-soft-600 hover:bg-soft-100 hover:text-soft-900"
                                }`}
                            >
                                <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? "text-white" : "text-soft-400"}`} />
                                <span className={`font-semibold text-sm ${isActive ? "font-bold" : ""}`}>{item.name}</span>
                                <AnimatePresence>
                                    {badge && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0 }}
                                            className={`ml-auto min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-black px-1.5 ${
                                                isActive ? "bg-white text-primary-600" : "bg-primary-500 text-white shadow-soft"
                                            }`}
                                        >
                                            {badge}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                {isActive && !badge && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                                )}
                            </motion.div>
                        </Link>
                    );
                })}
            </nav>

            {/* User card at bottom */}
            <div className="pt-4 border-t border-soft-200 mt-2 space-y-2">
                <Link to="/profile">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-soft-100 soft-transition cursor-pointer group">
                        <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center font-black text-sm shrink-0">
                            {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-soft-900 truncate">{user?.full_name || "User"}</p>
                            <p className="text-[10px] font-medium text-soft-400 truncate">{user?.email}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-soft-300 group-hover:text-soft-500 shrink-0" />
                    </div>
                </Link>
                <button
                    onClick={logout}
                    className="flex items-center gap-3 px-4 py-2.5 w-full rounded-2xl text-soft-500 hover:bg-red-50 hover:text-red-600 soft-transition group"
                >
                    <LogOut className="w-4 h-4 text-soft-400 group-hover:text-red-500" />
                    <span className="font-semibold text-sm">Sign Out</span>
                </button>
            </div>
        </aside>
    );
}
