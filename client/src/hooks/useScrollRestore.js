// hooks/useScrollRestore.js
import { useEffect } from "react";
export default function useScrollRestore(scrollRef, storageKey) {
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved && scrollRef?.current) {
      scrollRef.current.scrollTo({ top: parseInt(saved, 10) || 0, behavior: "auto" });
      sessionStorage.removeItem(storageKey);
    }
  }, [scrollRef, storageKey]);

  const save = () => {
    if (scrollRef?.current) {
      sessionStorage.setItem(storageKey, String(scrollRef.current.scrollTop || 0));
    }
  };
  return save;
}
