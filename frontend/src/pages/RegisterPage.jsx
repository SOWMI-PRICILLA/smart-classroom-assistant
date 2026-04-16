import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, Mail, Lock, User, ArrowRight, AlertCircle, Loader2, Briefcase } from "lucide-react";

export default function RegisterPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [role, setRole] = useState("student");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await fetch("http://localhost:8001/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    full_name: fullName,
                    role
                })
            });

            const data = await response.json();

            if (response.ok) {
                login(data.access_token);
                navigate("/");
            } else {
                setError(data.detail || "Registration failed. Please check your details.");
            }
        } catch (err) {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-soft-50 p-4 font-sans selection:bg-primary-100 selection:text-primary-900">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-8 flex flex-col items-center"
            >
                <div className="bg-primary-500 p-4 rounded-[2rem] shadow-soft mb-4">
                    <GraduationCap className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-soft-900">Create Account</h1>
                <p className="text-soft-500 font-medium mt-1">Join the smart learning revolution</p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-white p-10 rounded-[2.5rem] shadow-soft-xl w-full max-w-md border border-soft-100"
            >
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl mb-6 flex items-start gap-3 text-sm font-medium"
                        >
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">
                            Full Name
                        </label>
                        <div className="relative group">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-soft-400 group-focus-within:text-primary-500 soft-transition" />
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full bg-soft-50 border border-soft-200 rounded-2xl pl-12 pr-4 py-3.5 text-soft-900 outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 soft-transition"
                                placeholder="Alex Johnson"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">
                            Email Address
                        </label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-soft-400 group-focus-within:text-primary-500 soft-transition" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-soft-50 border border-soft-200 rounded-2xl pl-12 pr-4 py-3.5 text-soft-900 outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 soft-transition"
                                placeholder="name@company.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">
                            Password
                        </label>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-soft-400 group-focus-within:text-primary-500 soft-transition" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-soft-50 border border-soft-200 rounded-2xl pl-12 pr-4 py-3.5 text-soft-900 outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 soft-transition"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-soft-700 text-sm font-bold mb-2 ml-1">
                            Role
                        </label>
                        <div className="relative group">
                            <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-soft-400 group-focus-within:text-primary-500 soft-transition" />
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="w-full bg-soft-50 border border-soft-200 rounded-2xl pl-12 pr-4 py-3.5 text-soft-900 outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 soft-transition appearance-none cursor-pointer"
                            >
                                <option value="student">Student</option>
                                <option value="teacher">Teacher</option>
                            </select>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary-500 text-white font-bold py-4 px-4 rounded-2xl hover:bg-primary-600 disabled:bg-soft-200 disabled:text-soft-400 disabled:cursor-not-allowed soft-transition shadow-soft flex items-center justify-center gap-2 group mt-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                Create Account
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 soft-transition" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-8 border-t border-soft-100 text-center">
                    <p className="text-soft-500 font-medium italic">
                        Already have an account?{" "}
                        <Link to="/login" className="text-primary-500 font-bold hover:text-primary-600 hover:underline soft-transition not-italic">
                            Login here
                        </Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
