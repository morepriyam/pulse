import { Redirect, useLocalSearchParams } from "expo-router";
import { validate as uuidValidate, version as uuidVersion } from "uuid";

// Validate UUID v4
const isUUIDv4 = (uuid: string) =>
  uuidValidate(uuid) && uuidVersion(uuid) === 4;

export default function Index() {
  const params = useLocalSearchParams<{
    mode?: string;
    draftId?: string;
  }>();

  // Debug logging for deeplink parameters
  console.log("🔗 Deeplink params:", params);

  // Handle upload mode with UUID validation
  if (params.mode === "upload") {
    if (params.draftId && isUUIDv4(params.draftId)) {
      console.log("✅ Valid upload deeplink, redirecting to upload screen");
      return <Redirect href={`/upload?draftId=${params.draftId}`} />;
    } else {
      console.log("❌ Invalid upload deeplink - missing or invalid draftId");
      // Could redirect to upload screen without draftId for new recording
      // return <Redirect href="/upload" />;
    }
  }

  // Default to tabs
  console.log("🏠 Redirecting to main tabs");
  return <Redirect href="/(tabs)" />;
}
