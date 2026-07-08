"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

export default function ForgotPasswordPage() {
  const { t } = useTranslations();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestReset = trpc.passwordReset.requestReset.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      requestReset.mutate({ email });
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 via-brand-50/30 to-zinc-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-serif font-semibold text-zinc-900 mb-2">
              {t("forgotPassword.checkEmail")}
            </h1>
            <p className="text-zinc-500 mb-6">
              {t("forgotPassword.emailSentDescription", { email })}
            </p>
            <p className="text-sm text-zinc-400 mb-8">
              {t("forgotPassword.linkExpiry")}
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="w-4 h-4" />
                {t("forgotPassword.backToLogin")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-serif font-semibold text-zinc-900 mb-2">
              {t("forgotPassword.title")}
            </h1>
            <p className="text-zinc-500">
              {t("forgotPassword.description")}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">{t("forgotPassword.emailAddress")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("forgotPassword.enterEmail")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={requestReset.isPending}
            >
              {requestReset.isPending ? t("forgotPassword.sending") : t("forgotPassword.sendResetLink")}
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

