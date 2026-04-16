import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Mail, Shield, Award, Calendar, Edit3, Save, X, CheckCircle, Loader2, BookOpen, Trophy, Clock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useSubjects } from "../contexts/SubjectsContext";

export default function ProfilePage() {
    const { user } = useAuth();
    const { subjects } = useSubjects();
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(user?.full_name || "");
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Flatten subjects for student view
    const allSubjects = subjects && typeof subjects === "object"
        ? Object.values(subjects).flatMap(dept =>
            Object.values(dept).flatMap(year => Object.values(year).flat())
        )
        : Array.isArray(subjects) ? subjects : [];

    const enrolledSubjects = user?.enrolled_subjects
        ? allSubjects.filter(s => user.enrolled_subjects.includes(s.subject_id))
        : [];

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin" />
            </div>
        );
    }

    const initials = (user.full_name || "U")
        .split(" ")
        .map(n => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);

    const roleLabel = user.role === "teacher" ? "Instructor" : "Student";
    const roleColor = user.role === "teacher" ? "indigo" : "primary";

    const handleSave = async () => {
        setIsSaving(true);
        // Simulate save - in a real app this would call a PATCH /auth/me endpoint
        await new Promise(r => setTimeout(r, 600));
        setIsSaving(false);
        setSaved(true);
        setIsEditing(false);
        setTimeout(() => setSaved(false), 2500);
    };

    return (
        <div className="max-w-5xl mx-auto pb-12">
            {/* Hero Header */}
            <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 rounded-[3rem] p-10 mb-8 overflow-hidden shadow-xl shadow-primary-500/20">
                {/* Background pattern */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-4 right-8 w-64 h-64 rounded-full border-2 border-white" />
                    <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full border-2 border-white" />
                </div>

                <div className="relative flex flex-col md:flex-row items-start md:items-center gap-8">
                    {/* Avatar */}
                    <div className="w-28 h-28 rounded-[2rem] bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-black text-4xl border-2 border-white/30 shadow-lg shrink-0">
                        {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                        <AnimatePresence mode="wait">
                            {isEditing ? (
                                <motion.div key="edit" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 mb-2">
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        className="text-2xl font-black bg-white/20 text-white placeholder-white/60 rounded-2xl px-5 py-2.5 border-2 border-white/30 focus:outline-none focus:border-white/70 backdrop-blur-sm"
                                        placeholder="Your full name"
                                    />
                                    <button onClick={handleSave} disabled={isSaving} className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-white transition-all border border-white/30">
                                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    </button>
                                    <button onClick={() => { setIsEditing(false); setEditName(user.full_name || ""); }} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all border border-white/20">
                                        <X className="w-5 h-5" />
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 mb-2">
                                    <h1 className="text-3xl font-black text-white">{user.full_name || "User"}</h1>
                                    {saved && (
                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="p-1 bg-emerald-400 rounded-full">
                                            <CheckCircle className="w-4 h-4 text-white" />
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <p className="text-white/70 font-bold mb-4">{user.email}</p>
                        <div className="flex flex-wrap gap-3">
                            <span className="px-4 py-1.5 bg-white/20 backdrop-blur-sm text-white text-xs font-black rounded-full border border-white/30 uppercase tracking-widest">
                                {roleLabel}
                            </span>
                            <span className="px-4 py-1.5 bg-white/10 text-white/80 text-xs font-bold rounded-full border border-white/20">
                                <Calendar className="w-3 h-3 inline mr-1.5" />
                                Active Member
                            </span>
                        </div>
                    </div>

                    {/* Edit button */}
                    {!isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-bold text-sm border border-white/30 backdrop-blur-sm transition-all"
                        >
                            <Edit3 className="w-4 h-4" /> Edit Profile
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left column */}
                <div className="space-y-6">
                    {/* Contact Info */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-soft-100 shadow-soft">
                        <h3 className="text-base font-black text-soft-900 mb-6 flex items-center gap-2">
                            <Mail className="w-4 h-4 text-primary-500" /> Contact Info
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-soft-50 rounded-2xl border border-soft-100">
                                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-soft-400 border border-soft-100">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-soft-400 uppercase tracking-widest">Email</p>
                                    <p className="text-sm font-bold text-soft-800 break-all">{user.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-soft-50 rounded-2xl border border-soft-100">
                                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-soft-400 border border-soft-100">
                                    <Shield className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-soft-400 uppercase tracking-widest">Role</p>
                                    <p className="text-sm font-bold text-soft-800">{roleLabel}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats for teacher */}
                    {user.role === "teacher" && (
                        <div className="bg-white p-8 rounded-[2.5rem] border border-soft-100 shadow-soft">
                            <h3 className="text-base font-black text-soft-900 mb-6 flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-indigo-500" /> At a Glance
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: "Subjects", value: allSubjects.length, icon: BookOpen, color: "indigo" },
                                    { label: "Active", value: "—", icon: Clock, color: "emerald" },
                                ].map(({ label, value, icon: Icon, color }) => (
                                    <div key={label} className={`p-4 bg-${color}-50 rounded-2xl border border-${color}-100 text-center`}>
                                        <Icon className={`w-5 h-5 text-${color}-500 mx-auto mb-1`} />
                                        <p className="text-xl font-black text-soft-900">{value}</p>
                                        <p className="text-[9px] font-black text-soft-400 uppercase tracking-widest">{label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right column */}
                <div className="md:col-span-2 space-y-6">
                    {/* Enrolled Subjects (students) */}
                    {user.role === "student" && (
                        <div className="bg-white p-8 rounded-[2.5rem] border border-soft-100 shadow-soft">
                            <h3 className="text-base font-black text-soft-900 mb-6 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-primary-500" /> Enrolled Subjects
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {enrolledSubjects.length > 0 ? enrolledSubjects.map((s) => (
                                    <div key={s.subject_id} className="p-4 bg-soft-50 rounded-2xl border border-soft-100 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                                            <BookOpen className="w-4 h-4 text-primary-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-soft-900 leading-tight">{s.subject_name}</p>
                                            <p className="text-[10px] font-bold text-soft-400 uppercase tracking-wider">{s.faculty_name}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="col-span-2 py-10 text-center bg-soft-50 rounded-2xl border border-dashed border-soft-200">
                                        <BookOpen className="w-8 h-8 text-soft-300 mx-auto mb-2" />
                                        <p className="text-soft-400 font-medium text-sm">No subjects enrolled yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Achievements */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-soft-100 shadow-soft">
                        <h3 className="text-base font-black text-soft-900 mb-6 flex items-center gap-2">
                            <Award className="w-4 h-4 text-amber-500" /> Achievements
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            {(user.role === "teacher"
                                ? ["AI-Powered Educator", "Session Creator", "Assessment Builder"]
                                : ["Active Learner", "Quiz Taker", "Knowledge Seeker"]
                            ).map((tag, i) => (
                                <motion.span
                                    key={i}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="px-5 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 text-xs font-black rounded-2xl border border-amber-100 shadow-sm flex items-center gap-2"
                                >
                                    <Award className="w-3.5 h-3.5" />
                                    {tag}
                                </motion.span>
                            ))}
                        </div>
                    </div>

                    {/* Account Security */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-soft-100 shadow-soft">
                        <h3 className="text-base font-black text-soft-900 mb-6 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-emerald-500" /> Account Security
                        </h3>
                        <div className="flex items-center justify-between p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="font-black text-emerald-900 text-sm">Account Verified</p>
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Password secured · Session active</p>
                                </div>
                            </div>
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-widest">Secure</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
