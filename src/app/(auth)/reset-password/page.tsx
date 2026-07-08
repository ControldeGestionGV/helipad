"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

function ResetPasswordForm() {
  const { t } = useTranslations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Validate token on load
  const { data: validation, isLoading: isValidating } = trpc.passwordReset.validateToken.useQuery(
    { token },
    { enabled: !!token }
  );

  const resetPassword = trpc.passwordReset.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError(t("resetPassword.passwordMinLength"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("resetPassword.passwordsDontMatch"));
      return;
    }

    resetPassword.mutate({ token, password });
  };

  // Loading state
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 via-brand-50/30 to-zinc-100 p-4">
        <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-8 text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-zinc-500">{t("resetPassword.validatingLink")}</p>
        </div>
      </div>
    );
  }

  // Invalid or expired token
  if (!token || !validation?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 via-brand-50/30 to-zinc-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-serif font-semibold text-zinc-900 mb-2">
              {t("resetPassword.invalidOrExpiredLink")}
            </h1>
            <p className="text-zinc-500 mb-8">
              {t("resetPassword.invalidLinkDescription")}
            </p>
            <div className="space-y-3">
              <Link href="/forgot-password">
                <Button className="w-full">{t("resetPassword.requestNewLink")}</Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="w-4 h-4" />
                  {t("forgotPassword.backToLogin")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 via-brand-50/30 to-zinc-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-serif font-semibold text-zinc-900 mb-2">
              {t("resetPassword.passwordReset")}
            </h1>
            <p className="text-zinc-500 mb-8">
              {t("resetPassword.passwordResetSuccess")}
            </p>
            <Link href="/login">
              <Button className="w-full">{t("resetPassword.goToLogin")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 via-brand-50/30 to-zinc-100 p-4">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher variant="compact" />
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-200">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-serif font-semibold text-zinc-900 mb-2">
              {t("resetPassword.title")}
            </h1>
            <p className="text-zinc-500">
              {t("resetPassword.description", { firstName: validation.firstName ?? "" })}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="password">{t("resetPassword.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("resetPassword.enterNewPassword")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("resetPassword.confirmPassword")}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder={t("resetPassword.confirmNewPassword")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={resetPassword.isPending}
            >
              {resetPassword.isPending ? t("resetPassword.resetting") : t("resetPassword.resetPassword")}
            </Button>
          </form>

          {/* Back to login */}
          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("forgotPassword.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  const { t } = useTranslations();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 via-brand-50/30 to-zinc-100 p-4">
      <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-8 text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-zinc-500">{t("common.loading")}</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

