/**
 * Address of the Faisal Show server (the code in /server).
 *
 * Must be HTTPS — Android blocks plain http:// in release builds.
 * Change it here when the server is online, e.g. 'https://api.fainet.org'.
 * It can also be set at build time with the EXPO_PUBLIC_API_URL variable.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.fainet.org').replace(/\/$/, '');
