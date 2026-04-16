import SubjectsPage from "./pages/SubjectsPage";
import SubjectDetailPage from "./pages/SubjectDetailPage";
import SessionViewPage from "./pages/SessionViewPage";
import RecentSessionsPage from "./pages/RecentSessionsPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import AssessmentsPage from "./pages/AssessmentsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { Navigate, Routes, Route } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import TeacherDashboardLayout from "./layouts/TeacherDashboardLayout";
import TeacherSubjectsPage from "./pages/teacher/TeacherSubjectsPage";
import TeacherSubjectDetailPage from "./pages/teacher/TeacherSubjectDetailPage";
import TeacherRecentSessionsPage from "./pages/teacher/TeacherRecentSessionsPage";
import TeacherSessionViewPage from "./pages/teacher/TeacherSessionViewPage";
import TimetablePage from "./pages/TimetablePage";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SearchProvider } from "./contexts/SearchContext";
import { SubjectsProvider } from "./contexts/SubjectsContext";
import ErrorBoundary from "./components/ErrorBoundary";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-soft-50 font-sans">
        <div className="w-16 h-16 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin"></div>
        <p className="mt-6 text-soft-500 font-bold uppercase tracking-[0.2em] text-[10px]">Synchronizing Access...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AuthenticatedApp() {
  const { user } = useAuth();

  if (user?.role === "teacher") {
    return (
      <TeacherDashboardLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/teacher/subjects" replace />} />
          <Route path="/teacher" element={<Navigate to="/teacher/subjects" replace />} />
          <Route path="/teacher/subjects" element={<TeacherSubjectsPage />} />
          <Route path="/teacher/sessions" element={<TeacherRecentSessionsPage />} />
          <Route path="/teacher/subject/:id" element={<TeacherSubjectDetailPage />} />
          <Route path="/teacher/session/:id" element={<TeacherSessionViewPage />} />
          <Route path="/teacher/assessments" element={<AssessmentsPage />} />
          <Route path="/teacher/timetable" element={<TimetablePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/teacher/subjects" replace />} />
        </Routes>
      </TeacherDashboardLayout>
    );
  }

  // Student Dashboard (Untouched logic, just wrapped in AuthenticatedApp)
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/subjects" replace />} />
        <Route path="/subjects" element={<SubjectsPage />} />
        <Route path="/sessions" element={<RecentSessionsPage />} />
        <Route path="/timetable" element={<TimetablePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/subject/:id" element={<SubjectDetailPage />} />
        <Route path="/session/:id" element={<SessionViewPage />} />
        <Route path="/assessments" element={<AssessmentsPage />} />
        <Route path="*" element={<Navigate to="/subjects" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SubjectsProvider>
          <SearchProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AuthenticatedApp />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </SearchProvider>
        </SubjectsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

