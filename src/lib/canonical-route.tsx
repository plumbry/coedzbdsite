import type { ReactElement } from "react";
import { Navigate, Route, type RouteProps } from "react-router-dom";

/** Trailing-slash variant of `path` for users who open `/foo/bar/`. */
export function trailingSlashPath(path: string): string {
  if (path === "/" || path.endsWith("/")) return path;
  return `${path}/`;
}

/** Route elements for a path plus its trailing-slash redirect alias. */
export function canonicalRouteElements(
  path: string,
  element: RouteProps["element"],
): ReactElement[] {
  if (!path || path === "/") {
    return [<Route key={path} path={path} element={element} />];
  }

  return [
    <Route key={path} path={path} element={element} />,
    <Route
      key={trailingSlashPath(path)}
      path={trailingSlashPath(path)}
      element={<Navigate to={path} replace />}
    />,
  ];
}
