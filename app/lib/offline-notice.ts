/** Recovery controls are explicit: changing the message must not change what the user can do. */
export type OfflineNotice = {
  message: string;
  pauseEditing?: boolean;
  offerRecovery?: boolean;
};
