//——————————————————————————————————————//
// 0. CONFIGURATION
//——————————————————————————————————————//

export const BACKEND_URL = 'https://ricardocsantana99.pythonanywhere.com';

export const SUPPORTED_LANGUAGES: { [key: string]: string } = {
    'en-US': 'English',
    'es-ES': 'Español',
};

/**
 * An array of the keys from SUPPORTED_LANGUAGES for easy iteration.
 */
export const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES);