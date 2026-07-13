import { z } from "zod";
import bcrypt from "bcrypt";
import { eq, and, gt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { users, passwordResetTokens } from "@/server/db/schema";
import { sendEmail } from "@/server/services/email";

// Generate a secure random token
function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  const randomValues = new Uint8Array(48);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 48; i++) {
    token += chars[randomValues[i] % chars.length];
  }
  return token;
}

export const passwordResetRouter = createTRPCRouter({
  // Request password reset - sends email with reset link
  requestReset: publicProcedure
    .input(z.object({
      email: z.string().email(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Find user by email
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      // Always return success to prevent email enumeration
      if (!user) {
        return { success: true };
      }

      if (!user.isActive) {
        return { success: true };
      }

      // Generate token and expiry (1 hour from now)
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Invalidate any existing unused tokens for this user
      await ctx.db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt)
          )
        );

      // Create new reset token
      await ctx.db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      // Send reset email
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;
      
      try {
        await sendEmail({
          to: user.email,
          subject: "Reset Your Password - Helipad Booking",
          type: "password_reset",
          userId: user.id,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #18181b;">Reset Your Password</h2>
              <p style="color: #52525b;">Hi ${user.firstName},</p>
              <p style="color: #52525b;">
                We received a request to reset your password for your Helipad Booking account.
                Click the button below to set a new password:
              </p>
              <div style="margin: 32px 0;">
                <a href="${resetUrl}" 
                   style="background-color: #18181b; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 8px; display: inline-block;">
                  Reset Password
                </a>
              </div>
              <p style="color: #52525b; font-size: 14px;">
                This link will expire in 1 hour. If you didn't request a password reset, 
                you can safely ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;" />
              <p style="color: #a1a1aa; font-size: 12px;">
                If the button doesn't work, copy and paste this link into your browser:<br />
                <a href="${resetUrl}" style="color: #3f3f46;">${resetUrl}</a>
              </p>
            </div>
          `,
        });
      } catch (error) {
        console.error("Failed to send password reset email:", error);
        // Still return success to prevent enumeration
      }

      return { success: true };
    }),

  // Validate token - check if token is valid
  validateToken: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const resetToken = await ctx.db.query.passwordResetTokens.findFirst({
        where: and(
          eq(passwordResetTokens.token, input.token),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        ),
        with: {
          user: {
            columns: {
              email: true,
              firstName: true,
            },
          },
        },
      });

      if (!resetToken) {
        return { valid: false, email: null };
      }

      return {
        valid: true,
        email: resetToken.user.email,
        firstName: resetToken.user.firstName,
      };
    }),

  // Reset password - set new password using valid token
  resetPassword: publicProcedure
    .input(z.object({
      token: z.string(),
      password: z.string().min(6, "Password must be at least 6 characters"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Find valid token
      const resetToken = await ctx.db.query.passwordResetTokens.findFirst({
        where: and(
          eq(passwordResetTokens.token, input.token),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        ),
      });

      if (!resetToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired reset token",
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(input.password, 12);

      // Update user password
      await ctx.db
        .update(users)
        .set({ 
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(users.id, resetToken.userId));

      // Mark token as used
      await ctx.db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));

      return { success: true };
    }),
});

