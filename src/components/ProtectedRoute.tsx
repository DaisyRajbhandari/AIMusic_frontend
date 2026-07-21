import type { ReactNode } from "react";

import {
  Navigate,
  useLocation,
} from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import SoLunaLoader from "@/components/ui/loader";

import type { UserRole } from "@/types/auth";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute = ({
  children,
  allowedRoles,
}: ProtectedRouteProps) => {
  const location = useLocation();

  const {
    user,
    isLoggedIn,
    isCheckingAuthentication,
  } = useAuth();

  if (isCheckingAuthentication) {
    return (
      <SoLunaLoader
        fullScreen
        text="CHECKING SESSION"
      />
    );
  }

  if (!isLoggedIn || !user) {
    const requestedPage = `${location.pathname}${location.search}`;

    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: requestedPage,
        }}
      />
    );
  }

  if (
    allowedRoles &&
    !allowedRoles.includes(user.role)
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;