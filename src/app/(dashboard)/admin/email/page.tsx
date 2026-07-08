"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  Mail,
  Save,
  TestTube,
  Server,
  Lock,
  User,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  Cloud,
} from "lucide-react";

export default function EmailSettingsPage() {
  const { t } = useTranslations();
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<"smtp" | "resend" | "msgraph">("smtp");

  const emailConfigSchema = z.object({
    provider: z.enum(["smtp", "resend", "msgraph"]),
    smtpHost: z.string().optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().optional(),
    smtpPassword: z.string().optional(),
    fromEmail: z.string().email(t("emailSettings.fromEmailInvalid")),
    fromName: z.string().min(1, t("emailSettings.fromNameRequired")),
    mailboxSender: z.string().email().optional(),
    azureTenantId: z.string().optional(),
    azureClientId: z.string().optional(),
  }).refine((data) => {
    // SMTP requires all SMTP fields
    if (data.provider === "smtp") {
      return data.smtpHost && data.smtpPort && data.smtpUser && data.smtpPassword;
    }
    return true;
  }, {
    message: t("emailSettings.smtpFieldsRequired"),
  });

  type EmailConfigFormData = z.infer<typeof emailConfigSchema>;

  const { data: config, isLoading } = trpc.emailConfig.getCurrent.useQuery();
  const updateConfig = trpc.emailConfig.update.useMutation();
  const testEmailMutation = trpc.emailConfig.test.useMutation();

  const utils = trpc.useUtils();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    watch,
  } = useForm<EmailConfigFormData>({
    resolver: zodResolver(emailConfigSchema),
    values: config
      ? {
          provider: config.provider as "smtp" | "resend" | "msgraph",
          smtpHost: config.smtpHost || "",
          smtpPort: config.smtpPort || 587,
          smtpSecure: config.smtpSecure ?? false,
          smtpUser: config.smtpUser || "",
          smtpPassword: config.smtpPassword || "",
          fromEmail: config.fromEmail || "",
          fromName: config.fromName || "",
          mailboxSender: config.mailboxSender || "",
          azureTenantId: config.azureTenantId || "",
          azureClientId: config.azureClientId || "",
        }
      : undefined,
  });

  // Watch provider changes
  const currentProvider = watch("provider");

  const onSubmit = async (data: EmailConfigFormData) => {
    if (!config) return;

    try {
      await updateConfig.mutateAsync({
        id: config.id,
        provider: data.provider,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpSecure: data.smtpSecure,
        smtpUser: data.smtpUser,
        smtpPassword: data.smtpPassword,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        mailboxSender: data.mailboxSender,
        azureTenantId: data.azureTenantId,
        azureClientId: data.azureClientId,
      });

      await utils.emailConfig.getCurrent.invalidate();

      toast({
        type: "success",
        title: t("emailSettings.settingsSaved"),
        description: t("emailSettings.settingsSavedDescription"),
      });

      reset(data);
    } catch (error) {
      toast({
        type: "error",
        title: t("emailSettings.errorSaving"),
        description: error instanceof Error ? error.message : t("emailSettings.errorSavingDescription"),
      });
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast({
        type: "error",
        title: t("emailSettings.emailRequired"),
        description: t("emailSettings.emailRequiredDescription"),
      });
      return;
    }

    try {
      await testEmailMutation.mutateAsync({ toEmail: testEmail });

      toast({
        type: "success",
        title: t("emailSettings.testSent"),
        description: t("emailSettings.testSentDescription").replace("{email}", testEmail),
      });
    } catch (error) {
      toast({
        type: "error",
        title: t("emailSettings.testFailed"),
        description: error instanceof Error ? error.message : t("emailSettings.testFailedDescription"),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
              {t("emailSettings.noConfig")}
            </h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              {t("emailSettings.noConfigDescription")}
            </p>
            <code className="mt-2 block rounded bg-amber-100 px-2 py-1 text-xs dark:bg-amber-900">
              npm run migrate:turso
            </code>
          </div>
        </div>
      </div>
    );
  }

  // Check if Graph is configured via environment
  const isGraphConfigured = !!(
    process.env.NEXT_PUBLIC_AZURE_TENANT_ID ||
    (typeof window === 'undefined' && process.env.AZURE_TENANT_ID)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight">{t("emailSettings.title")}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("emailSettings.description")}
          </p>
        </div>
        <Badge variant={config.isActive ? "success" : "secondary"}>
          {config.isActive ? (
            <>
              <CheckCircle className="mr-1 h-3 w-3" />
              {t("emailSettings.active")}
            </>
          ) : (
            t("emailSettings.inactive")
          )}
        </Badge>
      </div>

      {/* Configuration Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Provider Selection */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Email Provider</h2>
            <p className="text-sm text-muted-foreground">Choose your email delivery method</p>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                value="smtp"
                {...register("provider")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span className="font-medium">SMTP Server</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Use your own SMTP server (Gmail, SendGrid, etc.)
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                value="msgraph"
                {...register("provider")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  <span className="font-medium">Microsoft Graph (Office 365)</span>
                  {isGraphConfigured && (
                    <Badge variant="success" className="text-xs">Configured</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Secure OAuth 2.0 authentication via Azure AD
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Microsoft Graph Configuration */}
        {currentProvider === "msgraph" && (
          <div className="rounded-lg border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Cloud className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Microsoft Graph Configuration</h2>
            </div>

            <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-medium mb-2">Configuration via Environment Variables</p>
                  <p className="mb-2">
                    Microsoft Graph credentials are configured securely via environment variables:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">AZURE_TENANT_ID</code></li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">AZURE_CLIENT_ID</code></li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">AZURE_CLIENT_SECRET</code></li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">MAILBOX_SENDER</code></li>
                  </ul>
                  <p className="mt-2">
                    {isGraphConfigured ? (
                      <span className="text-green-700 dark:text-green-300 font-medium">
                        ✓ Environment variables detected
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300 font-medium">
                        ⚠ Environment variables not detected
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="mailboxSender" className="text-sm font-medium">
                  Mailbox Sender <span className="text-muted-foreground">(Display only)</span>
                </label>
                <Input
                  id="mailboxSender"
                  type="email"
                  {...register("mailboxSender")}
                  placeholder="helipuerto@grupovelutini.com"
                />
                <p className="text-xs text-muted-foreground">
                  Fixed sender address (enforced by backend for security)
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="azureTenantId" className="text-sm font-medium">
                    Azure Tenant ID <span className="text-muted-foreground">(Display only)</span>
                  </label>
                  <Input
                    id="azureTenantId"
                    {...register("azureTenantId")}
                    placeholder="Configured via environment"
                    disabled
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="azureClientId" className="text-sm font-medium">
                    Azure Client ID <span className="text-muted-foreground">(Display only)</span>
                  </label>
                  <Input
                    id="azureClientId"
                    {...register("azureClientId")}
                    placeholder="Configured via environment"
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SMTP Configuration */}
        {currentProvider === "smtp" && (
          <>
            {/* SMTP Server Settings */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t("emailSettings.smtpServer")}</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="smtpHost" className="text-sm font-medium">
                {t("emailSettings.host")}
              </label>
              <Input
                id="smtpHost"
                {...register("smtpHost")}
                placeholder={t("emailSettings.hostPlaceholder")}
                error={!!errors.smtpHost}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="smtpPort" className="text-sm font-medium">
                {t("emailSettings.port")}
              </label>
              <Input
                id="smtpPort"
                type="number"
                {...register("smtpPort", { valueAsNumber: true })}
                placeholder={t("emailSettings.portPlaceholder")}
                error={!!errors.smtpPort}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="smtpSecure"
                type="checkbox"
                {...register("smtpSecure")}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="smtpSecure" className="text-sm font-medium">
                {t("emailSettings.useTLS")}
              </label>
            </div>
          </div>

          <div className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <strong>{t("emailSettings.commonPorts")}</strong> {t("emailSettings.portsInfo")}
          </div>
        </div>

        {/* Authentication */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t("emailSettings.authentication")}</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="smtpUser" className="text-sm font-medium">
                {t("emailSettings.username")}
              </label>
              <Input
                id="smtpUser"
                {...register("smtpUser")}
                placeholder={t("emailSettings.usernamePlaceholder")}
                error={!!errors.smtpUser}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="smtpPassword" className="text-sm font-medium">
                {t("emailSettings.password")}
              </label>
              <div className="relative">
                <Input
                  id="smtpPassword"
                  type={showPassword ? "text" : "password"}
                  {...register("smtpPassword")}
                  placeholder={t("emailSettings.passwordPlaceholder")}
                  error={!!errors.smtpPassword}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-md bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-100">
            <strong>{t("emailSettings.gmailNote")}</strong> {t("emailSettings.gmailNoteDescription")}{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              myaccount.google.com/apppasswords
            </a>
          </div>
        </div>
          </>
        )}

        {/* Sender Information */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t("emailSettings.senderInfo")}</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="fromEmail" className="text-sm font-medium">
                {t("emailSettings.fromEmail")}
              </label>
              <Input
                id="fromEmail"
                type="email"
                {...register("fromEmail")}
                placeholder={t("emailSettings.fromEmailPlaceholder")}
                error={!!errors.fromEmail}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="fromName" className="text-sm font-medium">
                {t("emailSettings.fromName")}
              </label>
              <Input
                id="fromName"
                {...register("fromName")}
                placeholder={t("emailSettings.fromNamePlaceholder")}
                error={!!errors.fromName}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between rounded-lg border bg-card p-6">
          <div>
            <p className="font-medium">{t("emailSettings.saveChanges")}</p>
            <p className="text-sm text-muted-foreground">
              {isDirty ? t("emailSettings.unsavedChanges") : t("emailSettings.allChangesSaved")}
            </p>
          </div>
          <Button
            type="submit"
            disabled={!isDirty || updateConfig.isPending}
            className="min-w-[120px]"
          >
            {updateConfig.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {t("emailSettings.saving")}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t("emailSettings.save")}
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Test Email */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <TestTube className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("emailSettings.testEmail")}</h2>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          {t("emailSettings.testEmailDescription")}
        </p>

        <div className="flex gap-2">
          <Input
            type="email"
            placeholder={t("emailSettings.testEmailPlaceholder")}
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleTestEmail}
            disabled={testEmailMutation.isPending || !testEmail}
            className="min-w-[120px]"
          >
            {testEmailMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {t("emailSettings.sending")}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {t("emailSettings.sendTest")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Help Section */}
      {currentProvider === "smtp" && (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-950">
        <h3 className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
          {t("emailSettings.commonProviders")}
        </h3>
        <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <div>
            <strong>{t("emailSettings.gmailProvider")}</strong> {t("emailSettings.gmailInfo")}
          </div>
          <div>
            <strong>{t("emailSettings.sendgridProvider")}</strong> {t("emailSettings.sendgridInfo")}
          </div>
          <div>
            <strong>{t("emailSettings.mailgunProvider")}</strong> {t("emailSettings.mailgunInfo")}
          </div>
          <div>
            <strong>{t("emailSettings.sesProvider")}</strong> {t("emailSettings.sesInfo")}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
