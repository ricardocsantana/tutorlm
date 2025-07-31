// src/components/toolbar/LanguageSelector.tsx

import React from 'react';
import { Globe } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SUPPORTED_LANGUAGES, LANGUAGE_CODES } from '../config';
import { ToolButton } from './ToolButton';
import { useShallow } from 'zustand/react/shallow';

interface LanguageSelectorProps {
    isMobile?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ isMobile = false }) => {
    const { recognitionLang, isUploading, actions } = useAppStore(
        useShallow(state => ({
            recognitionLang: state.recognitionLang,
            isUploading: state.isUploading,
            actions: state.actions,
        }))
    );

    const notifyBackendLanguageChange = async (lang: string) => {
        try {
            await fetch("/api/set-language", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lang }),
            });
        } catch (e) {
            // Optionally handle error (silent fail)
        }
    };

    const handleCycleLanguage = async () => {
        const currentIndex = LANGUAGE_CODES.indexOf(recognitionLang);
        const nextIndex = (currentIndex + 1) % LANGUAGE_CODES.length;
        const nextLang = LANGUAGE_CODES[nextIndex];
        actions.setRecognitionLang(nextLang);
        await notifyBackendLanguageChange(nextLang);
    };

    if (isMobile) {
        // A button that cycles through languages on mobile
        return (
            <ToolButton label="Cycle Language" icon={Globe} onClick={handleCycleLanguage} disabled={isUploading}>
                <span className="font-semibold text-sm">{SUPPORTED_LANGUAGES[recognitionLang].split(' ')[0]}</span>
            </ToolButton>
        );
    }

    // A standard dropdown select for desktop
    return (
        <div className="relative">
            <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <select
                value={recognitionLang}
                onChange={async (e) => {
                    // Pass the language key (e.g., 'en_ES') to the backend
                    actions.setRecognitionLang(e.target.value);
                    await notifyBackendLanguageChange(e.target.value);
                }}
                className="bg-gray-100 hover:bg-gray-200/80 text-gray-700 text-md font-medium rounded-lg py-2 pl-9 pr-4 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all border border-transparent cursor-pointer"
                title="Select speech recognition language"
                disabled={isUploading}
            >
                {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                    // The value is the key, which is sent to the backend
                    <option key={code} value={code}>{name}</option>
                ))}
            </select>
        </div>
    );
};