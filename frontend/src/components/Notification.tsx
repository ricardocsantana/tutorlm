// src/components/layout/Notification.tsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, Loader } from 'lucide-react';
import type { NotificationType } from '../store/useAppStore';

interface NotificationProps {
    notification: { id: number; message: string; type: NotificationType } | null;
}

export const Notification: React.FC<NotificationProps> = ({ notification }) => {
    const getBgColor = (type: NotificationType) => {
        switch (type) {
            case 'success': return 'bg-green-500';
            case 'error': return 'bg-red-500';
            case 'info': return 'bg-blue-500';
            default: return 'bg-gray-800';
        }
    };

    return (
        <AnimatePresence>
            {notification && (
                <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className={`fixed top-20 md:top-24 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-white ${getBgColor(notification.type)}`}
                >
                    {notification.type === 'success' && <CheckCircle size={20} />}
                    {notification.type === 'error' && <AlertTriangle size={20} />}
                    {notification.type === 'info' && (
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        >
                            <Loader size={20} />
                        </motion.div>
                    )}
                    <span className="font-medium text-sm">{notification.message}</span>
                </motion.div>
            )}
        </AnimatePresence>
    );
};