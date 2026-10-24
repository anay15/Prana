import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { NotFound } from "./pages/NotFound";
import { Progress } from "./pages/Progress";

// The ML runtime is large; only load it when someone opens a practice session.
const Practice = lazy(() => import("./pages/Practice").then((m) => ({ default: m.Practice })));

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: "/", element: <Home /> },
          { path: "/poses", element: <Library /> },
          { path: "/practice/:poseId", element: <Suspense fallback={null}><Practice /></Suspense> },
          { path: "/progress", element: <Progress /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
