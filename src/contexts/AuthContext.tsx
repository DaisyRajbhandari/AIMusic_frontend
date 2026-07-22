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
  getCurrentUser,
  loginUser,
  registerUser,
} from "@/lib/api/authApi";

import type {
  AuthenticationResponse,
  AuthUser,
  LoginCredentials,
  RegisterData,
} from "@/types/auth";

const USER_SESSION_KEY = "synestraUserSession";
const ACCESS_TOKEN_KEY = "synestraAccessToken";

const OLD_SESSION_KEYS = [
  "apiferumUserSession",
  "museflowUser",
];

interface SavedAuthentication {
  user: AuthUser | null;
  token: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoggedIn: boolean;
  isCheckingAuthentication: boolean;

  login: (
    credentials: LoginCredentials,
    rememberMe?: boolean,
  ) => Promise<AuthUser>;

  register: (
  registrationData: RegisterData,
  rememberMe?: boolean,
) => Promise<AuthUser>;

  applyAuthentication: (
    authentication: AuthenticationResponse,
    rememberMe?: boolean,
  ) => void;

  refreshSession: () => Promise<AuthUser | null>;
  logout: () => void;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

function clearStoredAuthentication(): void {
  localStorage.removeItem(USER_SESSION_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);

  sessionStorage.removeItem(USER_SESSION_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);

  OLD_SESSION_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

function getSavedAuthentication(): SavedAuthentication {
  const localToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const sessionToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);

  const token = localToken || sessionToken;

  if (!token) {
    clearStoredAuthentication();

    return {
      user: null,
      token: null,
    };
  }

  const storage = localToken
    ? localStorage
    : sessionStorage;

  const savedUser = storage.getItem(USER_SESSION_KEY);

  if (!savedUser) {
    clearStoredAuthentication();

    return {
      user: null,
      token: null,
    };
  }

  try {
    const user = JSON.parse(savedUser) as AuthUser;

    if (!user || !user.email) {
      throw new Error("Saved user information is incomplete.");
    }

    return {
      user,
      token,
    };
  } catch (error) {
    console.error(
      "Invalid saved authentication information:",
      error,
    );

    clearStoredAuthentication();

    return {
      user: null,
      token: null,
    };
  }
}

function saveAuthentication(
  authentication: AuthenticationResponse,
  rememberMe: boolean,
): void {
  clearStoredAuthentication();

  const storage = rememberMe
    ? localStorage
    : sessionStorage;

  storage.setItem(
    ACCESS_TOKEN_KEY,
    authentication.access_token,
  );

  storage.setItem(
    USER_SESSION_KEY,
    JSON.stringify(authentication.user),
  );
}

function updateStoredUser(user: AuthUser): void {
  const storage = localStorage.getItem(ACCESS_TOKEN_KEY)
    ? localStorage
    : sessionStorage;

  storage.setItem(
    USER_SESSION_KEY,
    JSON.stringify(user),
  );
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [initialAuthentication] =
    useState<SavedAuthentication>(() =>
      getSavedAuthentication(),
    );

  const [user, setUser] = useState<AuthUser | null>(
    initialAuthentication.user,
  );

  const [accessToken, setAccessToken] = useState<
    string | null
  >(initialAuthentication.token);

  const [
    isCheckingAuthentication,
    setIsCheckingAuthentication,
  ] = useState<boolean>(
    Boolean(initialAuthentication.token),
  );

  const applyAuthentication = useCallback(
    (
      authentication: AuthenticationResponse,
      rememberMe = true,
    ): void => {
      if (
        !authentication.access_token ||
        !authentication.user
      ) {
        throw new Error(
          "Authentication response is incomplete.",
        );
      }

      saveAuthentication(authentication, rememberMe);

      setUser(authentication.user);
      setAccessToken(authentication.access_token);
    },
    [],
  );

  const login = useCallback(
    async (
      credentials: LoginCredentials,
      rememberMe = true,
    ): Promise<AuthUser> => {
      const authentication = await loginUser(credentials);

      applyAuthentication(authentication, rememberMe);

      return authentication.user;
    },
    [applyAuthentication],
  );

  const register = useCallback(
  async (
    registrationData: RegisterData,
    rememberMe = true,
  ): Promise<AuthUser> => {
    const authentication =
      await registerUser(registrationData);

    applyAuthentication(authentication, rememberMe);

    return authentication.user;
  },
  [applyAuthentication],
);

  const refreshSession =
    useCallback(async (): Promise<AuthUser | null> => {
      const storedAuthentication =
        getSavedAuthentication();

      if (!storedAuthentication.token) {
        setUser(null);
        setAccessToken(null);

        return null;
      }

      try {
        const response = await getCurrentUser(
          storedAuthentication.token,
        );

        updateStoredUser(response.user);

        setUser(response.user);
        setAccessToken(storedAuthentication.token);

        return response.user;
      } catch (error) {
        console.error(
          "Session validation failed:",
          error,
        );

        clearStoredAuthentication();

        setUser(null);
        setAccessToken(null);

        return null;
      }
    }, []);

  const logout = useCallback((): void => {
    clearStoredAuthentication();

    localStorage.removeItem("draftPrompt");
    sessionStorage.removeItem("draftPrompt");

    setUser(null);
    setAccessToken(null);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function validateSavedAuthentication() {
      if (!initialAuthentication.token) {
        setIsCheckingAuthentication(false);
        return;
      }

      try {
        const response = await getCurrentUser(
          initialAuthentication.token,
        );

        if (isCancelled) {
          return;
        }

        updateStoredUser(response.user);

        setUser(response.user);
        setAccessToken(initialAuthentication.token);
      } catch (error) {
        console.error(
          "Saved session validation failed:",
          error,
        );

        if (!isCancelled) {
          clearStoredAuthentication();

          setUser(null);
          setAccessToken(null);
        }
      } finally {
        if (!isCancelled) {
          setIsCheckingAuthentication(false);
        }
      }
    }

    void validateSavedAuthentication();

    return () => {
      isCancelled = true;
    };
  }, [initialAuthentication.token]);

 const contextValue = useMemo<AuthContextValue>(
  () => ({
    user,
    accessToken,
    isLoggedIn: Boolean(user && accessToken),
    isCheckingAuthentication,
    login,
    register,
    applyAuthentication,
    refreshSession,
    logout,
  }),
    [
  user,
  accessToken,
  isCheckingAuthentication,
  login,
  register,
  applyAuthentication,
  refreshSession,
  logout,
],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider.",
    );
  }

  return context;
}