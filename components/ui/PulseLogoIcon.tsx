import React from "react";
import { Image, ImageProps } from "react-native";

export default function PulseLogoIcon({ size = 32, style }: { size?: number; style?: ImageProps["style"] }) {
  return (
    <Image
      source={require("@/assets/images/pulse-logo.png")}
      style={[
        { width: size, height: size, marginBottom: 0, alignSelf: "center" },
        style,
      ]}
      resizeMode="contain"
    />
  );
}
