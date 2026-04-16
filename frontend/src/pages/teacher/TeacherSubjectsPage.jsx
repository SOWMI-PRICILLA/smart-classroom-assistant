import { useEffect, useState, useMemo } from "react";
import { getSubjects, createSubject } from "../../services/api";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, MoreVertical, ArrowRight, X, Loader2, Sparkles, Shield, ChevronRight } from "lucide-react";
import { useSearch } from "../../contexts/SearchContext";
import { useSubjects } from "../../contexts/SubjectsContext";
import { useAuth } from "../../contexts/AuthContext";

export default function TeacherSubjectsPage() {
    const { subjects, loading, refreshSubjects } = useSubjects();
    const { user } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newSubject, setNewSubject] = useState({
        name: "",
        id: "",
        department: "MCA",
        year: "1st Year",
        section: "A",
        semester: "Semester 1",
        academic_year: "2025-2026"
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
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

    const handleCreateSubject = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await createSubject({
                subject_name: newSubject.name,
                subject_id: newSubject.id,
                department: newSubject.department,
                year: newSubject.year,
                section: newSubject.section,
                semester: newSubject.semester,
                academic_year: newSubject.academic_year,
                faculty_id: user?.faculty_id || "FAC001",
                faculty_name: user?.full_name || "Dr. Ravi Kumar",
                schedule: [] // Default empty schedule
            });
            setIsModalOpen(false);
            setNewSubject({
                name: "", id: "", department: "MCA", year: "1st Year",
                section: "A", semester: "Semester 1", academic_year: "2025-2026"
            });
            loadSubjects();
        } catch (err) {
            console.error("Failed to create subject:", err);
        } finally {
            setIsSubmitting(false);
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
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-5 h-5 text-indigo-600" />
                        <span className="text-indigo-600 font-bold text-sm uppercase tracking-wider">Teacher Management</span>
                    </div>
                    <h1 className="text-3xl font-bold text-soft-900 mb-2">Subjects Explorer</h1>
                    <p className="text-soft-500 font-medium">Derived from Subjects Collection (Master Source of Truth).</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold shadow-soft hover:bg-indigo-700 soft-transition"
                >
                    <Plus className="w-5 h-5" />
                    Define New Subject
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
                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
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
                                            <div className="bg-indigo-50 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 soft-transition">
                                                <BookOpen className="w-7 h-7 text-indigo-600 group-hover:text-white soft-transition" />
                                            </div>

                                            <div className="flex-1">
                                                <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">{s.semester} • Section {s.section}</div>
                                                <h4 className="text-xl font-bold text-soft-900 mb-2 group-hover:text-indigo-600 soft-transition">
                                                    {s.subject_name}
                                                </h4>
                                                <p className="text-sm font-medium text-soft-400">
                                                    ID: {s.subject_id} • {s.faculty_name}
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => navigate(`/teacher/subject/${s.subject_id}`)}
                                                className="mt-6 flex items-center gap-2 text-indigo-600 font-bold group-hover:gap-4 soft-transition"
                                            >
                                                Manage Content
                                                <ArrowRight className="w-5 h-5" />
                                            </button>

                                            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-indigo-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"></div>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Create Subject Modal */}
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
                            className="bg-white rounded-[2.5rem] shadow-soft-xl w-full max-w-2xl p-10 relative overflow-y-auto max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="absolute top-0 right-0 p-6">
                                <button onClick={() => setIsModalOpen(false)} className="text-soft-300 hover:text-soft-900 soft-transition p-2 hover:bg-soft-50 rounded-xl">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex items-center gap-3 mb-8">
                                <div className="bg-indigo-600 p-3 rounded-2xl shadow-soft">
                                    <Plus className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-soft-900">Define Subject</h2>
                                    <p className="text-soft-500 text-sm font-medium">Add to the Master Subjects Collection.</p>
                                </div>
                            </div>

                            <form onSubmit={handleCreateSubject} className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Subject Name</label>
                                        <input
                                            type="text"
                                            placeholder="Artificial Intelligence"
                                            value={newSubject.name}
                                            onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                                            className="w-full bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-soft-900 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 soft-transition font-medium"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Subject Code</label>
                                        <input
                                            type="text"
                                            placeholder="MCA301"
                                            value={newSubject.id}
                                            onChange={(e) => setNewSubject({ ...newSubject, id: e.target.value })}
                                            className="w-full bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-soft-900 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 soft-transition font-medium"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Department</label>
                                        <select
                                            value={newSubject.department}
                                            onChange={(e) => setNewSubject({ ...newSubject, department: e.target.value })}
                                            className="w-full bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-soft-900 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 soft-transition font-medium appearance-none"
                                        >
                                            <option>MCA</option>
                                            <option>CSE</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Year</label>
                                        <select
                                            value={newSubject.year}
                                            onChange={(e) => setNewSubject({ ...newSubject, year: e.target.value })}
                                            className="w-full bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-soft-900 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 soft-transition font-medium appearance-none"
                                        >
                                            <option>1st Year</option>
                                            <option>2nd Year</option>
                                            <option>3rd Year</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Semester</label>
                                        <input
                                            type="text"
                                            placeholder="Semester 3"
                                            value={newSubject.semester}
                                            onChange={(e) => setNewSubject({ ...newSubject, semester: e.target.value })}
                                            className="w-full bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-soft-900 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 soft-transition font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">Section</label>
                                        <input
                                            type="text"
                                            placeholder="A"
                                            value={newSubject.section}
                                            onChange={(e) => setNewSubject({ ...newSubject, section: e.target.value })}
                                            className="w-full bg-soft-50 border border-soft-200 rounded-2xl px-5 py-4 text-soft-900 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 soft-transition font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-soft hover:bg-indigo-700 soft-transition flex items-center justify-center gap-3 group"
                                    >
                                        {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                                            <>
                                                <span>Register Subject in Master Collection</span>
                                                <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
