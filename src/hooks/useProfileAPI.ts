import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiService, Profile } from '@/lib/api';

export const useProfileAPI = () => {
  const { currentUser } = useAuth();

  // Initialize profile state with locally persisted data if available for immediate UI response
  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      const pic = localStorage.getItem('user-profile-picture');
      if (pic) {
        // Create a minimal profile object for immediate display
        return {
          id: 'local',
          user_id: 'local',
          display_name: null,
          email: '',
          profile_picture: pic,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as Profile;
      }
    } catch (e) {
      return null;
    }
    return null;
  });

  // Only start in loading state if we don't have a local profile picture
  const [loading, setLoading] = useState(!profile);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile from backend API
  const fetchProfile = async (silent = false) => {
    if (!currentUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      // Only show loading spinner if we don't have a profile yet and this isn't a silent refresh
      if (!profile && !silent) {
        setLoading(true);
      }
      setError(null);

      const response = await apiService.getProfile();

      if (response.success && response.data) {
        // Update profile state
        setProfile(response.data);

        // Persist profile picture locally for UI resilience across reloads
        try {
          if (response.data.profile_picture) {
            localStorage.setItem('user-profile-picture', response.data.profile_picture);
          } else {
            localStorage.removeItem('user-profile-picture');
          }
        } catch (e) { }
      } else {
        if (response.error?.includes('404') || response.error?.includes('not found')) {
          // Profile doesn't exist, create it
          console.log('Profile not found, creating new profile...');
          await createProfile();
        } else {
          console.error('Error fetching profile:', response.error);
          setError(response.error || 'Failed to fetch profile');
        }
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      setError(err.message || 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  // Create a new profile
  const createProfile = async () => {
    if (!currentUser) return;

    try {
      const newProfileData = {
        user_id: currentUser.uid,
        display_name: currentUser.displayName || null,
        email: currentUser.email || '',
        profile_picture: null,
      };

      const response = await apiService.createProfile(newProfileData);

      if (response.success && response.data) {
        setProfile(response.data);
        try {
          if (response.data.profile_picture) {
            localStorage.setItem('user-profile-picture', response.data.profile_picture);
          } else {
            localStorage.removeItem('user-profile-picture');
          }
        } catch (e) { }
      } else {
        setError(response.error || 'Failed to create profile');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create profile');
    }
  };

  // Update profile
  const updateProfile = async (updates: Partial<Profile>) => {
    if (!currentUser || !profile) return;

    try {
      setError(null);
      const response = await apiService.updateProfile(updates);

      if (response.success && response.data) {
        setProfile(response.data);
        try {
          if (response.data.profile_picture) {
            localStorage.setItem('user-profile-picture', response.data.profile_picture);
          } else {
            localStorage.removeItem('user-profile-picture');
          }
        } catch (e) { }
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to update profile');
      }
    } catch (err: any) {
      throw err;
    }
  };

  // Update profile picture
  const updateProfilePicture = async (profilePicture: string | null) => {
    return updateProfile({ profile_picture: profilePicture });
  };

  // Update display name
  const updateDisplayName = async (displayName: string | null) => {
    return updateProfile({ display_name: displayName });
  };

  // Delete profile
  const deleteProfile = async () => {
    if (!currentUser) return;

    try {
      setError(null);
      const response = await apiService.deleteProfile();

      if (response.success) {
        setProfile(null);
        try {
          localStorage.removeItem('user-profile-picture');
        } catch (e) { }
      } else {
        throw new Error(response.error || 'Failed to delete profile');
      }
    } catch (err: any) {
      throw err;
    }
  };

  // Fetch profile when currentUser changes OR when window is focused
  useEffect(() => {
    // Perform a sync with the backend
    fetchProfile(!!profile);

    const handleFocus = () => {
      // Always sync silently on focus
      fetchProfile(true);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentUser]);

  return {
    profile,
    loading,
    error,
    updateProfile,
    updateProfilePicture,
    updateDisplayName,
    deleteProfile,
    refetch: fetchProfile,
  };
};
