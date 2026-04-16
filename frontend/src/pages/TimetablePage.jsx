import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Calendar,
    Clock,
    Plus,
    User as UserIcon,
    BookOpen,
    MoreVertical,
    X,
    Loader2,
    Shield,
    ChevronLeft,
    ChevronRight,
    Search,
    MapPin
} from "lucide-react";
import { getTeacherTimetable } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useSubjects } from "../contexts/SubjectsContext";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function TimetablePage() {
    const { user } = useAuth();
    const { subjects, loading: subjectsLoading } = useSubjects();
    const isTeacher = user?.role === "teacher";

    const [timetableEntries, setTimetableEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadTimetable = async () => {
        setLoading(true);
        try {
            if (isTeacher) {
                const facultyId = user.faculty_id || "FAC001";
                const data = await getTeacherTimetable(facultyId);
                // Flatten schedule from all assigned subjects
                let flat = [];
                (data.assigned_subjects || []).forEach(sub => {
                    (sub.schedule || []).forEach(sch => {
                        flat.push({
                            ...sch,
                            subject_name: sub.subject_name,
                            subject_id: sub.subject_id,
                            dept_year: `${sub.department} - ${sub.year}`
                        });
                    });
                });
                setTimetableEntries(flat);
            } else {
                // For students, use enrolled subjects from context
                let flat = [];
                subjects.forEach(sub => {
                    (sub.schedule || []).forEach(sch => {
                        flat.push({
                            ...sch,
                            subject_name: sub.subject_name,
                            subject_id: sub.subject_id,
                            faculty_name: sub.faculty_name
                        });
                    });
                });
                setTimetableEntries(flat);
            }
        } catch (err) {
            console.error("Failed to load timetable:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!subjectsLoading) {
            loadTimetable();
        }
    }, [subjectsLoading, isTeacher]);

    const groupedTimetable = useMemo(() => {
        return DAYS.reduce((acc, day) => {
            acc[day] = timetableEntries
                .filter(item => item.day === day)
                .sort((a, b) => a.start.localeCompare(b.start));
            return acc;
        }, {});
    }, [timetableEntries]);

    return (
        <div className="max-w-7xl mx-auto pb-10">
            <header className="flex justify-between items-end mb-10">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-5 h-5 text-indigo-600" />
                        <span className="text-indigo-600 font-bold text-sm uppercase tracking-wider">
                            {isTeacher ? "Faculty Schedule" : "Student Timetable"}
                        </span>
                    </div>
                    <h1 className="text-3xl font-bold text-soft-900 mb-2">Weekly Class Schedule</h1>
                    <p className="text-soft-500 font-medium tracking-tight">
                        {isTeacher
                            ? "Auto-generated from your assigned subjects in the Master Collection."
                            : "Derived from your enrolled course schedule."}
                    </p>
                </div>
            </header>

            {(loading || subjectsLoading) ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-indigo-200 animate-spin mb-4" />
                    <p className="text-soft-400 font-bold uppercase tracking-widest text-xs">Synchronizing from Master Data...</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {DAYS.map((day) => (
                        <section key={day} className="relative">
                            <div className="flex items-center gap-4 mb-6">
                                <h3 className="text-xl font-bold text-soft-900 min-w-[120px]">{day}</h3>
                                <div className="h-[1px] flex-1 bg-soft-100"></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {groupedTimetable[day].length > 0 ? (
                                    groupedTimetable[day].map((item, idx) => (
                                        <motion.div
                                            key={`${item.subject_id}-${idx}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="bg-white p-6 rounded-[2rem] shadow-soft border border-soft-100 hover:border-indigo-200 soft-transition group relative overflow-hidden flex flex-col min-h-[220px]"
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white soft-transition">
                                                    <BookOpen className="w-5 h-5" />
                                                </div>
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-soft-50 rounded-lg text-soft-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 soft-transition">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span className="text-[10px] font-black uppercase tracking-tighter">{item.start} - {item.end}</span>
                                                </div>
                                            </div>

                                            <div className="flex-1">
                                                <h4 className="font-bold text-soft-900 group-hover:text-indigo-600 soft-transition mb-1 line-clamp-2">{item.subject_name}</h4>
                                                <p className="text-[10px] text-soft-400 font-bold uppercase tracking-widest mb-4">
                                                    {isTeacher ? item.dept_year : item.faculty_name}
                                                </p>
                                            </div>

                                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-soft-50">
                                                <div className="flex items-center gap-1.5 text-soft-500">
                                                    <MapPin className="w-3.5 h-3.5 text-green-500" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">{item.room || "TBA"}</span>
                                                </div>
                                            </div>

                                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 soft-transition">
                                                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
                                            </div>
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className="col-span-full py-8 rounded-[2rem] border-2 border-dashed border-soft-50 flex flex-col items-center justify-center text-soft-300">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] italic">Free Period</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
