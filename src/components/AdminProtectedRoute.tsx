import type { ReactNode } from "react";

import {
  Navigate,
  useLocation,
} from "react-router-dom";

import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface AdminProtectedRouteProps {
  children: ReactNode;
}

const AdminProtectedRoute = ({
  children,
}: AdminProtectedRouteProps) => {
  const location = useLocation();

  const {
    isAdminAuthenticated,
    isCheckingAdminAuthentication,
  } = useAdminAuth();

  if (isCheckingAdminAuthentication) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020202] px-6 text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-violet-300" />

          <p className="text-sm text-white/70">
            Checking administrator session...
          </p>
        </div>
      </main>
    );
  }

  if (!isAdminAuthenticated) {
    const requestedPage = `${location.pathname}${location.search}`;

    return (
      <Navigate
        to="/admin/login"
        replace
        state={{
          from: requestedPage,
        }}
      />
    );
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;