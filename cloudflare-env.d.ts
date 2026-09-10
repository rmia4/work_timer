declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ACCESS_CODE_HASH?: string;
    APP_ORIGIN?: string;
    BUCKET?: R2Bucket;
  }
}
