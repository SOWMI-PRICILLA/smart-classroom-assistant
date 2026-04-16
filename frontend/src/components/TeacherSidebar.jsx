import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { getGlobalQuizzes, getGlobalSubmissions } from "../services/api";
import {
    LayoutDashboard, BookOpen, History, User, LogOut,
    GraduationCap, Settings, Shield, Trophy, Calendar, ChevronRight
} from "lucide-react";

const navItems = [
    { name: "Teacher Dashboard", path: "/teacher", icon: LayoutDashboard },
    { name: "My Subjects", path: "/teacher/subjects", icon: BookOpen },
    { name: "Timetable", path: "/teacher/timetable", icon: Calendar },
    { name: "Assessments", path: "/teacher/assessments", icon: Trophy },
    { name: "Class History", path: "/teacher/sessions", icon: History },
    { name: "Settings", path: "/settings", icon: Settings },
    { name: "Profile", path: "/profile", icon: User },
];

export default function TeacherSidebar() {
    const location = useLocation();
    const { logout, user } = useAuth();
    const [quizCount, setQuizCount] = useState(0);
    const [pendingSubmissions, setPendingSubmissions] = useState(0);

    useEffect(() => {
        if (user) {
            const checkActivity = async () => {
                try {
                    const [quizzes, submissions] = await Promise.all([
                        getGlobalQuizzes(),
                        getGlobalSubmissions()
                    ]);
                    setQuizCount((quizzes || []).length);
                    // New: count quizzes with at least one unreviewed submission
                    const quizIdsWithSubs = new Set((submissions || []).map(s => s.quiz_id));
                    setPendingSubmissions(quizIdsWithSubs.size);
                } catch (err) {
                    console.error("Failed to check assessment activity:", err);
                }
            };
            checkActivity();
            const interval = setInterval(checkActivity, 60000);
            return () => clearInterval(interval);
        }
    }, [user]);

    const initials = (user?.full_name || "T").split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

    return (
        <aside className="w-72 glass-morphism border-r border-soft-200 h-screen flex flex-col p-5 z-20">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8 px-2">
                <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-soft shrink-0">
                    <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-base font-black leading-tight text-soft-900">Teacher Portal</h1>
                    <p className="text-[10px] text-soft-500 font-bold tracking-wider uppercase">Educator · Instructor</p>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 space-y-1">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path ||
                        (item.path !== "/teacher" && location.pathname.startsWith(item.path));
                    const Icon = item.icon;
                    const badge = item.name === "Assessments" && quizCount > 0 ? quizCount : null;

                    return (
                        <Link key={item.path} to={item.path}>
                            <motion.div
                                whileHover={{ x: 3 }}
                                whileTap={{ scale: 0.97 }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer soft-transition ${
                                    isActive
                                        ? "bg-indigo-600 text-white shadow-soft"
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
                                                isActive ? "bg-white text-indigo-600" : "bg-indigo-600 text-white shadow-soft"
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
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                            {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-soft-900 truncate">{user?.full_name || "Instructor"}</p>
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
