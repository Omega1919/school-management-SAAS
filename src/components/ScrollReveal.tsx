import React, { useEffect, useRef, useState, useId } from 'react';

interface ScrollRevealProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  className?: string;
  delay?: number; // In milliseconds
  duration?: number; // In milliseconds
  direction?: 'up' | 'down' | 'left' | 'right' | 'zoom' | 'none';
  distance?: number; // In pixels for translation
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
  as?: React.ElementType;
}

/**
 * ScrollReveal component that smoothly fades in and translates elements into view
 * as the user scrolls down the page. Respects `prefers-reduced-motion`.
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  className = '',
  delay = 0,
  duration = 1700,
  direction = 'up',
  distance = 36,
  threshold = 0.06,
  rootMargin = '0px 0px -60px 0px',
  once = true,
  as: Component = 'div',
  style,
  ...restProps
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // If user prefers reduced motion, reveal immediately without animation
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsRevealed(true);
      return;
    }

    // If IntersectionObserver is not supported, reveal immediately
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          if (once) {
            observer.unobserve(element);
          }
        } else if (!once) {
          setIsRevealed(false);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, once]);

  // Compute transform offset based on chosen direction
  const getTransform = () => {
    if (isRevealed) return 'translate3d(0, 0, 0) scale(1)';
    switch (direction) {
      case 'up':
        return `translate3d(0, ${distance}px, 0)`;
      case 'down':
        return `translate3d(0, -${distance}px, 0)`;
      case 'left':
        return `translate3d(${distance}px, 0, 0)`;
      case 'right':
        return `translate3d(-${distance}px, 0, 0)`;
      case 'zoom':
        return `translate3d(0, ${Math.round(distance / 2)}px, 0) scale(0.95)`;
      case 'none':
      default:
        return 'translate3d(0, 0, 0)';
    }
  };

  const dynamicStyle: React.CSSProperties = {
    ...style,
    opacity: isRevealed ? 1 : 0,
    transform: getTransform(),
    transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    transitionDelay: `${delay}ms`,
    willChange: isRevealed ? 'auto' : 'opacity, transform',
  };

  return (
    <Component
      ref={elementRef}
      className={`reveal-wrapper ${isRevealed ? 'is-revealed' : 'is-pending'} ${className}`}
      style={dynamicStyle}
      {...restProps}
    >
      {children}
    </Component>
  );
};

/**
 * Hook for imperative scroll reveal on a specific ref
 */
export function useScrollReveal(options: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
} = {}) {
  const { threshold = 0.1, rootMargin = '0px 0px -40px 0px', once = true } = options;
  const [isRevealed, setIsRevealed] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsRevealed(true);
      return;
    }

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setIsRevealed(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref: elementRef, isRevealed };
}
