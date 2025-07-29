import React from "react";
import { motion } from "framer-motion";

export const ToolButton: React.FC<{
    icon: React.ElementType;
    label: string;
    active?: boolean;
    onClick: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
}> = React.memo(
    ({
        icon: Icon,
        label,
        active,
        onClick,
        disabled,
        children
    }) => (
        <motion.button
            onClick={onClick}
            title={label}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={disabled}
            className={`relative p-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2
                ${active
                    ? 'bg-gradient-to-br from-blue-500 to-blue-400 text-white shadow-lg shadow-blue-500/25'
                    : 'bg-white/90 text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-md border border-gray-200/50'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
        >
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            {children}
        </motion.button>
    )
);