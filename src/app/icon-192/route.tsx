import { appIconResponse } from "@/lib/appIcon";

// Home-screen icon (192×192) listed in the app manifest.
export function GET() {
  return appIconResponse(192);
}
