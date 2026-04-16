import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, Plus, Trash2 } from 'lucide-react';
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from '../../services/api';

export default function AnnouncementBanner({ subjectId, isTeacher }) {
    const [announcements, setAnnouncements] = useState([]);
    const [dismissedIds, setDismissedIds] = useState(() => {
        const saved = localStorage.getItem(`dismissed_announcements_${subjectId}`);
        return saved ? JSON.parse(saved) : [];
    });
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newContent, setNewContent] = useState("");

    useEffect(() => {
        loadAnnouncements();
    }, [subjectId]);

    const loadAnnouncements = async () => {
        try {
            const data = await getAnnouncements(subjectId);
            setAnnouncements(data);
        } catch (error) {
            console.error("Failed to load announcements:", error);
        }
    };

    const handleDismiss = (id) => {
        const updated = [...dismissedIds, id];
        setDismissedIds(updated);
        localStorage.setItem(`dismissed_announcements_${subjectId}`, JSON.stringify(updated));
    };

    const handleCreate = async () => {
        if (!newTitle.trim() || !newContent.trim()) return;
        try {
            await createAnnouncement(subjectId, { title: newTitle, content: newContent });
            setNewTitle("");
            setNewContent("");
            setIsCreating(false);
            loadAnnouncements();
        } catch (error) {
            console.error("Failed to create announcement:", error);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteAnnouncement(id);
            loadAnnouncements();
        } catch (error) {
            console.error("Failed to delete announcement:", error);
        }
    };

    // Filter out dismissed announcements for students. Teachers see all to manage them, but maybe they want to dismiss too.
    // Let's hide dismissed for both, but teachers can still delete from their view if not dismissed, or maybe they shouldn't dismiss?
    // Requirements: "Students can only view and dismiss". "Teachers can create, edit, delete, and schedule" (Schedule is simplified to just create for now).
    const visibleAnnouncements = isTeacher 
        ? announcements // Teachers see all active announcements
        : announcements.filter(a => !dismissedIds.includes(a.announcement_id));

    return (
        <div className="mb-8 space-y-4">
            {isTeacher && (
                <div className="flex justify-end">
                    <button 
                        onClick={() => setIsCreating(!isCreating)}
                        className="flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-700"
                    >
                        <Plus className="w-4 h-4" />
                        {isCreating ? "Cancel Announcement" : "New Announcement"}
                    </button>
                </div>
            )}

            <AnimatePresence>
                {isCreating && isTeacher && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-primary-50 p-6 rounded-2xl border border-primary-100"
                    >
                        <h4 className="font-bold text-primary-900 mb-4">Create Announcement</h4>
                        <input 
                            type="text" 
                            placeholder="Announcement Title" 
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            className="w-full text-base border-0 bg-white rounded-xl px-4 py-3 mb-4 outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                        />
                        <textarea 
                            placeholder="Announcement Content" 
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                            rows={3}
                            className="w-full text-base border-0 bg-white rounded-xl px-4 py-3 mb-4 outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                        />
                        <div className="flex justify-end">
                            <button 
                                onClick={handleCreate}
                                className="px-6 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700"
                            >
                                Post Announcement
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {visibleAnnouncements.map((announcement) => (
                    <motion.div
                        key={announcement.announcement_id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, height: 0 }}
                        className="relative bg-amber-50 text-amber-900 p-4 rounded-2xl border border-amber-200 flex items-start gap-4 shadow-sm"
                    >
                        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="font-bold text-base mb-1">{announcement.title}</h4>
                            <p className="text-amber-800 text-sm whitespace-pre-wrap">{announcement.content}</p>
                            <p className="text-amber-600 text-xs mt-2 font-medium">
                                Posted by {announcement.author_name} • {new Date(announcement.created_at).toLocaleDateString()}
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            {isTeacher && (
                                <button 
                                    onClick={() => handleDelete(announcement.announcement_id)}
                                    className="p-2 text-amber-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                    title="Delete Announcement"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                            {(!isTeacher || dismissedIds.includes(announcement.announcement_id) === false) && (
                                <button 
                                    onClick={() => handleDismiss(announcement.announcement_id)}
                                    className="p-2 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded-xl transition-colors"
                                    title="Dismiss"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
