export type CallStateChangePayload = {
  /** True while the mic is unavailable because the session is interrupted. On iOS that can flip
   * as soon as the ringtone interrupts an open recorder session, or later when the call is
   * actually answered if no ringtone was audible. */
  isActive: boolean;
};

export type CallDetectorModuleEvents = {
  onCallStateChange: (params: CallStateChangePayload) => void;
};
