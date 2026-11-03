export interface Env {
  DB: D1Database;
  MAPS: R2Bucket;
  /** e.g. yourteam.cloudflareaccess.com */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Access application AUD tag */
  CF_ACCESS_AUD?: string;
  /**
   * Local/dev bypass when Access is not configured.
   * Only honored when team domain/AUD are unset.
   */
  DEV_AUTH_EMAIL?: string;
}

export type MapMeta = {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
};
