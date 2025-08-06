//——————————————————————————————————————//
// 0. CONFIGURATION
//——————————————————————————————————————//

export const BACKEND_URL = 'http://127.0.0.1:8000';

export const SUPPORTED_LANGUAGES: { [key: string]: string } = {
    'en-US': 'English',
    'es-ES': 'Español',
};

/**
 * An array of the keys from SUPPORTED_LANGUAGES for easy iteration.
 */
export const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES);