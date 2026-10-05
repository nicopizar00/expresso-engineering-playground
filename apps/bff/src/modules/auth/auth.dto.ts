import { IsString, MaxLength } from "class-validator";

// Shape-only checks. Identity rules (normalization, lengths, patterns) run in
// AuthService through core/auth/identity.ts so they report a `field`.
export class RegisterDto {
  @IsString()
  @MaxLength(300)
  username!: string;

  @IsString()
  @MaxLength(300)
  email!: string;

  @IsString()
  @MaxLength(300)
  password!: string;
}

export class LoginDto {
  @IsString()
  @MaxLength(300)
  identifier!: string;

  @IsString()
  @MaxLength(300)
  password!: string;
}
