import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="mx-auto grid max-w-md place-items-center px-6 py-24 text-center">
      <div className="font-display text-6xl font-semibold text-brand">404</div>
      <p className="mt-3 text-muted">This page has wandered off the mat.</p>
      <Link to="/" className="btn btn-primary mt-6">Back home</Link>
    </div>
  );
}
