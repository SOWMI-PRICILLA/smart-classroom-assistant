// Use the current host to avoid hardcoded IP issues when accessing over a network
export const BASE_URL = `http://${window.location.hostname}:8001`;

export async function getNotifications() {
    const res = await fetchWithAuth(`${BASE_URL}/notifications`);
    return res.json();
}

/**
 * Resolves a URL from the backend. If it's relative, prefixes it with the BASE_URL.
 */
export function resolveUrl(url) {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) {
        // If it's already absolute but points to the old IP, replace it
        // This is a safety measure for legacy data in the DB
        return url.replace("192.168.1.97", window.location.hostname);
    }
    return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function getAuthHeaders() {
    const token = localStorage.getItem("token");
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function fetchWithAuth(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        // Unauthorized - redirect to login
        localStorage.removeItem("token");
        window.location.href = "/login";
        throw new Error("Unauthorized");
    }

    return response;
}

export async function getSubjects() {
    const res = await fetchWithAuth(`${BASE_URL}/subjects`);
    return res.json();
}

export async function getSessionsBySubject(subjectId, limit = 20, offset = 0) {
    const res = await fetchWithAuth(
        `${BASE_URL}/sessions/by-subject/${subjectId}?limit=${limit}&offset=${offset}`
    );
    return res.json();
}

export async function getSessionTranscripts(sessionId) {
    const res = await fetchWithAuth(
        `${BASE_URL}/sessions/transcripts/${sessionId}`
    );
    return res.json();
}

export async function getSessionAnalysis(sessionId) {
    const res = await fetchWithAuth(
        `${BASE_URL}/sessions/analysis/${sessionId}`
    );
    return res.json();
}

export async function getSessions(limit = 20, offset = 0) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/list?limit=${limit}&offset=${offset}`);
    return res.json();
}

export async function getSessionDetail(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/detail/${sessionId}`);
    return res.json();
}

export async function finalizeSessionAnalysis(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/finalize-analysis/${sessionId}`, {
        method: "POST",
    });
    return res.json();
}

export async function createSubject(subjectData) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subjectData)
    });
    return res.json();
}

// --- Session Lifecycle ---

export async function startSession(subjectId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_id: subjectId })
    });
    return res.json();
}

export async function stopSession(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/stop/${sessionId}`, {
        method: "POST"
    });
    return res.json();
}


export async function getActiveSessions() {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/active`);
    return res.json();
}

// --- Timetable ---

export async function getTimetable() {
    const res = await fetchWithAuth(`${BASE_URL}/timetable`);
    return res.json();
}

export async function addTimetableEntry(entry) {
    const res = await fetchWithAuth(`${BASE_URL}/timetable/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
    });
    return res.json();
}

export async function getAvailableSubjects(dept, year, section) {
    const res = await fetchWithAuth(
        `${BASE_URL}/subjects/available?department=${dept}&year=${year}&section=${section}`
    );
    return res.json();
}

export async function enrollSubject(data) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function getTeacherTimetable(facultyId) {
    const res = await fetchWithAuth(`${BASE_URL}/teacher/timetable/${facultyId}`);
    return res.json();
}

export async function uploadMaterial(file) {
    const formData = new FormData();
    formData.append("file", file);
    
    const res = await fetchWithAuth(`${BASE_URL}/upload/material`, {
        method: "POST",
        body: formData // fetch defaults Content-Type to multipart/form-data with boundary when body is FormData
    });
    return res.json();
}

export async function deleteSessionMaterial(sessionId, materialId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/materials/${materialId}`, {
        method: "DELETE"
    });
    return res.json();
}

export async function updateSessionMetadata(sessionId, data) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/update-metadata/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function downloadSessionPDF(sessionId, filename = "session_insights.pdf") {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/export-pdf`);
    
    if (!res.ok) {
        throw new Error("Failed to export PDF");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// --- Announcements ---
export async function getAnnouncements(subjectId) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/${subjectId}/announcements`);
    return res.json();
}
export async function createAnnouncement(subjectId, data) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/${subjectId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}
export async function deleteAnnouncement(announcementId) {
    const res = await fetchWithAuth(`${BASE_URL}/announcements/${announcementId}`, { method: "DELETE" });
    return res.json();
}

// --- Subject Materials ---
export async function getSubjectMaterials(subjectId) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/${subjectId}/materials`);
    return res.json();
}
export async function addSubjectMaterial(subjectId, data) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/${subjectId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}
export async function deleteSubjectMaterial(materialId) {
    const res = await fetchWithAuth(`${BASE_URL}/subject_materials/${materialId}`, { method: "DELETE" });
    return res.json();
}

