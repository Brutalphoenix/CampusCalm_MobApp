import { Preferences } from '@capacitor/preferences';

const ERROR_LOG_KEY = 'error_logs';
const MAX_LOGS = 50;

export interface ErrorLog {
  message: string;
  stack?: string;
  timestamp: string;
  type: 'CRASH' | 'UNHANDLED_REJECTION' | 'CUSTOM';
}

/**
 * Enterprise-grade internal logger that persists to local storage.
 */
export const logErrorToStorage = async (error: any, type: ErrorLog['type'] = 'CUSTOM') => {
  try {
    const { value } = await Preferences.get({ key: ERROR_LOG_KEY });
    let logs: ErrorLog[] = [];
    
    if (value) {
      try {
        logs = JSON.parse(value);
      } catch (e) {
        logs = [];
      }
    }

    const newLog: ErrorLog = {
      message: error?.message || String(error),
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      type
    };

    logs.unshift(newLog); // Newest first
    if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);

    await Preferences.set({
      key: ERROR_LOG_KEY,
      value: JSON.stringify(logs)
    });
    
    console.error(`[FatalLogger] Captured ${type}:`, newLog.message);
  } catch (e) {
    // Fail silently to never crash the app during logging
    console.error('[FatalLogger] Logging itself failed:', e);
  }
};

export const getStoredErrors = async (): Promise<ErrorLog[]> => {
  const { value } = await Preferences.get({ key: ERROR_LOG_KEY });
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch (e) {
    return [];
  }
};

export const clearStoredErrors = async () => {
  await Preferences.remove({ key: ERROR_LOG_KEY });
};

export const getFormattedErrors = async (): Promise<string> => {
  const logs = await getStoredErrors();
  return JSON.stringify(logs, null, 2);
};
