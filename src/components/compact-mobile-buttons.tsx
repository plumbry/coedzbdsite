import { createContext, useContext } from "react";

const CompactMobileButtonsContext = createContext(true);

export function useCompactMobileButtons() {
  return useContext(CompactMobileButtonsContext);
}

/** Disables compact mobile button sizing for Summer Slam and other opted-out areas. */
export function CompactMobileButtonsOptOut({ children }: { children: React.ReactNode }) {
  return (
    <CompactMobileButtonsContext.Provider value={false}>
      <div data-compact-mobile="off" className="contents">
        {children}
      </div>
    </CompactMobileButtonsContext.Provider>
  );
}
