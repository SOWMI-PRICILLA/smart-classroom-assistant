import React from 'react';
import { motion } from 'framer-motion';

export default function SubjectTabs({ activeTab, setActiveTab }) {
    const tabs = ["Sessions", "Materials", "Assignments"];

    return (
        <div className="flex items-center gap-8 border-b border-soft-200 mb-8 px-2 overflow-x-auto">
            {tabs.map((tab) => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative py-4 px-1 text-sm font-bold uppercase tracking-widest soft-transition ${
                        activeTab === tab 
                            ? "text-primary-600" 
                            : "text-soft-400 hover:text-soft-600"
                    }`}
                >
                    {tab}
                    {activeTab === tab && (
                        <motion.div
                            layoutId="activeSubjectTab"
                            className="absolute bottom-0 left-0 right-0 h-1 bg-primary-600 rounded-t-full"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                    )}
                </button>
            ))}
        </div>
    );
}
