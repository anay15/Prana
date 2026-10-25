import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { ErrorPage } from "./pages/ErrorPage";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { NotFound } from "./pages/NotFound";
import { PoseProgress } from "./pages/PoseProgress";
import { Profile } from "./pages/Profile";
import { Progress } from "./pages/Progress";
import { SignIn } from "./pages/SignIn";

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
    errorElement: <ErrorPage />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: "/", element: <Home /> },
          { path: "/poses", element: <Library /> },
          { path: "/practice/:poseId", element: <Suspense fallback={null}><Practice /></Suspense> },
          { path: "/progress", element: <Progress /> },
          { path: "/progress/:poseId", element: <PoseProgress /> },
          { path: "/signin", element: <SignIn /> },
          { path: "/profile", element: <Profile /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