// --- Assignments ---
export async function getAssignments(subjectId) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/${subjectId}/assignments`);
    return res.json();
}
export async function createAssignment(subjectId, data) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/${subjectId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}
export async function deleteAssignment(assignmentId) {
    const res = await fetchWithAuth(`${BASE_URL}/assignments/${assignmentId}`, { method: "DELETE" });
    return res.json();
}
export async function submitAssignment(assignmentId, data) {
    const res = await fetchWithAuth(`${BASE_URL}/assignments/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}
export async function getAssignmentSubmissions(assignmentId) {
    const res = await fetchWithAuth(`${BASE_URL}/assignments/${assignmentId}/submissions`);
    return res.json();
}
export async function gradeSubmission(submissionId, data) {
    const res = await fetchWithAuth(`${BASE_URL}/assignments/submissions/${submissionId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}

// --- Recommended Learning Resources ---
export async function getSessionResources(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/resources`);
    return res.json();
}

export async function fetchSessionResources(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/fetch-resources`, {
        method: "POST"
    });
    return res.json();
}

export async function addSessionResource(sessionId, data) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function updateSessionResource(sessionId, resourceId, data) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/resources/${resourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function deleteSessionResource(sessionId, resourceId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/resources/${resourceId}`, {
        method: "DELETE"
    });
    return res.json();
}

// --- AI Teaching Assistant (Feature 1) ---
export async function askAI(question, sessionId, context = []) {
    const res = await fetchWithAuth(`${BASE_URL}/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, session_id: sessionId, context })
    });
    return res.json();
}

// --- Quiz Grader (Feature 5) ---
export async function gradeQuizAnswer(question, studentAnswer, studentName) {
    const res = await fetchWithAuth(`${BASE_URL}/ai/grade-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, student_answer: studentAnswer, student_name: studentName })
    });
    return res.json();
}

// --- RAG Assessments ---

export async function generateRagQuiz(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/generate-quiz`, {
        method: "POST"
    });
    return res.json();
}

export async function getSessionQuiz(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/quiz`);
    return res.json();
}

export async function submitRagQuiz(quizId, answers) {
    const res = await fetchWithAuth(`${BASE_URL}/quizzes/${quizId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
    });
    return res.json();
}

export async function getQuizResults(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/quiz-results`);
    return res.json();
}

export async function indexSessionMaterials(sessionId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/${sessionId}/index-materials`, {
        method: "POST"
    });
    return res.json();
}

export async function getGlobalQuizzes() {
    const res = await fetchWithAuth(`${BASE_URL}/quizzes/global`);
    return res.json();
}

export async function getGlobalSubmissions() {
    const res = await fetchWithAuth(`${BASE_URL}/quizzes/submissions/global`);
    return res.json();
}

export async function generateSubjectQuizPreview(subjectId, sessionIds) {
    const res = await fetchWithAuth(`${BASE_URL}/subjects/${subjectId}/generate-quiz-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_ids: sessionIds })
    });
    return res.json();
}

export async function saveQuiz(quizData) {
    const res = await fetchWithAuth(`${BASE_URL}/quizzes/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quizData)
    });
    return res.json();
}

export async function resetStudentSubmission(quizId, studentEmail) {
    const res = await fetchWithAuth(`${BASE_URL}/quizzes/${quizId}/submissions/${studentEmail}`, {
        method: "DELETE"
    });
    return res.json();
}

export async function deleteQuiz(quizId) {
    const res = await fetchWithAuth(`${BASE_URL}/quizzes/${quizId}`, {
        method: "DELETE"
    });
    return res.json();
}

export async function updateQuiz(quizId, quizData) {
    const res = await fetchWithAuth(`${BASE_URL}/quizzes/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quizData)
    });
    return res.json();
}

export async function getSubjectSessions(subjectId) {
    const res = await fetchWithAuth(`${BASE_URL}/sessions/by-subject/${subjectId}?limit=100`);
    return res.json();
}
