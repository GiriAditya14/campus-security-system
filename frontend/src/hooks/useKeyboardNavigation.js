import { useEffect, useCallback } from 'react';

const useKeyboardNavigation = (options = {}) => {
  const {
    onEscape = null,
    onEnter = null,
    onArrowUp = null,
    onArrowDown = null,
    onArrowLeft = null,
    onArrowRight = null,
    onTab = null,
    onShiftTab = null,
    enabled = true,
    preventDefault = true
  } = options;

  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    const { key, shiftKey, ctrlKey, altKey, metaKey } = event;

    // Skip if modifier keys are pressed (except Shift for Tab)
    if ((ctrlKey || altKey || metaKey) && !(key === 'Tab' && shiftKey)) {
      return;
    }

    let handled = false;

    switch (key) {
      case 'Escape':
        if (onEscape) {
          onEscape(event);
          handled = true;
        }
        break;
      
      case 'Enter':
        if (onEnter) {
          onEnter(event);
          handled = true;
        }
        break;
      
      case 'ArrowUp':
        if (onArrowUp) {
          onArrowUp(event);
          handled = true;
        }
        break;
      
      case 'ArrowDown':
        if (onArrowDown) {
          onArrowDown(event);
          handled = true;
        }
        break;
      
      case 'ArrowLeft':
        if (onArrowLeft) {
          onArrowLeft(event);
          handled = true;
        }
        break;
      
      case 'ArrowRight':
        if (onArrowRight) {
          onArrowRight(event);
          handled = true;
        }
        break;
      
      case 'Tab':
        if (shiftKey && onShiftTab) {
          onShiftTab(event);
          handled = true;
        } else if (!shiftKey && onTab) {
          onTab(event);
          handled = true;
        }
        break;
    }

    if (handled && preventDefault) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [
    enabled,
    onEscape,
    onEnter,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onTab,
    onShiftTab,
    preventDefault
  ]);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);

  // Focus management utilities
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ');

  const getFocusableElements = (container = document) => {
    return Array.from(container.querySelectorAll(focusableSelectors));
  };

  const focusFirst = (container = document) => {
    const elements = getFocusableElements(container);
    if (elements.length > 0) {
      elements[0].focus();
      return elements[0];
    }
    return null;
  };

  const focusLast = (container = document) => {
    const elements = getFocusableElements(container);
    if (elements.length > 0) {
      elements[elements.length - 1].focus();
      return elements[elements.length - 1];
    }
    return null;
  };

  const focusNext = (currentElement, container = document) => {
    const elements = getFocusableElements(container);
    const currentIndex = elements.indexOf(currentElement);
    
    if (currentIndex >= 0 && currentIndex < elements.length - 1) {
      elements[currentIndex + 1].focus();
      return elements[currentIndex + 1];
    } else if (elements.length > 0) {
      // Wrap to first element
      elements[0].focus();
      return elements[0];
    }
    return null;
  };

  const focusPrevious = (currentElement, container = document) => {
    const elements = getFocusableElements(container);
    const currentIndex = elements.indexOf(currentElement);
    
    if (currentIndex > 0) {
      elements[currentIndex - 1].focus();
      return elements[currentIndex - 1];
    } else if (elements.length > 0) {
      // Wrap to last element
      elements[elements.length - 1].focus();
      return elements[elements.length - 1];
    }
    return null;
  };

  const trapFocus = (container) => {
    const elements = getFocusableElements(container);
    if (elements.length === 0) return () => {};

    const firstElement = elements[0];
    const lastElement = elements[elements.length - 1];

    const handleTabKey = (event) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);

    // Focus first element initially
    firstElement.focus();

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  };

  return {
    getFocusableElements,
    focusFirst,
    focusLast,
    focusNext,
    focusPrevious,
    trapFocus
  };
};

export default useKeyboardNavigation;