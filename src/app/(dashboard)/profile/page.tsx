"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Mail, Lock, LogOut, Loader2, Shield } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useSession, signOut } from "@/lib/auth-client";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ProfileData = z.infer<typeof profileSchema>;
type PasswordData = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"profile" | "security">("profile");
  const { t } = useTranslations();

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
  } = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: session?.user?.firstName ?? "",
      lastName: session?.user?.lastName ?? "",
      email: session?.user?.email ?? "",
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordData>({
    resolver: zodResolver(passwordSchema),
  });

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      router.refresh();
      toast({ type: "success", title: t("profile.profileUpdated") });
    },
    onError: (error) => {
      toast({ type: "error", title: t("common.error"), description: error.message });
    },
  });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      resetPassword();
      toast({ type: "success", title: t("profile.changePassword.passwordChanged") });
    },
    onError: (error) => {
      toast({ type: "error", title: t("common.error"), description: error.message });
    },
  });

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  const onProfileSubmit = (data: ProfileData) => {
    updateProfile.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordData) => {
    changePassword.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("profile.title")}</h1>
        <p className="text-zinc-500 mt-1">{t("profile.description")}</p>
      </div>

      {/* User card */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white text-xl font-bold">
            {session?.user?.firstName?.[0]}
            {session?.user?.lastName?.[0]}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">
              {session?.user?.firstName} {session?.user?.lastName}
            </h2>
            <p className="text-zinc-500">@{session?.user?.username}</p>
            <Badge
              variant={session?.user?.role === "admin" ? "default" : "secondary"}
              className="mt-2"
            >
              {session?.user?.role}
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "profile"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <User className="w-4 h-4" />
          {t("profile.tabs.profile")}
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "security"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <Shield className="w-4 h-4" />
          {t("profile.tabs.security")}
        </button>
      </div>

      {/* Profile tab */}
      {activeTab === "profile" && (
        <form
          onSubmit={handleProfileSubmit(onProfileSubmit)}
          className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t("profile.firstName")}</Label>
              <Input
                id="firstName"
                {...registerProfile("firstName")}
                error={!!profileErrors.firstName}
              />
              {profileErrors.firstName && (
                <p className="text-xs text-red-600">
                  {profileErrors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t("profile.lastName")}</Label>
              <Input
                id="lastName"
                {...registerProfile("lastName")}
                error={!!profileErrors.lastName}
              />
              {profileErrors.lastName && (
                <p className="text-xs text-red-600">
                  {profileErrors.lastName.message}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("profile.email")}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                id="email"
                type="email"
                {...registerProfile("email")}
                error={!!profileErrors.email}
                className="pl-10"
              />
            </div>
            {profileErrors.email && (
              <p className="text-xs text-red-600">{profileErrors.email.message}</p>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {t("common.saveChanges")}
            </Button>
          </div>
        </form>
      )}

      {/* Security tab */}
      {activeTab === "security" && (
        <div className="space-y-4">
          <form
            onSubmit={handlePasswordSubmit(onPasswordSubmit)}
            className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm space-y-4"
          >
            <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {t("profile.changePassword.title")}
            </h3>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("profile.changePassword.currentPassword")}</Label>
              <Input
                id="currentPassword"
                type="password"
                {...registerPassword("currentPassword")}
                error={!!passwordErrors.currentPassword}
              />
              {passwordErrors.currentPassword && (
                <p className="text-xs text-red-600">
                  {passwordErrors.currentPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("profile.changePassword.newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                {...registerPassword("newPassword")}
                error={!!passwordErrors.newPassword}
              />
              {passwordErrors.newPassword && (
                <p className="text-xs text-red-600">
                  {passwordErrors.newPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("profile.changePassword.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...registerPassword("confirmPassword")}
                error={!!passwordErrors.confirmPassword}
              />
              {passwordErrors.confirmPassword && (
                <p className="text-xs text-red-600">
                  {passwordErrors.confirmPassword.message}
                </p>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {t("profile.changePassword.updatePassword")}
              </Button>
            </div>
          </form>

          {/* Sign out */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
            <h3 className="font-semibold text-zinc-900 mb-2">{t("profile.signOut.title")}</h3>
            <p className="text-sm text-zinc-500 mb-4">
              {t("profile.signOut.description")}
            </p>
            <Button
              variant="destructive"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4" />
              {t("auth.signOut")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
