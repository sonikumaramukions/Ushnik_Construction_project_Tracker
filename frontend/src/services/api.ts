// ================================================================
// API CLIENT (services/api.ts)
// ================================================================
// PURPOSE: The BRIDGE between frontend and backend.
//
// Every API call in the app goes through this file.
// It creates an Axios HTTP client with:
//   - Base URL: http://localhost:5001/api (the backend server)
//   - Timeout: 30 seconds
//   - Auto-attaches JWT token to every request (Authorization header)
//   - Auto-retries on 503 (server busy) and network errors
//   - Auto-handles 401 (token expired → redirects to login)
//
// USAGE:
//   import api, { apiClient } from './api';
//   const response = await api.get('/sheets');
//   const data = await apiClient.get('/users');
//
// USED BY: All service files (authService, sheetsAPI, projectsAPI, etc.)
// ================================================================

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';  // Axios = HTTP library for API calls
import toast from 'react-hot-toast';  // Shows popup messages (success/error)

// ─── CREATE THE API CLIENT ───
// This is the main HTTP client. Every API call goes through this.
// It's pre-configured with the backend URL and a 30-second timeout.
const api: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001/api',  // Backend server URL
  timeout: 30000,  // 30 seconds — gives the server plenty of time to respond
  headers: {
    'Content-Type': 'application/json',  // Tell server we're sending JSON data
  },
});

// ─── RETRY SETTINGS ───
// The backend uses SQLite which can return 503 when busy.
// We retry up to 3 times with exponential backoff to ride out transient issues.
const MAX_RETRIES = 3;     // Try up to 3 extra times (was 2)
const RETRY_DELAY = 500;   // Start with 500ms delay (was 1000ms flat)

// Helper: pause for a given number of milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: should we retry this failed request?
// YES if: network error, connection timeout, server busy (503), or DB error (502)
// NOTE: Do NOT retry 429 (rate limited) — retrying rate-limited requests creates
// an exponential cascade that makes the problem worse and locks out everything.
const shouldRetry = (error: any): boolean => {
  if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR') return true;
  if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') return true;
  if (error.response?.status === 503 || error.response?.status === 502) return true;
  // Retry on 408 (request timeout from our own backend middleware)
  if (error.response?.status === 408) return true;
  return false;
};

