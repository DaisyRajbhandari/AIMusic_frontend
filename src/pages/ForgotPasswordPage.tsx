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

import {
  requestPasswordResetCode,
  resetPassword,
} from "@/lib/api/authApi";

import { useAuth } from "@/contexts/AuthContext";

type ResetStep = "request" | "reset";

interface ForgotPasswordLocationState {
  from?: string;
}

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    isLoggedIn,
    isCheckingAuthentication,
  } = useAuth();

  const [step, setStep] =
    useState<ResetStep>("request");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] =
    useState("");
  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] =
    useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

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

  const requestCode = async (): Promise<boolean> => {
    const cleanedEmail = email.trim();

    setMessage("");
    setErrorMessage("");

    if (!cleanedEmail) {
      setErrorMessage(
        "Please enter your email address.",
      );

      return false;
    }

    setIsSubmitting(true);

    try {
      const response =
        await requestPasswordResetCode({
          email: cleanedEmail,
        });

      setStep("reset");
      setMessage(response.message);

      toast.success("Reset code requested", {
        description:
          "Check your inbox and spam folder for the six-digit code.",
      });

      return true;
    } catch (error) {
      const errorText =
        error instanceof Error
          ? error.message
          : "Could not request a reset code.";

      setErrorMessage(errorText);

      toast.error("Unable to request code", {
        description: errorText,
      });

      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestCode = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    await requestCode();
  };

  const handleResendCode = async () => {
    const sent = await requestCode();

    if (sent) {
      setMessage(
        "A new reset code was requested. Check your inbox or spam folder. Requests may be limited to once every 60 seconds.",
      );
    }
  };

  const handleResetPassword = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const cleanedEmail = email.trim();
    const cleanedCode = code.trim();

    setMessage("");
    setErrorMessage("");

    if (
      !cleanedEmail ||
      !cleanedCode ||
      !newPassword ||
      !confirmPassword
    ) {
      setErrorMessage(
        "Please enter the code and both password fields.",
      );

      return;
    }

    if (!/^\d{6}$/.test(cleanedCode)) {
      setErrorMessage(
        "The reset code must contain exactly 6 digits.",
      );

      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage(
        "Password must be at least 6 characters long.",
      );

      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await resetPassword({
        email: cleanedEmail,
        code: cleanedCode,
        newPassword,
      });

      toast.success("Password reset successful", {
        description: response.message,
      });

      const state =
        location.state as
          | ForgotPasswordLocationState
          | null;

      navigate("/login", {
        replace: true,
        state: state?.from
          ? {
              from: state.from,
              passwordReset: true,
            }
          : {
              passwordReset: true,
            },
      });
    } catch (error) {
      const errorText =
        error instanceof Error
          ? error.message
          : "Password reset failed.";

      setErrorMessage(errorText);

      toast.error("Unable to reset password", {
        description: errorText,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeEmail = () => {
    setStep("request");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("");
    setErrorMessage("");
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
        <div className="hidden min-h-[680px] flex-col justify-between border-r border-white/10 bg-gradient-to-br from-violet-950/80 via-[#09070f] to-[#020202] p-12 lg:flex">
          <Link
            to="/"
            className="text-xl font-semibold tracking-tight text-white"
          >
            SoLuna
          </Link>

          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.25em] text-violet-300">
              Account recovery
            </p>

            <h1 className="max-w-md text-4xl font-semibold leading-tight">
              Restore access to your music workspace.
            </h1>

            <p className="mt-5 max-w-md text-base leading-7 text-white/65">
              Request a secure six-digit code and create
              a new password for your account.
            </p>

            <div className="mt-10 space-y-4 text-sm text-white/70">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                Secure one-time reset code
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                Codes expire automatically
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                Existing sessions are invalidated
              </div>
            </div>
          </div>

          <p className="text-xs text-white/35">
            SoLuna AI Music Platform
          </p>
        </div>

        <div className="flex min-h-[680px] items-center p-6 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <Link
              to="/login"
              state={location.state}
              className="mb-8 inline-flex text-sm text-white/55 transition hover:text-white"
            >
              ← Back to login
            </Link>

            {step === "request" && (
              <>
                <div className="mb-8">
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-violet-300">
                    Password recovery
                  </p>

                  <h2 className="mt-3 text-3xl font-semibold">
                    Forgot your password?
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-white/55">
                    Enter the email connected to your
                    account. We will send a six-digit reset
                    code.
                  </p>
                </div>

                <form
                  className="space-y-5"
                  onSubmit={handleRequestCode}
                >
                  <div>
                    <label
                      htmlFor="forgot-email"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      Email address
                    </label>

                    <input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={(event) =>
                        setEmail(event.target.value)
                      }
                      placeholder="you@example.com"
                      autoComplete="email"
                      disabled={isSubmitting}
                      className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:cursor-not-allowed disabled:opacity-60"
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
                      ? "Requesting code..."
                      : "Send reset code"}
                  </button>
                </form>
              </>
            )}

            {step === "reset" && (
              <>
                <div className="mb-8">
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-violet-300">
                    Verify reset code
                  </p>

                  <h2 className="mt-3 text-3xl font-semibold">
                    Create a new password
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-white/55">
                    Enter the six-digit code sent for:
                  </p>

                  <p className="mt-1 break-all text-sm font-medium text-white">
                    {email.trim()}
                  </p>
                </div>

                {message && (
                  <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-200">
                    {message}
                  </div>
                )}

                <form
                  className="space-y-5"
                  onSubmit={handleResetPassword}
                >
                  <div>
                    <label
                      htmlFor="reset-code"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      Six-digit reset code
                    </label>

                    <input
                      id="reset-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(
                            /\D/g,
                            "",
                          ),
                        )
                      }
                      placeholder="123456"
                      autoComplete="one-time-code"
                      disabled={isSubmitting}
                      className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-center font-mono text-lg tracking-[0.45em] text-white outline-none transition placeholder:text-white/20 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="new-password"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      New password
                    </label>

                    <input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(event) =>
                        setNewPassword(event.target.value)
                      }
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="confirm-new-password"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      Confirm new password
                    </label>

                    <input
                      id="confirm-new-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(
                          event.target.value,
                        )
                      }
                      placeholder="Enter the new password again"
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
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
                      ? "Resetting password..."
                      : "Reset password"}
                  </button>
                </form>

                <div className="mt-6 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    disabled={isSubmitting}
                    className="text-sm text-white/55 transition hover:text-white disabled:opacity-50"
                  >
                    Change email
                  </button>

                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isSubmitting}
                    className="text-sm font-medium text-violet-300 transition hover:text-violet-200 disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

export default ForgotPasswordPage;
