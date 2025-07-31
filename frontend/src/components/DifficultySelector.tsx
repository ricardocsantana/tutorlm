// src/components/toolbar/DifficultySelector.tsx

import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { ToolButton } from './ToolButton';
import { SlidersHorizontal } from 'lucide-react';

const DIFFICULTY_LEVELS = [
    { key: 'easy', label: 'Easy', description: '😌' },
    { key: 'medium', label: 'Medium', description: '🧐' },
    { key: 'hard', label: 'Hard', description: '🤓' },
];

interface DifficultySelectorProps {
    isMobile?: boolean;
}

export const DifficultySelector: React.FC<DifficultySelectorProps> = ({ isMobile = false }) => {
    const { difficulty, isUploading, actions } = useAppStore(useShallow(state => ({
        difficulty: state.difficulty,
        isUploading: state.isUploading,
        actions: state.actions,
    })));

    const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDifficulty = e.target.value;
        actions.setDifficulty(newDifficulty);
        try {
            await fetch('/api/set-difficulty', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ difficulty: newDifficulty }),
            });
        } catch (e) {
            // Optionally handle error
        }
    };

    const handleCycleDifficulty = async () => {
        const currentIndex = DIFFICULTY_LEVELS.findIndex(l => l.key === difficulty);
        const nextIndex = (currentIndex + 1) % DIFFICULTY_LEVELS.length;
        const nextDifficulty = DIFFICULTY_LEVELS[nextIndex].key;
        actions.setDifficulty(nextDifficulty);
        try {
            await fetch('/api/set-difficulty', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ difficulty: nextDifficulty }),
            });
        } catch (e) {
            // Optionally handle error
        }
    };

    if (isMobile) {
        // Show as a ToolButton that cycles through levels (like LanguageSelector)
        const current = DIFFICULTY_LEVELS.find(l => l.key === difficulty);
        return (
            <ToolButton
                label="Cycle Difficulty"
                icon={SlidersHorizontal}
                onClick={handleCycleDifficulty}
                disabled={isUploading}
            >
                <span className="font-semibold text-sm">{current?.label}</span>
            </ToolButton>
        );
    }

    return (
        <div className="relative">
            <select
                value={difficulty}
                onChange={handleChange}
                className="bg-gray-100 hover:bg-gray-200/80 text-gray-700 text-md font-medium rounded-lg py-2 px-4 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all border border-transparent cursor-pointer"
                title="Select explanation difficulty"
                disabled={isUploading}
            >
                {DIFFICULTY_LEVELS.map(level => (
                    <option key={level.key} value={level.key}>
                        {level.label} {level.description}
                    </option>
                ))}
            </select>
        </div>
    );
};

export { DIFFICULTY_LEVELS };