// ─── REQUEST INTERCEPTOR ───
// This runs BEFORE every API call. It automatically attaches the JWT token
// so the backend knows WHO is making the request.
// Without this, you'd have to manually add the token to every single API call.
api.interceptors.request.use(
  (config) => {
    // Get the saved login token from browser storage
    const token = localStorage.getItem('token');
    if (token) {
      // Add "Authorization: Bearer <token>" header to the request
      // The backend reads this header to identify the user
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Track how many times this request has been retried
    if ((config as any).__retryCount === undefined) {
      (config as any).__retryCount = 0;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track when we last showed a 401 toast to prevent spamming the user
let last401Toast = 0;
let lastServerErrorToast = 0;  // Throttle server error toasts too

// ─── RESPONSE INTERCEPTOR ───
// This runs AFTER every API response. It handles common errors so you don't
// have to write error handling in every single component.
api.interceptors.response.use(
  // SUCCESS: just pass the response through
  (response: AxiosResponse) => {
    return response;
  },
  // ERROR: handle different error types
  async (error) => {
    const config = error.config;

    // ─── RETRY LOGIC ───
    // If the error is a temporary network/DB issue, retry with exponential backoff
    if (config && shouldRetry(error) && (config as any).__retryCount < MAX_RETRIES) {
      (config as any).__retryCount += 1;
      // Exponential backoff with jitter: 500ms, 1000ms, 2000ms + random
      const backoff = RETRY_DELAY * Math.pow(2, (config as any).__retryCount - 1);
      const jitter = Math.random() * 200;
      await sleep(backoff + jitter);
      return api(config);  // Retry the same request
    }

    // ─── 401 UNAUTHORIZED ───
    // Token expired or invalid. But ONLY clear token if the 401 came from
    // an actual auth endpoint (/auth/me, /auth/login) — not from a transient DB error
    // on a data endpoint. This prevents the "logout loop" bug where a temporary
    // database hiccup on any endpoint would kill the user's session.
    if (error.response?.status === 401) {
      const requestUrl = config?.url || '';
      const isAuthEndpoint = requestUrl.includes('/auth/');
      
      const now = Date.now();
      if (now - last401Toast > 5000) {
        last401Toast = now;
        
        if (isAuthEndpoint) {
          // Auth endpoint 401 = token is truly invalid/expired → clear and redirect
          localStorage.removeItem('token');
          toast.error('Session expired. Please login again.');
          setTimeout(() => { window.location.href = '/login'; }, 500);
        } else {
          // Non-auth endpoint 401 = might be a transient DB error
          // Show a warning but DON'T kill the token — let the user retry
          toast.error('Authentication error. Try refreshing the page.');
        }
      }
    // ─── 429 RATE LIMITED ───
    // Too many requests — show a message but DON'T retry (would make it worse)
    } else if (error.response?.status === 429) {
      const now = Date.now();
      if (now - lastServerErrorToast > 10000) {
        lastServerErrorToast = now;
        toast.error('Too many requests. Please wait a moment and try again.', { duration: 6000 });
      }
    // ─── 403 FORBIDDEN ───
    // User is logged in but doesn't have permission for this action
    } else if (error.response?.status === 403) {
      toast.error('You do not have permission to perform this action.');
    // ─── 500+ SERVER ERROR ───
    // Something went wrong on the backend (throttle to prevent toast spam)
    } else if (error.response?.status >= 500) {
      const now = Date.now();
      if (now - lastServerErrorToast > 3000) {
        lastServerErrorToast = now;
        toast.error('Server error. Please try again later.');
      }
    // ─── NETWORK ERROR ───
    // Can't reach the server at all (server down or no internet)
    } else if (error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR') {
      const now = Date.now();
      if (now - lastServerErrorToast > 5000) {
        lastServerErrorToast = now;
        toast.error('Network error. Please check your connection.');
      }
    // ─── TIMEOUT ───
    // Server didn't respond within 30 seconds
    } else if (error.code === 'ECONNABORTED') {
      toast.error('Request timed out. Please try again.');
    }
    
    return Promise.reject(error);
  }
);

// ─── EXPORTED API METHODS ───
// Other files use these to make API calls.
// Example: apiClient.get('/sheets') → GET http://localhost:5001/api/sheets
// Example: apiClient.post('/auth/login', { email, password }) → POST with body
export const apiClient = {
  get: <T = any>(url: string, config?: AxiosRequestConfig) => 
    api.get<T>(url, config),             // GET = fetch/read data
  
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
    api.post<T>(url, data, config),       // POST = create new data
  
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
    api.put<T>(url, data, config),        // PUT = update/replace data
  
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
    api.patch<T>(url, data, config),      // PATCH = partial update
  
  delete: <T = any>(url: string, config?: AxiosRequestConfig) => 
    api.delete<T>(url, config),           // DELETE = remove data
};

// ─── KEEP-ALIVE HEALTH PING ───
// Periodically ping the backend health endpoint to:
//   1. Keep the browser→server connection warm
//   2. Detect server disconnects early (before user notices)
//   3. Trigger backend DB pool keepalive indirectly
// Runs every 60 seconds. Silent — no toasts or errors shown.
let healthPingInterval: ReturnType<typeof setInterval> | null = null;

const startHealthPing = () => {
  if (healthPingInterval) return; // Already running
  healthPingInterval = setInterval(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return; // Not logged in, skip
      await api.get('/health', { timeout: 5000 }); // Quick 5s timeout
    } catch {
      // Silent failure — don't bother the user
    }
  }, 60000); // Every 60 seconds
};

// Auto-start when module loads (only in browser)
if (typeof window !== 'undefined') {
  startHealthPing();
}

// ─── FILE UPLOAD HELPER ───
// Used when uploading files (like Excel imports or photos)
// Converts the file to FormData format which browsers need for file uploads
export const uploadFile = async (
  url: string,
  file: File,
  onUploadProgress?: (progress: number) => void  // Optional callback for progress bar
): Promise<AxiosResponse> => {
  const formData = new FormData();
  formData.append('file', file);   // Add the file to the form data

  return api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',  // Tell server this is a file upload
    },
    onUploadProgress: (progressEvent) => {
      // Calculate upload percentage (0-100) and report it
      if (onUploadProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onUploadProgress(progress);
      }
    },
  });
};

// ─── FILE DOWNLOAD HELPER ───
// Used when downloading files (like Excel exports or reports)
// Creates a temporary download link and clicks it to trigger the download
export const downloadFile = async (url: string, filename?: string): Promise<void> => {
  try {
    // Get the file from the server as a binary blob
    const response = await api.get(url, {
      responseType: 'blob',  // Tell axios to expect binary data, not JSON
    });

    // Create a temporary URL for the blob data
    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    
    // Create a hidden <a> link, set the download filename, and click it
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename || 'download';  // Default filename if none given
    document.body.appendChild(link);
    link.click();                            // Trigger the download
    document.body.removeChild(link);         // Clean up the hidden link
    window.URL.revokeObjectURL(downloadUrl); // Free the memory
  } catch (error) {
    toast.error('Failed to download file');
    throw error;
  }
};

export default api;