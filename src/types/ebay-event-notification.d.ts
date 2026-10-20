declare module "event-notification-nodejs-sdk/lib/validator" {
  export function validateSignature(
    message: unknown,
    signatureHeader: string,
    config: {
      clientId: string;
      clientSecret: string;
      environment: "SANDBOX" | "PRODUCTION";
    }
  ): Promise<boolean>;
}