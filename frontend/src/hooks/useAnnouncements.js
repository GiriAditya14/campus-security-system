import { useRef, useCallback } from 'react';

const useAnnouncements = () => {
  const politeRegionRef = useRef(null);
  const assertiveRegionRef = useRef(null);

  // Create live regions if they don't exist
  const ensureLiveRegions = useCallback(() => {
    if (!politeRegionRef.current) {
      politeRegionRef.current = document.createElement('div');
      politeRegionRef.current.setAttribute('aria-live', 'polite');
      politeRegionRef.current.setAttribute('aria-atomic', 'true');
      politeRegionRef.current.className = 'sr-only';
      politeRegionRef.current.id = 'polite-announcements';
      document.body.appendChild(politeRegionRef.current);
    }

    if (!assertiveRegionRef.current) {
      assertiveRegionRef.current = document.createElement('div');
      assertiveRegionRef.current.setAttribute('aria-live', 'assertive');
      assertiveRegionRef.current.setAttribute('aria-atomic', 'true');
      assertiveRegionRef.current.className = 'sr-only';
      assertiveRegionRef.current.id = 'assertive-announcements';
      document.body.appendChild(assertiveRegionRef.current);
    }
  }, []);

  const announce = useCallback((message, priority = 'polite', delay = 100) => {
    // Check if announcements are enabled
    const announcementsEnabled = localStorage.getItem('announcements') !== 'false';
    if (!announcementsEnabled) return;

    ensureLiveRegions();

    const region = priority === 'assertive' ? assertiveRegionRef.current : politeRegionRef.current;
    
    if (region) {
      // Clear the region first
      region.textContent = '';
      
      // Add the message after a short delay to ensure screen readers pick it up
      setTimeout(() => {
        region.textContent = message;
      }, delay);

      // Clear the message after it's been announced
      setTimeout(() => {
        region.textContent = '';
      }, delay + 3000);
    }
  }, [ensureLiveRegions]);

  const announcePolite = useCallback((message, delay = 100) => {
    announce(message, 'polite', delay);
  }, [announce]);

  const announceAssertive = useCallback((message, delay = 100) => {
    announce(message, 'assertive', delay);
  }, [announce]);

  // Predefined announcement helpers
  const announceNavigation = useCallback((destination) => {
    announcePolite(`Navigated to ${destination}`);
  }, [announcePolite]);

  const announceAction = useCallback((action, result = 'completed') => {
    announcePolite(`${action} ${result}`);
  }, [announcePolite]);

  const announceError = useCallback((error) => {
    announceAssertive(`Error: ${error}`);
  }, [announceAssertive]);

  const announceSuccess = useCallback((message) => {
    announcePolite(`Success: ${message}`);
  }, [announcePolite]);

  const announceLoading = useCallback((isLoading, context = '') => {
    if (isLoading) {
      announcePolite(`Loading ${context}...`);
    } else {
      announcePolite(`${context} loaded`);
    }
  }, [announcePolite]);

  const announceCount = useCallback((count, itemType) => {
    const message = count === 0 
      ? `No ${itemType} found`
      : count === 1 
        ? `1 ${itemType} found`
        : `${count} ${itemType} found`;
    announcePolite(message);
  }, [announcePolite]);

  const announceSelection = useCallback((item, position, total) => {
    const message = total 
      ? `${item}, ${position} of ${total}`
      : `${item} selected`;
    announcePolite(message);
  }, [announcePolite]);

  const announceExpanded = useCallback((isExpanded, item) => {
    const state = isExpanded ? 'expanded' : 'collapsed';
    announcePolite(`${item} ${state}`);
  }, [announcePolite]);

  const announceSort = useCallback((column, direction) => {
    announcePolite(`Sorted by ${column}, ${direction}`);
  }, [announcePolite]);

  const announceFilter = useCallback((filterType, value, resultCount) => {
    const message = value 
      ? `Filtered by ${filterType}: ${value}. ${resultCount} results`
      : `${filterType} filter cleared. ${resultCount} results`;
    announcePolite(message);
  }, [announcePolite]);

  return {
    announce,
    announcePolite,
    announceAssertive,
    announceNavigation,
    announceAction,
    announceError,
    announceSuccess,
    announceLoading,
    announceCount,
    announceSelection,
    announceExpanded,
    announceSort,
    announceFilter
  };
};

export default useAnnouncements;