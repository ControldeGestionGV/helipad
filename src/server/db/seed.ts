import { db } from "./index";
import { users, settings, emailConfigurations } from "./schema";
import bcrypt from "bcrypt";

async function seed() {
  console.log("🌱 Seeding database...");

  // Check if admin already exists
  const existingAdmin = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.username, "admin"),
  });

  if (existingAdmin) {
    console.log("✅ Admin user already exists, skipping user seed");
  } else {
    // Create admin user
    const hashedPassword = await bcrypt.hash("admin123", 10);
    
    await db.insert(users).values({
      username: "admin",
      email: "admin@helipad.local",
      password: hashedPassword,
      firstName: "System",
      lastName: "Administrator",
      role: "admin",
      isActive: true,
    });

    console.log("✅ Created admin user (username: admin, password: admin123)");

    // Create a demo user
    const demoPassword = await bcrypt.hash("demo1234", 10);
    
    await db.insert(users).values({
      username: "demo",
      email: "demo@helipad.local",
      password: demoPassword,
      firstName: "Demo",
      lastName: "User",
      role: "user",
      isActive: true,
    });

    console.log("✅ Created demo user (username: demo, password: demo1234)");

    // Create security user
    const securityPassword = await bcrypt.hash("security123", 10);
    
    await db.insert(users).values({
      username: "security",
      email: "security@email.com",
      password: securityPassword,
      firstName: "Security",
      lastName: "Observer",
      role: "security",
      isActive: true,
    });

    console.log("✅ Created security user (username: security, password: security123)");
  }

  // Seed default settings
  const defaultSettingsData = [
    {
      key: "operationalHours",
      value: JSON.stringify({ start: "08:00", end: "18:00" }),
    },
    {
      key: "timeSlotDuration",
      value: JSON.stringify(15),
    },
    {
      key: "minBookingNotice",
      value: JSON.stringify(30),
    },
    {
      key: "maxBookingDuration",
      value: JSON.stringify(30),
    },
    {
      key: "cancellationCutoff",
      value: JSON.stringify(10),
    },
    {
      key: "blackoutDates",
      value: JSON.stringify([]),
    },
    {
      key: "emailNotifications",
      value: JSON.stringify({
        confirmationEnabled: true,
        reminderEnabled: true,
        reminderHoursBefore: 24,
        adminNotificationsEnabled: true,
      }),
    },
  ];

  for (const setting of defaultSettingsData) {
    const existing = await db.query.settings.findFirst({
      where: (settings, { eq }) => eq(settings.key, setting.key),
    });

    if (!existing) {
      await db.insert(settings).values(setting);
      console.log(`✅ Created setting: ${setting.key}`);
    }
  }

  // Seed default email configuration
  const existingEmailConfig = await db.query.emailConfigurations.findFirst();
  
  if (!existingEmailConfig) {
    await db.insert(emailConfigurations).values({
      provider: "smtp",
      smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
      smtpPort: parseInt(process.env.SMTP_PORT || "587"),
      smtpSecure: process.env.SMTP_SECURE === "true",
      smtpUser: process.env.SMTP_USER || "",
      smtpPassword: process.env.SMTP_PASSWORD || "",
      fromEmail: process.env.EMAIL_FROM || "noreply@helipad.local",
      fromName: process.env.EMAIL_FROM_NAME || "Helipad Booking",
      isActive: true,
    });
    console.log("✅ Created default email configuration");
  }

  console.log("🎉 Seed completed!");
}

seed()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

