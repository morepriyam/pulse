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

  // Handle upload mode with UUID validation
  if (params.mode === "upload" && params.draftId && isUUIDv4(params.draftId)) {
    return <Redirect href={`/upload?draftId=${params.draftId}`} />;
  }

  // Default to tabs
  return <Redirect href="/(tabs)" />;
}
