import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vidtrans.ia",
  appName: "VidTrans IA",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
