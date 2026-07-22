/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getCurrentAdmin,
  loginAdmin,
} from "@/lib/api/adminAuthApi";

import type {
  AdminAuthenticationResponse,
  AdminLoginCredentials,
  AdminUser,
} from "@/types/adminAuth";

const ADMIN_SESSION_KEY =
  "synestraAdminSession";

const ADMIN_ACCESS_TOKEN_KEY =
  "synestraAdminAccessToken";

interface SavedAdminAuthentication {
  admin: AdminUser | null;
  accessToken: string | null;
}

interface AdminAuthContextValue {
  admin: AdminUser | null;
  accessToken: string | null;

  isAdminAuthenticated: boolean;
  isCheckingAdminAuthentication: boolean;

  login: (
    credentials: AdminLoginCredentials,
    rememberMe?: boolean,
  ) => Promise<AdminUser>;

  applyAuthentication: (
    authentication: AdminAuthenticationResponse,
    rememberMe?: boolean,
  ) => void;

  refreshSession: () => Promise<AdminUser | null>;

  logout: () => void;
}

interface AdminAuthProviderProps {
  children: ReactNode;
}

const AdminAuthContext =
  createContext<AdminAuthContextValue | undefined>(
    undefined,
  );

function clearStoredAdminAuthentication(): void {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  localStorage.removeItem(
    ADMIN_ACCESS_TOKEN_KEY,
  );

  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(
    ADMIN_ACCESS_TOKEN_KEY,
  );
}

function getSavedAdminAuthentication():
  SavedAdminAuthentication {
  const localAccessToken =
    localStorage.getItem(
      ADMIN_ACCESS_TOKEN_KEY,
    );

  const sessionAccessToken =
    sessionStorage.getItem(
      ADMIN_ACCESS_TOKEN_KEY,
    );

  const accessToken =
    localAccessToken || sessionAccessToken;

  if (!accessToken) {
    clearStoredAdminAuthentication();

    return {
      admin: null,
      accessToken: null,
    };
  }

  const storage = localAccessToken
    ? localStorage
    : sessionStorage;

  const savedAdmin = storage.getItem(
    ADMIN_SESSION_KEY,
  );

  if (!savedAdmin) {
    clearStoredAdminAuthentication();

    return {
      admin: null,
      accessToken: null,
    };
  }

  try {
    const parsedAdmin = JSON.parse(
      savedAdmin,
    ) as AdminUser;

    if (
      !parsedAdmin ||
      parsedAdmin.role !== "admin"
    ) {
      clearStoredAdminAuthentication();

      return {
        admin: null,
        accessToken: null,
      };
    }

    return {
      admin: parsedAdmin,
      accessToken,
    };
  } catch (error) {
    console.error(
      "Invalid saved administrator session:",
      error,
    );

    clearStoredAdminAuthentication();

    return {
      admin: null,
      accessToken: null,
    };
  }
}

function saveAdminAuthentication(
  authentication: AdminAuthenticationResponse,
  rememberMe: boolean,
): void {
  clearStoredAdminAuthentication();

  const storage = rememberMe
    ? localStorage
    : sessionStorage;

  storage.setItem(
    ADMIN_ACCESS_TOKEN_KEY,
    authentication.access_token,
  );

  storage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify(authentication.user),
  );
}

function updateStoredAdmin(
  admin: AdminUser,
): void {
  const localAccessToken =
    localStorage.getItem(
      ADMIN_ACCESS_TOKEN_KEY,
    );

  const sessionAccessToken =
    sessionStorage.getItem(
      ADMIN_ACCESS_TOKEN_KEY,
    );

  if (localAccessToken) {
    localStorage.setItem(
      ADMIN_SESSION_KEY,
      JSON.stringify(admin),
    );

    return;
  }

  if (sessionAccessToken) {
    sessionStorage.setItem(
      ADMIN_SESSION_KEY,
      JSON.stringify(admin),
    );
  }
}

