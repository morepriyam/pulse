export type CallStateChangePayload = {
  /** True while a phone / VoIP call is active (ringing, dialing, or connected). */
  isActive: boolean;
};

export type CallDetectorModuleEvents = {
  onCallStateChange: (params: CallStateChangePayload) => void;
};
