import React, { useState, useEffect } from 'react';
import { Search, Filter, ArrowUpDown, FileText, Download, Trash2, Plus, UploadCloud, Link } from 'lucide-react';
import { getSubjectMaterials, addSubjectMaterial, deleteSubjectMaterial, uploadMaterial, getSessionsBySubject, resolveUrl } from '../../services/api';
import { useNavigate } from 'react-router-dom';

export default function MaterialsTab({ subjectId, isTeacher }) {
    const [materials, setMaterials] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [fileUrl, setFileUrl] = useState("");
    const [fileTitle, setFileTitle] = useState("");
    const [fileType, setFileType] = useState("document");
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState("");
    
    // Derived UI state
    const [sortOrder, setSortOrder] = useState('desc');
    const [typeFilter, setTypeFilter] = useState('all');
    
    const navigate = useNavigate();

    useEffect(() => {
        loadMaterials();
        if (isTeacher) loadSessions();
    }, [subjectId]);

    const loadSessions = async () => {
        try {
            const data = await getSessionsBySubject(subjectId, 50, 0);
            setSessions(data || []);
        } catch (error) {
            console.error("Failed to load sessions", error);
        }
    };

    const loadMaterials = async () => {
        try {
            const data = await getSubjectMaterials(subjectId);
            setMaterials(data || []);
        } catch (error) {
            console.error("Failed to load materials", error);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const formData = new FormData();
            formData.append("file", file);
            
            // Using the base REST endpoint for upload. Adjust based on exact auth token injection.
            const token = localStorage.getItem("token");
            const res = await fetch(`http://localhost:8001/upload/material`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            
            setFileUrl(data.url);
            setFileTitle(file.name.split('.')[0]); // Default title to filename
            setFileType(data.type?.includes('pdf') ? 'pdf' : (data.type?.includes('image') ? 'image' : 'document'));
        } catch (error) {
            console.error("Upload failed", error);
            alert("File upload failed.");
        }
    };

    const handleSaveMaterial = async () => {
        if (!fileUrl) return;
        try {
            await addSubjectMaterial(subjectId, {
                title: fileTitle,
                type: fileType,
                url: fileUrl,
                linked_session_id: selectedSessionId || null
            });
            setIsUploading(false);
            setFileUrl("");
            setFileTitle("");
            loadMaterials();
        } catch (error) {
            console.error("Save material failed", error);
        }
    };

    const handleDelete = async (materialId) => {
        if (!window.confirm("Are you sure you want to delete this material?")) return;
        try {
            await deleteSubjectMaterial(materialId);
            loadMaterials();
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    const filteredMaterials = materials
        .filter(m => m.title?.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter(m => typeFilter === 'all' ? true : m.type === typeFilter)
        .sort((a, b) => {
            const d1 = new Date(a.uploaded_at).getTime();
            const d2 = new Date(b.uploaded_at).getTime();
            return sortOrder === 'desc' ? d2 - d1 : d1 - d2;
        });

    return (
        <div className="space-y-6">
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex gap-4 items-center flex-1 w-full">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-soft-400" />
                        <input 
                            type="text" 
                            placeholder="Search materials..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-soft-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                    </div>
                    
                    <select 
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value)}
                        className="border border-soft-200 rounded-xl px-4 py-2 bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    >
                        <option value="all">All Types</option>
                        <option value="document">Document</option>
                        <option value="pdf">PDF</option>
                        <option value="image">Image</option>
                    </select>

                    <button 
                        onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                        className="p-2 border border-soft-200 rounded-xl bg-white hover:bg-soft-50 text-soft-600 transition-colors"
                        title="Sort by date"
                    >
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                </div>

                {isTeacher && (
                    <button 
                        onClick={() => setIsUploading(!isUploading)}
                        className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2 rounded-xl font-bold tracking-wide shadow-sm hover:bg-primary-700 transition"
                    >
                        {isUploading ? "Cancel" : "Upload Material"}
                        <UploadCloud className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Upload Area */}
            {isTeacher && isUploading && (
                <div className="bg-primary-50 border border-primary-100 p-6 rounded-2xl flex flex-col gap-4">
                    <h3 className="font-bold text-primary-900">Upload New Material</h3>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <input 
                            type="file" 
                            onChange={handleFileUpload} 
                            className="block w-full text-sm text-soft-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                        />
                        {fileUrl && (
                            <>
                                <input 
                                    type="text" 
                                    value={fileTitle} 
                                    onChange={e => setFileTitle(e.target.value)} 
                                    placeholder="Display Title"
                                    className="border-0 bg-white rounded-xl px-4 py-2 text-sm flex-1 shadow-sm"
                                />
                                <select 
                                    value={selectedSessionId} 
                                    onChange={e => setSelectedSessionId(e.target.value)}
                                    className="border-0 bg-white rounded-xl px-4 py-2 text-sm flex-1 shadow-sm text-soft-600"
                                >
                                    <option value="">No Linked Session</option>
                                    {sessions.map(s => (
                                        <option key={s.session_id} value={s.session_id}>
                                            Session {new Date(s.started_at).toLocaleDateString()} {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </option>
                                    ))}
                                </select>
                                <button 
                                    onClick={handleSaveMaterial}
                                    className="bg-primary-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-sm flex-shrink-0"
                                >
                                    Save
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Materials List */}
            <div className="bg-white border border-soft-200 rounded-2xl overflow-hidden shadow-soft">
                <table className="w-full text-left bg-white">
                    <thead>
                        <tr className="border-b border-soft-100 text-soft-400 text-xs uppercase tracking-widest bg-soft-50/50">
                            <th className="px-6 py-4 font-bold">Material Title</th>
                            <th className="px-6 py-4 font-bold">Uploaded By</th>
                            <th className="px-6 py-4 font-bold">Date</th>
                            <th className="px-6 py-4 font-bold">Linked Session</th>
                            <th className="px-6 py-4 font-bold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-soft-50">
                        {filteredMaterials.map(m => (
                            <tr key={m.material_id} className="hover:bg-soft-50/50 transition">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-soft-900 leading-none mb-1">{m.title}</p>
                                            <p className="text-xs text-soft-400 font-medium uppercase tracking-wide">{m.type}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm font-bold text-soft-700">{m.uploaded_by}</p>
                                </td>
                                <td className="px-6 py-4 p-text-sm text-soft-500">
                                    {new Date(m.uploaded_at).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4">
                                    {m.linked_session_id ? (
                                        <button 
                                            onClick={() => navigate(isTeacher ? `/teacher/session/${m.linked_session_id}` : `/session/${m.linked_session_id}`)}
                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition"
                                        >
                                            <Link className="w-3 h-3" />
                                            {m.linked_session_id.substring(0, 8)}
                                        </button>
                                    ) : (
                                        <span className="text-sm text-soft-400 italic">None</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <a 
                                            href={resolveUrl(m.url)} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="p-2 text-soft-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition"
                                            title="View / Download"
                                        >
                                            <Download className="w-4 h-4" />
                                        </a>
                                        {isTeacher && (
                                            <button 
                                                onClick={() => handleDelete(m.material_id)} 
                                                className="p-2 text-soft-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredMaterials.length === 0 && (
                            <tr>
                                <td colSpan={5} className="py-12 text-center text-soft-500">
                                    No materials found matching your criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
