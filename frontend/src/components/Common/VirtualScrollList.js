import React, { useState, useEffect, useRef, useMemo } from 'react';
import useResponsive from '../../hooks/useResponsive';

const VirtualScrollList = ({
  items = [],
  itemHeight = 60,
  containerHeight = 400,
  renderItem,
  overscan = 5,
  className = '',
  onScroll = null,
  loading = false,
  loadingComponent = null,
  emptyComponent = null,
  keyExtractor = (item, index) => item.id || index
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerRef, setContainerRef] = useState(null);
  const { isMobile } = useResponsive();
  
  // Adjust item height for mobile
  const adjustedItemHeight = isMobile ? itemHeight * 1.2 : itemHeight;
  
  // Calculate visible range
  const visibleRange = useMemo(() => {
    if (!items.length) return { start: 0, end: 0 };
    
    const visibleStart = Math.floor(scrollTop / adjustedItemHeight);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(containerHeight / adjustedItemHeight),
      items.length - 1
    );
    
    return {
      start: Math.max(0, visibleStart - overscan),
      end: Math.min(items.length - 1, visibleEnd + overscan)
    };
  }, [scrollTop, adjustedItemHeight, containerHeight, items.length, overscan]);
  
  // Calculate total height
  const totalHeight = items.length * adjustedItemHeight;
  
  // Calculate offset for visible items
  const offsetY = visibleRange.start * adjustedItemHeight;
  
  // Get visible items
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end + 1);
  }, [items, visibleRange.start, visibleRange.end]);
  
  const handleScroll = (event) => {
    const newScrollTop = event.target.scrollTop;
    setScrollTop(newScrollTop);
    
    if (onScroll) {
      onScroll(event);
    }
  };
  
  // Keyboard navigation
  const handleKeyDown = (event) => {
    if (!containerRef) return;
    
    const { key } = event;
    const currentScrollTop = containerRef.scrollTop;
    
    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        containerRef.scrollTop = Math.min(
          currentScrollTop + adjustedItemHeight,
          totalHeight - containerHeight
        );
        break;
      
      case 'ArrowUp':
        event.preventDefault();
        containerRef.scrollTop = Math.max(currentScrollTop - adjustedItemHeight, 0);
        break;
      
      case 'PageDown':
        event.preventDefault();
        containerRef.scrollTop = Math.min(
          currentScrollTop + containerHeight,
          totalHeight - containerHeight
        );
        break;
      
      case 'PageUp':
        event.preventDefault();
        containerRef.scrollTop = Math.max(currentScrollTop - containerHeight, 0);
        break;
      
      case 'Home':
        event.preventDefault();
        containerRef.scrollTop = 0;
        break;
      
      case 'End':
        event.preventDefault();
        containerRef.scrollTop = totalHeight - containerHeight;
        break;
    }
  };
  
  // Scroll to item
  const scrollToItem = (index) => {
    if (!containerRef) return;
    
    const itemTop = index * adjustedItemHeight;
    const itemBottom = itemTop + adjustedItemHeight;
    const currentScrollTop = containerRef.scrollTop;
    const currentScrollBottom = currentScrollTop + containerHeight;
    
    if (itemTop < currentScrollTop) {
      // Item is above visible area
      containerRef.scrollTop = itemTop;
    } else if (itemBottom > currentScrollBottom) {
      // Item is below visible area
      containerRef.scrollTop = itemBottom - containerHeight;
    }
  };
  
  // Loading state
  if (loading && loadingComponent) {
    return (
      <div 
        className={`${className}`}
        style={{ height: containerHeight }}
      >
        {loadingComponent}
      </div>
    );
  }
  
  // Empty state
  if (!loading && items.length === 0 && emptyComponent) {
    return (
      <div 
        className={`${className}`}
        style={{ height: containerHeight }}
      >
        {emptyComponent}
      </div>
    );
  }
  
  return (
    <div
      ref={setContainerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label="Virtual scroll list"
      aria-rowcount={items.length}
    >
      {/* Total height container */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible items container */}
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) => {
            const actualIndex = visibleRange.start + index;
            const key = keyExtractor(item, actualIndex);
            
            return (
              <div
                key={key}
                style={{ height: adjustedItemHeight }}
                role="option"
                aria-rowindex={actualIndex + 1}
                aria-setsize={items.length}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Hook for virtual scroll list
export const useVirtualScrollList = (items, options = {}) => {
  const {
    itemHeight = 60,
    containerHeight = 400,
    overscan = 5
  } = options;
  
  const [scrollTop, setScrollTop] = useState(0);
  const { isMobile } = useResponsive();
  
  const adjustedItemHeight = isMobile ? itemHeight * 1.2 : itemHeight;
  
  const visibleRange = useMemo(() => {
    if (!items.length) return { start: 0, end: 0 };
    
    const visibleStart = Math.floor(scrollTop / adjustedItemHeight);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(containerHeight / adjustedItemHeight),
      items.length - 1
    );
    
    return {
      start: Math.max(0, visibleStart - overscan),
      end: Math.min(items.length - 1, visibleEnd + overscan)
    };
  }, [scrollTop, adjustedItemHeight, containerHeight, items.length, overscan]);
  
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end + 1);
  }, [items, visibleRange.start, visibleRange.end]);
  
  const totalHeight = items.length * adjustedItemHeight;
  const offsetY = visibleRange.start * adjustedItemHeight;
  
  return {
    visibleItems,
    visibleRange,
    totalHeight,
    offsetY,
    adjustedItemHeight,
    setScrollTop
  };
};

export default VirtualScrollList;