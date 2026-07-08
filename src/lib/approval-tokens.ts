import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "helipad-secret-change-in-production"
);

export type ApprovalAction = "approve" | "reject";

export interface ApprovalTokenPayload {
  bookingId: string;
  action: ApprovalAction;
}

export async function createApprovalToken(payload: ApprovalTokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

export async function verifyApprovalToken(token: string) {
  const verified = await jwtVerify(token, JWT_SECRET);
  const payload = verified.payload as Partial<ApprovalTokenPayload>;

  if (
    typeof payload.bookingId !== "string" ||
    (payload.action !== "approve" && payload.action !== "reject")
  ) {
    throw new Error("Invalid approval token");
  }

  return {
    bookingId: payload.bookingId,
    action: payload.action,
  };
}
