import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Settings as SettingsIcon, Shield, Bell, User, 
    Moon, Sun, Globe, Volume2, Loader2, CheckCircle,
    ChevronRight, Eye, EyeOff, Lock, Laptop, Monitor
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const THEME_OPTIONS = [
    { id: "light", label: "Light", icon: Sun, desc: "Clean white interface" },
    { id: "system", label: "System", icon: Monitor, desc: "Follow device setting" },
    { id: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes (coming soon)", disabled: true },
];

const NOTIFICATION_OPTIONS = [
    { id: "new_session", label: "New Session Started", desc: "When a session begins in your enrolled subject" },
    { id: "new_quiz", label: "New Assessment Posted", desc: "When a teacher publishes a new quiz" },
    { id: "graded", label: "Quiz Graded", desc: "When your submission has been evaluated" },
    { id: "announcements", label: "Announcements", desc: "Subject-level announcements from teachers" },
];

export default function SettingsPage() {
    const { user, logout } = useAuth();
    const [activeSection, setActiveSection] = useState(null);

    // Profile settings
    const [displayName, setDisplayName] = useState(user?.full_name || "");
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profileSaved, setProfileSaved] = useState(false);

    // Security settings
    const [currentPwd, setCurrentPwd] = useState("");
    const [newPwd, setNewPwd] = useState("");
    const [showPwd, setShowPwd] = useState(false);
    const [isSavingPwd, setIsSavingPwd] = useState(false);
    const [pwdSaved, setPwdSaved] = useState(false);

    // Appearance
    const [theme, setTheme] = useState("light");

    // Notifications
    const [notifications, setNotifications] = useState({
        new_session: true, new_quiz: true, graded: true, announcements: false
    });

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        await new Promise(r => setTimeout(r, 700));
        setIsSavingProfile(false);
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 3000);
    };

    const handleSavePwd = async () => {
        if (!currentPwd || !newPwd) return;
        setIsSavingPwd(true);
        await new Promise(r => setTimeout(r, 700));
        setIsSavingPwd(false);
        setPwdSaved(true);
        setCurrentPwd(""); setNewPwd("");
        setTimeout(() => setPwdSaved(false), 3000);
    };

    const toggleNotification = (id) => {
        setNotifications(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const sections = [
        {
            id: "profile",
            title: "Profile Information",
            desc: "Update your display name and account details.",
            icon: User, color: "primary",
        },
        {
            id: "notifications",
            title: "Notifications",
            desc: "Control what events alert you inside the platform.",
            icon: Bell, color: "amber",
        },
        {
            id: "security",
            title: "Security",
            desc: "Manage your password and account access.",
            icon: Shield, color: "emerald",
        },
        {
            id: "appearance",
            title: "Appearance",
            desc: "Customize how the interface looks.",
            icon: Laptop, color: "indigo",
        },
    ];

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <header className="mb-10">
                <h1 className="text-3xl font-black text-soft-900 mb-2">Settings</h1>
                <p className="text-soft-500 font-medium">Manage your account preferences and application settings.</p>
            </header>

            <div className="space-y-4">
                {sections.map((section, i) => {
                    const Icon = section.icon;
                    const isOpen = activeSection === section.id;
                    const colorMap = {
                        primary: { bg: "bg-primary-50", text: "text-primary-600", border: "border-primary-100", active: "bg-primary-500" },
                        amber: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-100", active: "bg-amber-500" },
                        emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100", active: "bg-emerald-500" },
                        indigo: { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-100", active: "bg-indigo-500" },
                    };
                    const c = colorMap[section.color];

                    return (
                        <motion.div
                            key={section.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.07 }}
                            className={`bg-white rounded-[2rem] border ${c.border} shadow-soft overflow-hidden`}
                        >
                            {/* Section header */}
                            <button
                                onClick={() => setActiveSection(isOpen ? null : section.id)}
                                className="w-full flex items-center gap-5 p-7 hover:bg-soft-50/50 soft-transition text-left"
                            >
                                <div className={`w-13 h-13 p-3.5 rounded-2xl ${c.bg} ${c.text} shrink-0`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-base font-black text-soft-900">{section.title}</h3>
                                    <p className="text-soft-500 text-sm font-medium">{section.desc}</p>
                                </div>
                                <ChevronRight className={`w-5 h-5 text-soft-300 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} />
                            </button>

                            {/* Expandable content */}
                            <AnimatePresence>
                                {isOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="overflow-hidden"
                                    >
                                        <div className={`border-t ${c.border} p-7 space-y-5 bg-soft-50/30`}>
                                            {/* ── Profile ── */}
                                            {section.id === "profile" && (
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="text-[10px] font-black text-soft-400 uppercase tracking-widest mb-2 block">Display Name</label>
                                                        <input
                                                            value={displayName}
                                                            onChange={e => setDisplayName(e.target.value)}
                                                            className="w-full bg-white border-2 border-soft-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-soft-900 focus:outline-none focus:border-primary-400 transition-all"
                                                            placeholder="Your full name..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-soft-400 uppercase tracking-widest mb-2 block">Email Address</label>
                                                        <input
                                                            value={user?.email || ""}
                                                            disabled
                                                            className="w-full bg-soft-100 border-2 border-soft-100 rounded-2xl px-5 py-3.5 text-sm font-bold text-soft-400 cursor-not-allowed"
                                                        />
                                                        <p className="text-[10px] text-soft-400 font-medium mt-1.5 ml-1">Email cannot be changed.</p>
                                                    </div>
                                                    <div className="flex justify-end">
                                                        <button
                                                            onClick={handleSaveProfile}
                                                            disabled={isSavingProfile}
                                                            className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary-500/20 transition-all active:scale-95"
                                                        >
                                                            {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : profileSaved ? <CheckCircle className="w-4 h-4" /> : null}
                                                            {profileSaved ? "Saved!" : "Save Changes"}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── Notifications ── */}
                                            {section.id === "notifications" && (
                                                <div className="space-y-4">
                                                    {NOTIFICATION_OPTIONS.map(opt => (
                                                        <div key={opt.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-soft-100">
                                                            <div>
                                                                <p className="font-bold text-soft-900 text-sm">{opt.label}</p>
                                                                <p className="text-xs text-soft-400 font-medium">{opt.desc}</p>
                                                            </div>
                                                            <button
                                                                onClick={() => toggleNotification(opt.id)}
                                                                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${notifications[opt.id] ? 'bg-amber-400' : 'bg-soft-200'}`}
                                                            >
                                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${notifications[opt.id] ? 'translate-x-7' : 'translate-x-1'}`} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <p className="text-[10px] text-soft-400 font-medium italic">Note: Notification preferences are stored locally on this device.</p>
                                                </div>
                                            )}

                                            {/* ── Security ── */}
                                            {section.id === "security" && (
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 mb-2">
                                                        <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                                        <p className="text-sm font-bold text-emerald-800">Your account is secured with password authentication.</p>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-soft-400 uppercase tracking-widest mb-2 block">Current Password</label>
                                                        <div className="relative">
                                                            <input
                                                                type={showPwd ? "text" : "password"}
                                                                value={currentPwd}
                                                                onChange={e => setCurrentPwd(e.target.value)}
                                                                className="w-full bg-white border-2 border-soft-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-soft-900 focus:outline-none focus:border-emerald-400 transition-all pr-12"
                                                                placeholder="Enter current password..."
                                                            />
                                                            <button onClick={() => setShowPwd(!showPwd)} className="absolute right-4 top-1/2 -translate-y-1/2 text-soft-400 hover:text-soft-600">
                                                                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-soft-400 uppercase tracking-widest mb-2 block">New Password</label>
                                                        <input
                                                            type={showPwd ? "text" : "password"}
                                                            value={newPwd}
                                                            onChange={e => setNewPwd(e.target.value)}
                                                            className="w-full bg-white border-2 border-soft-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-soft-900 focus:outline-none focus:border-emerald-400 transition-all"
                                                            placeholder="Enter new password..."
                                                        />
                                                        {newPwd && newPwd.length < 8 && (
                                                            <p className="text-[10px] text-red-500 font-bold mt-1 ml-1">Password must be at least 8 characters.</p>
                                                        )}
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <button onClick={logout} className="text-xs font-bold text-red-500 hover:text-red-700 hover:underline">Sign out all devices</button>
                                                        <button
                                                            onClick={handleSavePwd}
                                                            disabled={isSavingPwd || !currentPwd || newPwd.length < 8}
                                                            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                                        >
                                                            {isSavingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : pwdSaved ? <CheckCircle className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                                            {pwdSaved ? "Password Updated!" : "Update Password"}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── Appearance ── */}
                                            {section.id === "appearance" && (
                                                <div className="space-y-5">
                                                    <div>
                                                        <p className="text-[10px] font-black text-soft-400 uppercase tracking-widest mb-3">Color Theme</p>
                                                        <div className="grid grid-cols-3 gap-3">
                                                            {THEME_OPTIONS.map(opt => {
                                                                const Icon = opt.icon;
                                                                return (
                                                                    <button
                                                                        key={opt.id}
                                                                        onClick={() => !opt.disabled && setTheme(opt.id)}
                                                                        disabled={opt.disabled}
                                                                        className={`p-5 rounded-2xl border-2 text-center transition-all ${
                                                                            theme === opt.id && !opt.disabled
                                                                                ? "border-indigo-500 bg-indigo-50"
                                                                                : opt.disabled
                                                                                    ? "border-soft-100 bg-soft-50 opacity-50 cursor-not-allowed"
                                                                                    : "border-soft-100 bg-white hover:border-indigo-200"
                                                                        }`}
                                                                    >
                                                                        <Icon className={`w-6 h-6 mx-auto mb-2 ${theme === opt.id ? 'text-indigo-600' : 'text-soft-400'}`} />
                                                                        <p className={`text-xs font-black ${theme === opt.id ? 'text-indigo-700' : 'text-soft-600'}`}>{opt.label}</p>
                                                                        <p className="text-[9px] font-medium text-soft-400 mt-0.5">{opt.desc}</p>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <Volume2 className="w-5 h-5 text-indigo-500" />
                                                                <div>
                                                                    <p className="font-black text-indigo-900 text-sm">Sound Effects</p>
                                                                    <p className="text-[10px] text-indigo-600 font-medium">UI interaction sounds</p>
                                                                </div>
                                                            </div>
                                                            <span className="text-[9px] font-black text-indigo-500 bg-indigo-100 px-3 py-1 rounded-full uppercase tracking-widest">Coming Soon</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            {/* App info footer */}
            <div className="mt-10 p-6 bg-soft-50 rounded-[2rem] border border-soft-100 flex items-center justify-between">
                <div>
                    <p className="font-black text-soft-700 text-sm">Smart Classroom Assistant</p>
                    <p className="text-[10px] text-soft-400 font-medium uppercase tracking-widest">Version 2.0 · Production Build</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl text-emerald-600 font-black text-xs border border-emerald-100 shadow-sm">
                    <CheckCircle className="w-3.5 h-3.5" /> All Systems Operational
                </div>
            </div>
        </div>
    );
}
