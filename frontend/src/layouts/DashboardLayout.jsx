import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import ActiveSessionAlert from "../components/ActiveSessionAlert";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

export default function DashboardLayout({ children }) {
    const location = useLocation();
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-soft-50">
                <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) return null; // Should be handled by ProtectedRoute but extra safety

    return (
        <div className="flex h-screen bg-soft-50 font-sans selection:bg-primary-100 selection:text-primary-900">
            <Sidebar />

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
