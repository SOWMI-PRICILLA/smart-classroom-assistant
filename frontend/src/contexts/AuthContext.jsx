import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const saved = sessionStorage.getItem("user");
        return saved ? JSON.parse(saved) : null;
    });
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [loading, setLoading] = useState(!sessionStorage.getItem("user") && !!localStorage.getItem("token"));

    useEffect(() => {
        let isMounted = true;
        if (token) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            fetch("http://localhost:8001/auth/me", {
                headers: { "Authorization": `Bearer ${token}` },
                signal: controller.signal
            })
                .then(res => {
                    if (!res.ok) throw new Error("Auth failed");
                    return res.json();
                })
                .then(data => {
                    if (isMounted) {
                        if (data.email) {
                            setUser(data);
                            sessionStorage.setItem("user", JSON.stringify(data));
                        } else {
                            logout();
                        }
                    }
                })
                .catch((err) => {
                    if (isMounted) {
                        console.error("Auth sync error:", err);
                        // Only logout if it's a 401, not a network error/timeout
                        if (err.message === "Auth failed") logout();
                    }
                })
                .finally(() => {
                    if (isMounted) {
                        setLoading(false);
                        clearTimeout(timeoutId);
                    }
                });
        } else {
            setLoading(false);
        }
        return () => { isMounted = false; };
    }, [token]);

    const login = (newToken) => {
        localStorage.setItem("token", newToken);
        setLoading(true);
        setToken(newToken);
    };

    const logout = () => {
        localStorage.removeItem("token");
        sessionStorage.removeItem("user");
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
}
