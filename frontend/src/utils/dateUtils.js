/**
 * Robustly formats a UTC date string (e.g. from MongoDB/FastAPI) into a localized date string.
 */
export function formatLocalDate(dateStr) {
    if (!dateStr) return "Recently";
    try {
        // Appending 'Z' if missing to ensure Date constructor treats it as UTC
        const normalized = (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) 
            ? `${dateStr}Z` 
            : dateStr;
        return new Date(normalized).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        console.error("Date formatting error:", e);
        return dateStr;
    }
}

/**
 * Robustly formats a UTC date string into a localized time string (HH:MM AM/PM).
 */
export function formatLocalTime(dateStr) {
    if (!dateStr) return "Recently";
    try {
        const normalized = (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) 
            ? `${dateStr}Z` 
            : dateStr;
        return new Date(normalized).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        console.error("Time formatting error:", e);
        return dateStr;
    }
}
