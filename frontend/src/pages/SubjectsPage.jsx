import { useEffect, useState, useMemo } from "react";
import { getSubjects, getAvailableSubjects, enrollSubject } from "../services/api";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, MoreVertical, ArrowRight, X, Loader2, Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";
import { useSearch } from "../contexts/SearchContext";
import { useSubjects } from "../contexts/SubjectsContext";

export default function SubjectsPage() {
    const { subjects, loading, refreshSubjects } = useSubjects();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Enrollment Form States
    const [step, setStep] = useState(1);
    const [enrollData, setEnrollData] = useState({
        department: "",
        year: "",
        section: "",
        subject_id: ""
    });
    const [availableSubjects, setAvailableSubjects] = useState([]);
    const [loadingAvailable, setLoadingAvailable] = useState(false);

    const navigate = useNavigate();
    const { searchQuery } = useSearch();

    const loadSubjects = () => refreshSubjects(true);

    useEffect(() => {
        loadSubjects();
    }, []);

    const groupedSubjects = useMemo(() => {
        const filtered = subjects.filter(s =>
            s.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.subject_id.toLowerCase().includes(searchQuery.toLowerCase())
        );

        const groups = {};
        filtered.forEach(s => {
            const dept = s.department || "Other";
            const year = s.year || "N/A";
            if (!groups[dept]) groups[dept] = {};
            if (!groups[dept][year]) groups[dept][year] = [];
            groups[dept][year].push(s);
        });
        return groups;
    }, [subjects, searchQuery]);

    const handleEnroll = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await enrollSubject({
                subject_id: enrollData.subject_id
            });
            setIsModalOpen(false);
            setStep(1);
            setEnrollData({ department: "", year: "", section: "", subject_id: "" });
            loadSubjects();
        } catch (err) {
            console.error("Failed to enroll:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchAvailable = async () => {
        setLoadingAvailable(true);
        try {
            const data = await getAvailableSubjects(enrollData.department, enrollData.year, enrollData.section);
            setAvailableSubjects(data);
            setStep(4);
        } catch (err) {
            console.error("Failed to fetch available subjects:", err);
        } finally {
            setLoadingAvailable(false);
        }
    };

    const container = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="max-w-7xl mx-auto pb-10">
            <header className="flex justify-between items-end mb-10">
                <div>
                    <h1 className="text-3xl font-bold text-soft-900 mb-2">My Registered Subjects</h1>
                    <p className="text-soft-500 font-medium">Derived from Subjects Master Source of Truth.</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setIsModalOpen(true); setStep(1); }}
                    className="flex items-center gap-2 bg-primary-500 text-white px-6 py-3 rounded-2xl font-bold shadow-soft hover:bg-primary-600 soft-transition"
                >
                    <Plus className="w-5 h-5" />
                    Enroll in Subject
                </motion.button>
            </header>

            <div className="space-y-12">
                {Object.entries(groupedSubjects).map(([dept, years]) => (
                    <div key={dept} className="space-y-8">
                        <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-soft-200"></div>
                            <h2 className="text-sm font-black text-soft-400 uppercase tracking-[0.3em]">{dept} Department</h2>
                            <div className="h-px flex-1 bg-soft-200"></div>
                        </div>

                        {Object.entries(years).map(([year, yearSubjects]) => (
                            <div key={year} className="space-y-6">
                                <h3 className="text-xl font-bold text-soft-800 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary-500"></div>
                                    {year}
                                </h3>

                                <motion.div
                                    variants={container}
                                    initial="hidden"
                                    animate="show"
                                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
                                >
                                    {yearSubjects.map((s) => (
                                        <motion.div
                                            key={s.subject_id}
                                            variants={item}
                                            whileHover={{ y: -8 }}
                                            className="group bg-white rounded-[2rem] p-8 shadow-soft border border-soft-100 relative overflow-hidden flex flex-col h-[280px]"
                                        >
                                            <div className="bg-primary-50 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-primary-500 soft-transition">
                                                <BookOpen className="w-7 h-7 text-primary-500 group-hover:text-white soft-transition" />
                                            </div>

                                            <div className="flex-1">
                                                <div className="text-[10px] font-bold text-primary-500 uppercase tracking-widest mb-1">{s.semester}</div>
                                                <h4 className="text-xl font-bold text-soft-900 mb-2 group-hover:text-primary-600 soft-transition">
                                                    {s.subject_name}
                                                </h4>
                                                <p className="text-sm font-medium text-soft-400">
                                                    Faculty: {s.faculty_name}
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => navigate(`/subject/${s.subject_id}`)}
                                                className="mt-6 flex items-center gap-2 text-primary-500 font-bold group-hover:gap-4 soft-transition"
                                            >
                                                Open Course Page
                                                <ArrowRight className="w-5 h-5" />
                                            </button>

                                            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary-400 to-primary-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"></div>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            </div>
                        ))}
                    </div>
                ))}

                {subjects.length === 0 && !loading && (
                    <div className="py-20 text-center">
                        <div className="bg-soft-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <BookOpen className="w-10 h-10 text-soft-300" />
                        </div>
                        <h3 className="text-xl font-bold text-soft-900">No subjects currently enrolled</h3>
                        <p className="text-soft-500 mt-2">Click "Enroll in Subject" to start your semester.</p>
                    </div>
                )}
            </div>

            {/* Enrollment Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-soft-900/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[2.5rem] shadow-soft-xl w-full max-w-lg p-10 relative overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="absolute top-0 right-0 p-6">
                                <button onClick={() => setIsModalOpen(false)} className="text-soft-300 hover:text-soft-900 soft-transition p-2 hover:bg-soft-50 rounded-xl">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex items-center gap-3 mb-8">
                                <div className="bg-primary-500 p-3 rounded-2xl shadow-soft">
                                    <Sparkles className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-soft-900">Course Enrollment</h2>
                                    <p className="text-soft-500 text-sm font-medium">Step {step} of 4</p>
                                </div>
                            </div>

                            <form onSubmit={handleEnroll} className="space-y-6">
                                {step === 1 && (
                                    <div className="space-y-4">
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Select Department</label>
                                        <div className="grid grid-cols-1 gap-3">
                                            {["MCA", "CSE"].map(dept => (
                                                <button
                                                    key={dept}
                                                    type="button"
                                                    onClick={() => { setEnrollData({ ...enrollData, department: dept }); setStep(2); }}
                                                    className="w-full bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-left font-bold hover:border-primary-400 hover:bg-primary-50 soft-transition flex justify-between items-center"
                                                >
                                                    {dept}
                                                    <ChevronRight className="w-5 h-5 text-soft-300" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {step === 2 && (
                                    <div className="space-y-4">
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Select Year</label>
                                        <div className="grid grid-cols-1 gap-3">
                                            {["1st Year", "2nd Year", "3rd Year"].map(y => (
                                                <button
                                                    key={y}
                                                    type="button"
                                                    onClick={() => { setEnrollData({ ...enrollData, year: y }); setStep(3); }}
                                                    className="w-full bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-left font-bold hover:border-primary-400 hover:bg-primary-50 soft-transition flex justify-between items-center"
                                                >
                                                    {y}
                                                    <ChevronRight className="w-5 h-5 text-soft-300" />
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={() => setStep(1)} className="text-sm font-bold text-soft-400 hover:text-primary-500">Back</button>
                                    </div>
                                )}

                                {step === 3 && (
                                    <div className="space-y-4">
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Select Section</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {["A", "B", "C"].map(sec => (
                                                <button
                                                    key={sec}
                                                    type="button"
                                                    onClick={() => { setEnrollData({ ...enrollData, section: sec }); fetchAvailable(); }}
                                                    className="bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-center font-bold hover:border-primary-400 hover:bg-primary-50 soft-transition"
                                                >
                                                    Section {sec}
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={() => setStep(2)} className="text-sm font-bold text-soft-400 hover:text-primary-500">Back</button>
                                    </div>
                                )}

                                {step === 4 && (
                                    <div className="space-y-4">
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Available Subjects</label>
                                        {loadingAvailable ? (
                                            <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
                                        ) : availableSubjects.length > 0 ? (
                                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                                {availableSubjects.map(subj => (
                                                    <button
                                                        key={subj.subject_id}
                                                        type="button"
                                                        onClick={() => setEnrollData({ ...enrollData, subject_id: subj.subject_id })}
                                                        className={`w-full border-2 rounded-2xl px-5 py-4 text-left soft-transition ${enrollData.subject_id === subj.subject_id ? 'border-primary-500 bg-primary-50' : 'border-soft-100 bg-soft-50'}`}
                                                    >
                                                        <div className="font-bold">{subj.subject_name}</div>
                                                        <div className="text-xs text-soft-400 uppercase tracking-wider">{subj.semester} • {subj.faculty_name}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-10 bg-soft-50 rounded-2xl">
                                                <CheckCircle2 className="w-10 h-10 text-soft-300 mx-auto mb-2" />
                                                <p className="text-soft-500 font-medium">All subjects enrolled!</p>
                                            </div>
                                        )}

                                        {enrollData.subject_id && (
                                            <div className="pt-4">
                                                <button
                                                    type="submit"
                                                    disabled={isSubmitting}
                                                    className="w-full bg-primary-500 text-white font-bold py-4 rounded-2xl shadow-soft hover:bg-primary-600 soft-transition flex items-center justify-center gap-3"
                                                >
                                                    {isSubmitting ? <Loader2 className="animate-spin" /> : "Confirm Enrollment"}
                                                </button>
                                            </div>
                                        )}
                                        <button onClick={() => setStep(3)} className="text-sm font-bold text-soft-400 hover:text-primary-500">Back</button>
                                    </div>
                                )}
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
