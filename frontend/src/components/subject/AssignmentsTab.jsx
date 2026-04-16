import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Clock, Upload, Users, ListChecks, Award } from 'lucide-react';
import { getAssignments, createAssignment, deleteAssignment, submitAssignment, getAssignmentSubmissions, gradeSubmission } from '../../services/api';

export default function AssignmentsTab({ subjectId, isTeacher }) {
    const [assignments, setAssignments] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    
    // New Assignment Form State
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [dueDate, setDueDate] = useState("");

    // Student Submitting State
    const [submittingId, setSubmittingId] = useState(null);
    const [submissionUrl, setSubmissionUrl] = useState("");

    // Teacher Grading State
    const [viewingSubmissionsId, setViewingSubmissionsId] = useState(null);
    const [submissions, setSubmissions] = useState([]);
    const [gradeInput, setGradeInput] = useState({}); // { submissionId: gradeValue }

    useEffect(() => {
        loadAssignments();
    }, [subjectId]);

    const loadAssignments = async () => {
        try {
            const data = await getAssignments(subjectId);
            setAssignments(data || []);
        } catch (error) {
            console.error("Failed to load assignments", error);
        }
    };

    const handleCreate = async () => {
        if (!title.trim() || !dueDate) return;
        try {
            await createAssignment(subjectId, { title, description: desc, due_date: new Date(dueDate).toISOString() });
            setTitle("");
            setDesc("");
            setDueDate("");
            setIsCreating(false);
            loadAssignments();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this assignment?")) return;
        try {
            await deleteAssignment(id);
            if (viewingSubmissionsId === id) setViewingSubmissionsId(null);
            loadAssignments();
        } catch (error) {
            console.error(error);
        }
    };

    const handleSubmit = async (id) => {
        if (!submissionUrl.trim()) return;
        try {
            await submitAssignment(id, { url: submissionUrl });
            setSubmittingId(null);
            setSubmissionUrl("");
            loadAssignments();
        } catch (error) {
            console.error(error);
        }
    };

    const loadSubmissions = async (assignmentId) => {
        if (viewingSubmissionsId === assignmentId) {
            setViewingSubmissionsId(null); // toggle off
            return;
        }
        try {
            const data = await getAssignmentSubmissions(assignmentId);
            setSubmissions(data || []);
            setViewingSubmissionsId(assignmentId);
        } catch (error) {
            console.error(error);
        }
    };

    const handleGrade = async (submissionId) => {
        const grade = gradeInput[submissionId];
        if (!grade) return;
        try {
            await gradeSubmission(submissionId, { grade });
            // Refresh submissions
            const data = await getAssignmentSubmissions(viewingSubmissionsId);
            setSubmissions(data || []);
            loadAssignments(); // update stats
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6">
            {isTeacher && (
                <div className="flex justify-end">
                    <button 
                        onClick={() => setIsCreating(!isCreating)}
                        className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-primary-700 transition shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        {isCreating ? "Cancel" : "Create Assignment"}
                    </button>
                </div>
            )}

            {isTeacher && isCreating && (
                <div className="bg-primary-50 border border-primary-100 p-6 rounded-2xl flex flex-col gap-4">
                    <h3 className="font-bold text-primary-900">New Assignment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input 
                            type="text" 
                            placeholder="Assignment Title" 
                            value={title} 
                            onChange={e => setTitle(e.target.value)} 
                            className="bg-white border-0 px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                        />
                        <input 
                            type="datetime-local" 
                            value={dueDate} 
                            onChange={e => setDueDate(e.target.value)} 
                            className="bg-white border-0 px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                        />
                        <textarea 
                            placeholder="Description / Instructions" 
                            value={desc} 
                            onChange={e => setDesc(e.target.value)} 
                            className="bg-white border-0 px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 shadow-sm md:col-span-2"
                            rows={3}
                        />
                    </div>
                    <div className="flex justify-end">
                        <button 
                            onClick={handleCreate}
                            className="bg-primary-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-primary-700 shadow-sm"
                        >
                            Publish Assignment
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white border border-soft-200 rounded-2xl overflow-hidden shadow-soft">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-soft-100 text-soft-400 text-xs uppercase tracking-widest bg-soft-50/50">
                            <th className="px-6 py-4 font-bold">Assignment</th>
                            <th className="px-6 py-4 font-bold">Due Date</th>
                            {isTeacher ? (
                                <>
                                    <th className="px-6 py-4 font-bold text-center">Enrolled</th>
                                    <th className="px-6 py-4 font-bold text-center">Submitted</th>
                                    <th className="px-6 py-4 font-bold text-center">Pending</th>
                                </>
                            ) : (
                                <>
                                    <th className="px-6 py-4 font-bold">Status</th>
                                    <th className="px-6 py-4 font-bold">Grade</th>
                                </>
                            )}
                            <th className="px-6 py-4 font-bold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-soft-50">
                        {assignments.map(a => (
                            <React.Fragment key={a.assignment_id}>
                                <tr className="hover:bg-soft-50/50 transition group">
                                    <td className="px-6 py-5 w-1/3">
                                        <h4 className="font-bold text-soft-900">{a.title}</h4>
                                        {a.description && <p className="text-xs text-soft-500 mt-1 line-clamp-1">{a.description}</p>}
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-1.5 text-soft-600 text-sm">
                                            <Clock className="w-4 h-4 text-soft-400" />
                                            {new Date(a.due_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                        </div>
                                    </td>

                                    {isTeacher ? (
                                        <>
                                            <td className="px-6 py-5 text-center font-bold text-soft-700">{a.stats?.total_students || 0}</td>
                                            <td className="px-6 py-5 text-center font-bold text-green-600 bg-green-50/50">{a.stats?.submitted_count || 0}</td>
                                            <td className="px-6 py-5 text-center font-bold text-amber-600 bg-amber-50/50">{a.stats?.pending_count || 0}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-6 py-5">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider
                                                    ${a.submission?.status === 'Submitted' ? 'bg-green-100 text-green-700' : 
                                                      a.submission?.status === 'Graded' ? 'bg-indigo-100 text-indigo-700' :
                                                      a.submission?.status === 'Late' ? 'bg-red-100 text-red-700' :
                                                      'bg-soft-100 text-soft-500'}`}
                                                >
                                                    {a.submission?.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 font-bold text-soft-700">
                                                {a.submission?.grade || '-'}
                                            </td>
                                        </>
                                    )}

                                    <td className="px-6 py-5 text-right">
                                        {isTeacher ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => loadSubmissions(a.assignment_id)}
                                                    className={`px-4 py-2 text-sm font-bold rounded-xl transition ${
                                                        viewingSubmissionsId === a.assignment_id 
                                                            ? 'bg-primary-100 text-primary-700' 
                                                            : 'text-primary-600 hover:bg-primary-50 border border-primary-200'
                                                    }`}
                                                >
                                                    View Submissions
                                                </button>
                                                <button onClick={() => handleDelete(a.assignment_id)} className="p-2 text-soft-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            // Student Action
                                            <button 
                                                onClick={() => submittingId === a.assignment_id ? setSubmittingId(null) : setSubmittingId(a.assignment_id)}
                                                disabled={a.submission?.status === 'Graded'}
                                                className={`px-4 py-2 text-sm font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                                    a.submission?.status === 'Submitted' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-primary-600 text-white hover:bg-primary-700'
                                                }`}
                                            >
                                                {a.submission?.status === 'Submitted' ? 'Resubmit' : a.submission?.status === 'Graded' ? 'Graded' : 'Submit'}
                                            </button>
                                        )}
                                    </td>
                                </tr>

                                {/* Submission Expansion */}
                                {submittingId === a.assignment_id && !isTeacher && (
                                    <tr>
                                        <td colSpan={5} className="bg-primary-50/50 p-6 border-b border-soft-100">
                                            <div className="flex gap-4 max-w-2xl mx-auto">
                                                <input 
                                                    type="url" 
                                                    placeholder="Paste submission link (Drive, Github, etc.)"
                                                    value={submissionUrl}
                                                    onChange={e => setSubmissionUrl(e.target.value)}
                                                    className="flex-1 bg-white border border-soft-200 px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                                />
                                                <button onClick={() => handleSubmit(a.assignment_id)} className="bg-primary-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-primary-700">
                                                    Confirm
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}

                                {/* Teacher Submissions View */}
                                {viewingSubmissionsId === a.assignment_id && isTeacher && (
                                    <tr>
                                        <td colSpan={6} className="bg-soft-50 p-6 border-b border-soft-200">
                                            <div className="bg-white rounded-xl border border-soft-200 shadow-sm overflow-hidden">
                                                <div className="px-6 py-3 border-b border-soft-100 bg-soft-50/50 flex items-center justify-between">
                                                    <h5 className="font-bold text-soft-700 text-sm">Student Submissions</h5>
                                                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold uppercase">{submissions.length} Total</span>
                                                </div>
                                                {submissions.length === 0 ? (
                                                    <div className="p-8 text-center text-soft-500 text-sm">No submissions received yet.</div>
                                                ) : (
                                                    <table className="w-full text-left text-sm">
                                                        <tbody className="divide-y divide-soft-100">
                                                            {submissions.map(s => (
                                                                <tr key={s.submission_id}>
                                                                    <td className="px-6 py-4 font-medium text-soft-900">{s.student_name || s.student_email}</td>
                                                                    <td className="px-6 py-4">
                                                                        <a href={s.content_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">View Work</a>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-soft-500 text-xs">
                                                                        {new Date(s.submitted_at).toLocaleString()}
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-2">
                                                                            <input 
                                                                                type="text" 
                                                                                placeholder="Grade e.g. 95/100" 
                                                                                defaultValue={s.grade || ""}
                                                                                onChange={e => setGradeInput({...gradeInput, [s.submission_id]: e.target.value})}
                                                                                className="w-32 border border-soft-200 px-3 py-1.5 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-xs"
                                                                            />
                                                                            <button 
                                                                                onClick={() => handleGrade(s.submission_id)}
                                                                                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700"
                                                                            >
                                                                                Save
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                        {assignments.length === 0 && (
                            <tr>
                                <td colSpan={isTeacher ? 6 : 5} className="py-12 text-center text-soft-500">
                                    No assignments found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
