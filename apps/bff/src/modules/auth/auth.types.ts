export interface PublicUser {
  readonly username: string;
  readonly email: string;
}

export interface MeResponse {
  readonly user: PublicUser | null;
}
