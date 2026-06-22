import { createContext, useContext } from "react";

const CompactMobileButtonsContext = createContext(true);

export function useCompactMobileButtons() {
  return useContext(CompactMobileButtonsContext);
}

/** Preserves the old wrapper API while keeping compact mobile buttons enabled site-wide. */
export function CompactMobileButtonsOptOut({ children }: { children: React.ReactNode }) {
  return (
    <CompactMobileButtonsContext.Provider value={true}>
      <div className="contents">
        {children}
      </div>
    </CompactMobileButtonsContext.Provider>
  );
}
