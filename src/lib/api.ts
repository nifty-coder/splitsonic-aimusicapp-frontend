import { getAuth } from 'firebase/auth';

// Backend API configuration
// In production, set VITE_API_BASE_URL to your deployed backend URL
// For Firebase Hosting, you need to set this during build time (see README)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * @interface Profile - Defines the structure of a user's profile.
 */
export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string;
  profile_picture: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * @interface ApiResponse<T> - Standard response format for API calls.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * @class ApiService - Handles all API interactions with the backend.
 * All methods automatically include the Firebase ID token in the authorization header.
 */
class ApiService {
  /**
   * Fetches the current user's Firebase ID token.
   * Throws an error if no user is authenticated.
   * @returns {Promise<string>} The Firebase ID token.
   */
  private async getAuthToken(): Promise<string> {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      // It's critical that the calling code ensures a user is logged in before this is called.
      throw new Error('No authenticated user found. Cannot get Firebase token.');
    }
    
    // Force a token refresh to ensure it's not expired.
    return await user.getIdToken(/* forceRefresh */ true);
  }

  /**
   * A private, generic method to handle all API requests.
   * It centralizes logic for authentication, headers, and error handling.
   * @param {string} endpoint - The API endpoint to call.
   * @param {RequestInit} [options={}] - Standard fetch options.
   * @returns {Promise<ApiResponse<T>>} The standardized API response.
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const token = await this.getAuthToken();

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      } as Record<string, string>;

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { success: false, message: text || `HTTP Error: ${response.status}` };
      }

      if (!response.ok) {
        // Extract error detail from response
        const errorDetail = data.detail || data.message || data.error || text;
        console.error('API request failed:', response.status, errorDetail);
        
        // Provide helpful error messages for common issues
        let errorMessage = errorDetail;
        if (response.status === 401) {
          if (errorDetail?.includes('Firebase verification unavailable')) {
            errorMessage = `Backend Configuration Error: ${errorDetail}\n\nTo fix this, configure Firebase Admin SDK in your backend server:\n1. Install firebase-admin: pip install firebase-admin\n2. Download service account key from Firebase Console\n3. Set GOOGLE_APPLICATION_CREDENTIALS environment variable\n4. Initialize Firebase Admin in your backend code`;
          } else {
            errorMessage = `Authentication failed: ${errorDetail}`;
          }
        } else if (response.status === 500) {
          errorMessage = `Server error: ${errorDetail || 'Internal server error. Check backend logs.'}`;
        } else if (response.status === 404) {
          errorMessage = `Endpoint not found: ${endpoint}`;
        }
        
        return {
          success: false,
          error: errorMessage,
        };
      }

      return { success: true, data: data };
    } catch (error: any) {
      console.error('API request failed:', error.message);
      
      // Handle CORS and network errors
      let errorMessage = error.message || 'Request failed';
      if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch')) {
        const isProduction = window.location.protocol === 'https:';
        const currentUrl = API_BASE_URL;
        
        if (currentUrl.includes('localhost') && isProduction) {
          errorMessage = `Backend API not configured for production.\n\nYour app is trying to connect to ${currentUrl}, but the backend is not available in production.\n\nTo fix this:\n1. Deploy your backend server\n2. Set VITE_API_BASE_URL environment variable to your production backend URL\n3. Rebuild and redeploy your frontend`;
        } else {
          errorMessage = `Cannot connect to backend server at ${currentUrl}.\n\nPossible issues:\n- Backend server is not running\n- CORS is not configured on the backend\n- Network connectivity issue\n\nCheck your backend server logs and ensure CORS is enabled for your frontend origin.`;
        }
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // 👇️ PUBLIC API METHODS 👇️

  /**
   * Fetches the profile of the currently authenticated user.
   * @returns {Promise<ApiResponse<Profile>>}
   */
  async getProfile(): Promise<ApiResponse<Profile>> {
    return this.makeRequest<Profile>('/api/profile');
  }

  /**
   * Creates a new user profile.
   * @param {Partial<Profile>} profileData - The profile data to send to the backend.
   * @returns {Promise<ApiResponse<Profile>>}
   */
  async createProfile(profileData: Partial<Profile>): Promise<ApiResponse<Profile>> {
    return this.makeRequest<Profile>('/api/profile', {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
  }

  /**
   * Updates an existing user profile.
   * @param {Partial<Profile>} updates - The profile fields to update.
   * @returns {Promise<ApiResponse<Profile>>}
   */
  async updateProfile(updates: Partial<Profile>): Promise<ApiResponse<Profile>> {
    return this.makeRequest<Profile>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Deletes the profile of the currently authenticated user.
   * @returns {Promise<ApiResponse<void>>}
   */
  async deleteProfile(): Promise<ApiResponse<void>> {
    return this.makeRequest<void>('/api/profile', {
      method: 'DELETE',
    });
  }
}

export const apiService = new ApiService();