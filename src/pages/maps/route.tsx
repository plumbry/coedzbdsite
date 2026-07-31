import { Navigate, useLocation } from "react-router-dom";
import { normalizeMapsPathname } from "@/lib/maps/route.ts";
import { SharedMapPage } from "./page.tsx";

export default function MapsRoute() {
  const location = useLocation();
  const normalizedPath = normalizeMapsPathname(location.pathname);

  if (location.pathname !== normalizedPath) {
    return (
      <Navigate
        to={`${normalizedPath}${location.search}${location.hash}`}
        replace
      />
    );
  }

  return <SharedMapPage />;
}
