import { useState, useEffect } from "react";

export interface UseIsMobileReturn {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export function useIsMobile(): UseIsMobileReturn {
  const [breakpoints, setBreakpoints] = useState<UseIsMobileReturn>({
    isMobile: typeof window !== "undefined" ? window.innerWidth < 768 : false,
    isTablet: typeof window !== "undefined" ? (window.innerWidth >= 768 && window.innerWidth <= 1024) : false,
    isDesktop: typeof window !== "undefined" ? window.innerWidth > 1024 : true,
  });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        setBreakpoints({
          isMobile: width < 768,
          isTablet: width >= 768 && width <= 1024,
          isDesktop: width > 1024,
        });
      }, 150);
    };

    window.addEventListener("resize", handleResize);
    // Trigger initial check
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return breakpoints;
}
