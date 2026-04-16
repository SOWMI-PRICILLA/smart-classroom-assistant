import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { getSubjects } from "../services/api";

const SubjectsContext = createContext(null);

export function SubjectsProvider({ children }) {
    const [subjects, setSubjects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastFetched, setLastFetched] = useState(null);

    const refreshSubjects = useCallback(async (force = false) => {
        // Cache for 5 minutes unless forced
        if (!force && lastFetched && Date.now() - lastFetched < 300000) {
            return;
        }

        setLoading(true);
        try {
            const data = await getSubjects();
            
            // If data is an error object (e.g. {detail: "..."}), handle it gracefully
            if (data && data.detail) {
                console.warn("API returned error:", data.detail);
                setError(data.detail);
                setSubjects([]);
                return;
            }

            // Flatten grouped data if it's an object, otherwise keep as is
            let flatSubjects = [];
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                // Ensure we are iterating over a valid nested structure
                Object.values(data).forEach(depts => {
                    if (typeof depts === 'object') {
                        Object.values(depts).forEach(years => {
                            if (typeof years === 'object') {
                                Object.values(years).forEach(sems => {
                                    if (Array.isArray(sems)) {
                                        flatSubjects = flatSubjects.concat(sems);
                                    }
                                });
                            }
                        });
                    }
                });
            } else {
                flatSubjects = Array.isArray(data) ? data : [];
            }

            setSubjects(flatSubjects);
            setLastFetched(Date.now());
            setError(null);
        } catch (err) {
            console.error("Failed to fetch subjects:", err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [lastFetched]);

    useEffect(() => {
        refreshSubjects();
    }, []);

    const getSubjectName = useCallback((subjectId) => {
        const subject = subjects.find(s => s.subject_id === subjectId);
        return subject ? subject.subject_name : subjectId;
    }, [subjects]);

    const subjectMap = useMemo(() => {
        const map = {};
        subjects.forEach(s => {
            map[s.subject_id] = s.subject_name;
        });
        return map;
    }, [subjects]);

    return (
        <SubjectsContext.Provider value={{
            subjects,
            loading,
            error,
            refreshSubjects,
            getSubjectName,
            subjectMap
        }}>
            {children}
        </SubjectsContext.Provider>
    );
}

export function useSubjects() {
    const context = useContext(SubjectsContext);
    if (!context) {
        throw new Error("useSubjects must be used within SubjectsProvider");
    }
    return context;
}
