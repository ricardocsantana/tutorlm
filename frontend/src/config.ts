//——————————————————————————————————————//
// 0. CONFIGURATION
//——————————————————————————————————————//

//const BACKEND_URL = 'http://192.168.1.84:8000';
export const BACKEND_URL = 'http://localhost:8000';

export const SUPPORTED_LANGUAGES: { [key: string]: string } = {
    'en-US': 'English',
    'es-ES': 'Español',
    'fr-FR': 'Français',
    'de-DE': 'Deutsch',
    'pt-PT': 'Português',
    'it-IT': 'Italiano',
};

/**
 * An array of the keys from SUPPORTED_LANGUAGES for easy iteration.
 */
export const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES);