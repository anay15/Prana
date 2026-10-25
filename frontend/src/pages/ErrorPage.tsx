import { Link, useRouteError } from "react-router-dom";

/** Shown instead of a blank screen if a page throws while rendering. */
export function ErrorPage() {
  const error = useRouteError();
  console.error(error);
  return (
    <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
      <div>
        <div className="font-display text-3xl font-semibold text-brand">Something went off balance</div>
        <p className="mt-3 text-muted">Sorry, this page hit an unexpected error. Reloading usually fixes it.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => window.location.reload()} className="btn btn-primary">Reload</button>
          <Link to="/" className="btn btn-ghost" reloadDocument>Home</Link>
        </div>
      </div>
    </div>
  );
}
