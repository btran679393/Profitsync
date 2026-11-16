import { appIconResponse } from "@/lib/appIcon";

// Home-screen and splash icon (512×512) listed in the app manifest.
export function GET() {
  return appIconResponse(512);
}
