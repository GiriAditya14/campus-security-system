import React, { useState, useEffect } from 'react';
import { UserIcon } from '@heroicons/react/24/outline';
import { getToken } from '../../services/api';

const ProfilePhoto = ({ 
  entityId, 
  faceId, 
  userId,
  size = 'md', 
  className = '', 
  fallbackIcon = UserIcon,
  alt = 'Profile Photo',
  showFallbackIcon = true 
}) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Size mappings
  const sizeClasses = {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8', 
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
    '2xl': 'h-20 w-20',
    '3xl': 'h-24 w-24'
  };

  const iconSizeClasses = {
    xs: 'h-4 w-4',
    sm: 'h-5 w-5',
    md: 'h-6 w-6', 
    lg: 'h-7 w-7',
    xl: 'h-9 w-9',
    '2xl': 'h-11 w-11',
    '3xl': 'h-13 w-13'
  };

  useEffect(() => {
    let mounted = true;

    const loadProfilePhoto = async () => {
      try {
        setLoading(true);
        setImageError(false);

        if (!entityId && !faceId && !userId) {
          setImageError(true);
          setLoading(false);
          return;
        }

        const token = getToken();
        if (!token) {
          setImageError(true);
          setLoading(false);
          return;
        }

        // Determine the endpoint based on available parameters
        let endpoint;
        if (faceId) {
          endpoint = `/photos/profile/${faceId}`;
        } else if (entityId) {
          endpoint = `/photos/entity/${entityId}`;
        } else if (userId) {
          endpoint = `/photos/user/${userId}`;
        } else {
          throw new Error('Either entityId, faceId, or userId must be provided');
        }

        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}${endpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'image/jpeg,image/png,image/gif,image/webp,*/*'
          }
        });

        if (!mounted) return;

        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
          setImageError(false);
        } else {
          // If 404, try fallback avatar endpoint
          if (response.status === 404) {
            const fallbackResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/photos/fallback`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'image/svg+xml,*/*'
              }
            });

            if (fallbackResponse.ok && mounted) {
              const fallbackBlob = await fallbackResponse.blob();
              const fallbackObjectUrl = URL.createObjectURL(fallbackBlob);
              setImageUrl(fallbackObjectUrl);
              setImageError(false);
            } else {
              setImageError(true);
            }
          } else {
            setImageError(true);
          }
        }
      } catch (error) {
        console.error('Error loading profile photo:', error);
        if (mounted) {
          setImageError(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadProfilePhoto();

    return () => {
      mounted = false;
      // Clean up object URL to prevent memory leaks
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [entityId, faceId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const FallbackIcon = fallbackIcon;

  if (loading) {
    return (
      <div className={`${sizeClasses[size]} ${className} bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center animate-pulse`}>
        <div className={`${iconSizeClasses[size]} bg-gray-300 dark:bg-gray-600 rounded-full`}></div>
      </div>
    );
  }

  if (imageError || !imageUrl) {
    if (!showFallbackIcon) {
      return null;
    }

    return (
      <div className={`${sizeClasses[size]} ${className} bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center`}>
        <FallbackIcon className={`${iconSizeClasses[size]} text-gray-500 dark:text-gray-400`} />
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} ${className} rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0`}>
      <img
        src={imageUrl}
        alt={alt}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
        loading="lazy"
      />
    </div>
  );
};

export default ProfilePhoto;