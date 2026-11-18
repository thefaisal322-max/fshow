// react-native-incall-manager ships without TypeScript types; only what the app uses.
declare module 'react-native-incall-manager' {
  const InCallManager: {
    start(opts?: { media?: 'audio' | 'video'; auto?: boolean; ringback?: string }): void;
    stop(opts?: { busytone?: string }): void;
    setForceSpeakerphoneOn(on: boolean | null): void;
    setSpeakerphoneOn(on: boolean): void;
    setMicrophoneMute(on: boolean): void;
    startRingtone(ringtone?: string, vibratePattern?: number[], iosCategory?: string, seconds?: number): void;
    stopRingtone(): void;
    stopRingback(): void;
    setKeepScreenOn(on: boolean): void;
  };
  export default InCallManager;
}
