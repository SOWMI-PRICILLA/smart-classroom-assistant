import { motion, AnimatePresence } from "framer-motion";
import TeacherSidebar from "../components/TeacherSidebar";
import Topbar from "../components/Topbar";
import ActiveSessionAlert from "../components/ActiveSessionAlert";
import { useLocation } from "react-router-dom";

export default function TeacherDashboardLayout({ children }) {
    const location = useLocation();

    return (
        <div className="flex h-screen bg-soft-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">
            <TeacherSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <ActiveSessionAlert />
                <Topbar />

                <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="h-full"
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
