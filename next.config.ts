import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "nodemailer", "xlsx", "jspdf", "jspdf-autotable", "bcryptjs"],
  poweredByHeader: false,
};

export default nextConfig;
