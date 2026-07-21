import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";

interface LoginLocationState {
  from?: string;
}

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    login,
    isLoggedIn,
    isCheckingAuthentication,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isCheckingAuthentication && isLoggedIn) {
      navigate("/generation", {
        replace: true,
      });
    }
  }, [
    isCheckingAuthentication,
    isLoggedIn,
    navigate,
  ]);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const cleanedEmail = email.trim();

    setErrorMessage("");

    if (!cleanedEmail || !password.trim()) {
      setErrorMessage(
        "Please enter both your email and password.",
      );

      return;
    }

    setIsSubmitting(true);

    try {
      await login(
        {
          email: cleanedEmail,
          password,
        },
        true,
      );

      toast.success("Login successful", {
        description: "Welcome back to your music workspace.",
      });

      const state =
        location.state as LoginLocationState | null;

      navigate(state?.from || "/generation", {
        replace: true,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Login failed. Please try again.";

      setErrorMessage(message);

      toast.error("Unable to log in", {
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuthentication) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020202] px-6 text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />

          <p className="text-sm text-white/70">
            Checking your session...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020202] px-4 py-12 text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-8rem] h-80 w-80 rounded-full bg-violet-700/20 blur-[120px]" />

        <div className="absolute bottom-[-10rem] right-[-8rem] h-96 w-96 rounded-full bg-blue-700/15 blur-[140px]" />

        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-700/10 blur-[140px]" />
      </div>

      <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/50 backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden min-h-[650px] flex-col justify-between border-r border-white/10 bg-gradient-to-br from-violet-950/80 via-[#09070f] to-[#020202] p-12 lg:flex">
          <Link
            to="/"
            className="text-xl font-semibold tracking-tight text-white"
          >
            SoLuna
          </Link>

          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.25em] text-violet-300">
              AI Music Workspace
            </p>

            <h1 className="max-w-md text-4xl font-semibold leading-tight">
              Turn your musical ideas into structured
              compositions.
            </h1>

            <p className="mt-5 max-w-md text-base leading-7 text-white/65">
              Sign in to access music generation, saved
              sessions, compositions, and personalized tools.
            </p>

            <div className="mt-10 space-y-4 text-sm text-white/70">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                Prompt-based AI music generation
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                Structured composition workflows
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                Secure personal generation history
              </div>
            </div>
          </div>

          <p className="text-xs text-white/35">
            SoLuna AI Music Platform
          </p>
        </div>

        <div className="flex min-h-[650px] items-center p-6 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-9">
              <Link
                to="/"
                className="mb-8 inline-flex text-sm text-white/55 transition hover:text-white lg:hidden"
              >
                ← Back to SoLuna
              </Link>

              <p className="text-sm font-medium uppercase tracking-[0.22em] text-violet-300">
                Member access
              </p>

              <h2 className="mt-3 text-3xl font-semibold">
                Welcome back
              </h2>

              <p className="mt-3 text-sm leading-6 text-white/55">
                Enter your account details to continue to your
                music workspace.
              </p>
            </div>

            <form
              className="space-y-5"
              onSubmit={handleSubmit}
            >
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Email address
                </label>

                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:bg-white/[0.07] focus:ring-4 focus:ring-violet-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-white/80"
                  >
                    Password
                  </label>
<button
  type="button"
  disabled={isSubmitting}
  onClick={() =>
    navigate("/forgot-password", {
      state: location.state,
    })
  }
  className="text-xs font-medium text-violet-300 transition hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
>
  Forgot password?
</button>
                </div>

                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:bg-white/[0.07] focus:ring-4 focus:ring-violet-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200"
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90 focus:outline-none focus:ring-4 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? "Logging in..."
                  : "Log in to workspace"}
              </button>
            </form>

            <div className="mt-8 border-t border-white/10 pt-6 text-center">
  <p className="text-sm text-white/50">
    New to the platform?{" "}
    <Link
      to="/register"
      state={location.state}
      className="font-medium text-violet-300 transition hover:text-violet-200"
    >
      Create an account
    </Link>
  </p>
</div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;