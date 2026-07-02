import { Fragment } from "react";
import { Navigate, Route, type RouteProps } from "react-router-dom";

/** Trailing-slash variant of `path` for users who open `/foo/bar/`. */
export function trailingSlashPath(path: string): string {
  if (path === "/" || path.endsWith("/")) return path;
  return `${path}/`;
}

type CanonicalRouteProps = Pick<RouteProps, "path" | "element">;

/** Registers a route and a trailing-slash redirect to the same path. */
export function CanonicalRoute({ path, element }: CanonicalRouteProps) {
  if (!path || typeof path !== "string" || path === "/") {
    return <Route path={path} element={element} />;
  }

  return (
    <Fragment>
      <Route path={path} element={element} />
      <Route
        path={trailingSlashPath(path)}
        element={<Navigate to={path} replace />}
      />
    </Fragment>
  );
}
