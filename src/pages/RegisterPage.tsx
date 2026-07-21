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

interface RegisterLocationState {
  from?: string;
}

interface RegisterFormState {
  fullName: string;
  email: string;
  age: string;
  gender: string;
  password: string;
  confirmPassword: string;
}

const initialFormState: RegisterFormState = {
  fullName: "",
  email: "",
  age: "",
  gender: "",
  password: "",
  confirmPassword: "",
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    register,
    isLoggedIn,
    isCheckingAuthentication,
  } = useAuth();

  const [form, setForm] =
    useState<RegisterFormState>(initialFormState);

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

  const updateField = (
    field: keyof RegisterFormState,
    value: string,
  ) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const validateForm = (): string | null => {
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    const age = form.age.trim();
    const gender = form.gender.trim();

    if (
      !fullName ||
      !email ||
      !age ||
      !gender ||
      !form.password ||
      !form.confirmPassword
    ) {
      return "Please complete all registration fields.";
    }

    const numericAge = Number(age);

    if (
      !Number.isInteger(numericAge) ||
      numericAge < 1 ||
      numericAge > 120
    ) {
      return "Please enter a valid age.";
    }

    if (form.password.length < 6) {
      return "Password must be at least 6 characters long.";
    }

    if (form.password !== form.confirmPassword) {
      return "Passwords do not match.";
    }

    return null;
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setErrorMessage("");

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      await register(
        {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          age: form.age.trim(),
          gender: form.gender,
          password: form.password,
        },
        true,
      );

      toast.success("Account created", {
        description:
          "Your account has been created successfully.",
      });

      const state =
        location.state as RegisterLocationState | null;

      navigate(state?.from || "/generation", {
        replace: true,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Registration failed. Please try again.";

      setErrorMessage(message);

      toast.error("Unable to create account", {
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

      <section className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/50 backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
        <div className="hidden min-h-[760px] flex-col justify-between border-r border-white/10 bg-gradient-to-br from-violet-950/80 via-[#09070f] to-[#020202] p-12 lg:flex">
          <Link
            to="/"
            className="text-xl font-semibold tracking-tight text-white"
          >
            SoLuna
          </Link>

          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.25em] text-violet-300">
              Create your workspace
            </p>

            <h1 className="max-w-md text-4xl font-semibold leading-tight">
              Begin your AI music creation journey.
            </h1>

            <p className="mt-5 max-w-md text-base leading-7 text-white/65">
              Create an account to generate structured
              compositions, preserve your sessions, and access
              personalized music tools.
            </p>

            <div className="mt-10 space-y-4 text-sm text-white/70">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                Secure personal account
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                AI-assisted music generation
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                Saved generation history
              </div>
            </div>
          </div>

          <p className="text-xs text-white/35">
            SoLuna AI Music Platform
          </p>
        </div>

        <div className="flex min-h-[760px] items-center p-6 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-lg">
            <div className="mb-8">
              <Link
                to="/"
                className="mb-7 inline-flex text-sm text-white/55 transition hover:text-white lg:hidden"
              >
                ← Back to SoLuna
              </Link>

              <p className="text-sm font-medium uppercase tracking-[0.22em] text-violet-300">
                New account
              </p>

              <h2 className="mt-3 text-3xl font-semibold">
                Create your account
              </h2>

              <p className="mt-3 text-sm leading-6 text-white/55">
                Enter your details to create your personal music
                workspace.
              </p>
            </div>

            <form
              className="space-y-5"
              onSubmit={handleSubmit}
            >
              <div>
                <label
                  htmlFor="register-name"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Full name
                </label>

                <input
                  id="register-name"
                  type="text"
                  value={form.fullName}
                  onChange={(event) =>
                    updateField(
                      "fullName",
                      event.target.value,
                    )
                  }
                  placeholder="Enter your full name"
                  autoComplete="name"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="register-email"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Email address
                </label>

                <input
                  id="register-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    updateField(
                      "email",
                      event.target.value,
                    )
                  }
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="register-age"
                    className="mb-2 block text-sm font-medium text-white/80"
                  >
                    Age
                  </label>

                  <input
                    id="register-age"
                    type="number"
                    min="1"
                    max="120"
                    value={form.age}
                    onChange={(event) =>
                      updateField(
                        "age",
                        event.target.value,
                      )
                    }
                    placeholder="Age"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="register-gender"
                    className="mb-2 block text-sm font-medium text-white/80"
                  >
                    Gender
                  </label>

                  <select
                    id="register-gender"
                    value={form.gender}
                    onChange={(event) =>
                      updateField(
                        "gender",
                        event.target.value,
                      )
                    }
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-xl border border-white/10 bg-[#121212] px-4 text-sm text-white outline-none transition focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
                  >
                    <option value="">
                      Select gender
                    </option>
                    <option value="Female">
                      Female
                    </option>
                    <option value="Male">
                      Male
                    </option>
                    <option value="Other">
                      Other
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="register-password"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Password
                </label>

                <input
                  id="register-password"
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    updateField(
                      "password",
                      event.target.value,
                    )
                  }
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="register-confirm-password"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Confirm password
                </label>

                <input
                  id="register-confirm-password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) =>
                    updateField(
                      "confirmPassword",
                      event.target.value,
                    )
                  }
                  placeholder="Enter your password again"
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
                  ? "Creating account..."
                  : "Create account"}
              </button>
            </form>

            <div className="mt-8 border-t border-white/10 pt-6 text-center">
              <p className="text-sm text-white/50">
                Already have an account?{" "}
                <Link
                  to="/login"
                  state={location.state}
                  className="font-medium text-violet-300 transition hover:text-violet-200"
                >
                  Log in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default RegisterPage;