export function AdminAuthProvider({
  children,
}: AdminAuthProviderProps) {
  const [initialAuthentication] =
    useState<SavedAdminAuthentication>(
      getSavedAdminAuthentication,
    );

  const [admin, setAdmin] =
    useState<AdminUser | null>(
      initialAuthentication.admin,
    );

  const [accessToken, setAccessToken] =
    useState<string | null>(
      initialAuthentication.accessToken,
    );

  const [
    isCheckingAdminAuthentication,
    setIsCheckingAdminAuthentication,
  ] = useState(
    Boolean(
      initialAuthentication.accessToken,
    ),
  );

  const applyAuthentication =
    useCallback(
      (
        authentication:
          AdminAuthenticationResponse,
        rememberMe = true,
      ) => {
        if (
          !authentication.access_token ||
          !authentication.user ||
          authentication.user.role !==
            "admin" ||
          authentication.session_type !==
            "admin"
        ) {
          throw new Error(
            "The authentication response is not a valid administrator session.",
          );
        }

        saveAdminAuthentication(
          authentication,
          rememberMe,
        );

        setAdmin(authentication.user);

        setAccessToken(
          authentication.access_token,
        );
      },
      [],
    );

  const login = useCallback(
    async (
      credentials:
        AdminLoginCredentials,
      rememberMe = true,
    ): Promise<AdminUser> => {
      const authentication =
        await loginAdmin(credentials);

      applyAuthentication(
        authentication,
        rememberMe,
      );

      return authentication.user;
    },
    [applyAuthentication],
  );

  const logout = useCallback(() => {
    clearStoredAdminAuthentication();

    setAdmin(null);
    setAccessToken(null);
  }, []);

  const refreshSession =
    useCallback(async (): Promise<AdminUser | null> => {
      if (!accessToken) {
        return null;
      }

      try {
        const response =
          await getCurrentAdmin(
            accessToken,
          );

        setAdmin(response.user);

        updateStoredAdmin(
          response.user,
        );

        return response.user;
      } catch (error) {
        console.error(
          "Administrator session refresh failed:",
          error,
        );

        logout();

        return null;
      }
    }, [accessToken, logout]);

  useEffect(() => {
    let isActive = true;

    const validateSavedSession =
      async () => {
        const savedAccessToken =
          initialAuthentication.accessToken;

        if (!savedAccessToken) {
          if (isActive) {
            setIsCheckingAdminAuthentication(
              false,
            );
          }

          return;
        }

        try {
          const response =
            await getCurrentAdmin(
              savedAccessToken,
            );

          if (!isActive) {
            return;
          }

          setAdmin(response.user);

          setAccessToken(
            savedAccessToken,
          );

          updateStoredAdmin(
            response.user,
          );
        } catch (error) {
          console.error(
            "Saved administrator session validation failed:",
            error,
          );

          if (!isActive) {
            return;
          }

          clearStoredAdminAuthentication();

          setAdmin(null);
          setAccessToken(null);
        } finally {
          if (isActive) {
            setIsCheckingAdminAuthentication(
              false,
            );
          }
        }
      };

    void validateSavedSession();

    return () => {
      isActive = false;
    };
  }, [
    initialAuthentication.accessToken,
  ]);

  const contextValue =
    useMemo<AdminAuthContextValue>(
      () => ({
        admin,
        accessToken,

        isAdminAuthenticated: Boolean(
          admin?.role === "admin" &&
            accessToken,
        ),

        isCheckingAdminAuthentication,

        login,
        applyAuthentication,
        refreshSession,
        logout,
      }),
      [
        admin,
        accessToken,
        isCheckingAdminAuthentication,
        login,
        applyAuthentication,
        refreshSession,
        logout,
      ],
    );

  return (
    <AdminAuthContext.Provider
      value={contextValue}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}


export function useAdminAuth(): AdminAuthContextValue {
  const context =
    useContext(AdminAuthContext);

  if (!context) {
    throw new Error(
      "useAdminAuth must be used inside AdminAuthProvider.",
    );
  }

  return context;
}