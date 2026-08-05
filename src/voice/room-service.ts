/**
 * The slice of LiveKit's RoomServiceClient this project uses. Narrow on purpose:
 * the test double must reproduce it exactly, and nothing outside src/voice/ may
 * import LiveKit at all.
 */
export interface VoiceRoomService {
  /**
   * Server-driven subscribe/unsubscribe. The only mechanism that decides who
   * hears whom, deliberately: a second one, such as flipping a participant's
   * standing canSubscribe permission, would be a second place for the audio
   * rules to live and a second place for them to disagree.
   */
  updateSubscriptions(
    room: string,
    identity: string,
    trackSids: string[],
    subscribe: boolean,
  ): Promise<void>;
  listParticipants(room: string): Promise<VoiceParticipant[]>;
  deleteRoom(room: string): Promise<void>;
}

export interface VoiceParticipant {
  identity: string;
  tracks: { sid: string }[];
}
