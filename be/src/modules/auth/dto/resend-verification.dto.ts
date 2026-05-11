import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'Email must be valid.' })
  @MaxLength(255, { message: 'Email must be 255 characters or less.' })
  email!: string;
}
