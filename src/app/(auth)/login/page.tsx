"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plane } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { useTranslations } from "@/hooks/use-translations";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { signIn } from "@/lib/auth-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslations();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    setError(null);

    // Trim inputs to avoid copy-paste whitespace issues
    const username = data.username.trim();
    const password = data.password.trim();

    try {
      await signIn(username, password);
      
      // Successful login - redirect
      const callbackUrl = searchParams.get("callbackUrl") || "/bookings/calendar";
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : t("auth.unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Language Switcher - Outside the card */}
      

      {/* Main Card - Contains everything */}
      <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 p-8 md:p-10">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        {/* Header with Logo */}
        <div className="text-center mb-8">
          {/* Logo */}
          <div className="flex justify-center mb-6 flex-col items-center">
            <Image
              src="/images/logo-short-no-bg.png"
              alt="Heliport Logo"
              width={185}
              height={185}
              priority
              className="object-contain"
            />
          <h3 className="text-lg font-serif tracking-wide text-brand-800">
            Heli<span className="italic text-gold-600">pad</span>
          </h3>

          </div>
          
          <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("auth.welcomeBack")}</h1>
          <p className="text-zinc-500 mt-1">{t("auth.signInToManage")}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-100">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-zinc-700"
            >
              {t("auth.username")}
            </label>
            <input
              {...register("username")}
              id="username"
              type="text"
              autoComplete="username"
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors disabled:opacity-50"
              placeholder={t("auth.enterUsername")}
            />
            {errors.username && (
              <p className="text-sm text-red-600">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-700"
              >
                {t("auth.password")}
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-brand-600 hover:text-brand-700 transition-colors"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
            <input
              {...register("password")}
              id="password"
              type="password"
              autoComplete="current-password"
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors disabled:opacity-50"
              placeholder={t("auth.enterPassword")}
            />
            {errors.password && (
              <p className="text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold rounded-xl shadow-lg shadow-brand-200 hover:from-brand-600 hover:to-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t("auth.signingIn")}
              </>
            ) : (
              t("auth.signIn")
            )}
          </button>
        </form>

        {/* Demo credentials hint - Inside the card */}
        {/* <div className="mt-6 pt-6 border-t border-zinc-200 text-center text-sm text-zinc-500">
          <p>{t("auth.demoCredentials")}</p>
          <p className="font-mono text-xs mt-1 text-zinc-600">
            admin / admin123 &nbsp;•&nbsp; demo / demo1234
          </p>
        </div> */}
      </div>
      {/* End of Main Card */}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
