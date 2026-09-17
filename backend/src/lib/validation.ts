import { z } from 'zod';
import { MAX_REPLAY_BYTES, REPLAY_FORMAT_VERSION } from '../../../shared/game/replay';

/** Central input validation. Every route validates before touching the database. */

export const handleSchema = z
  .string()
  .trim()
  .min(3, 'Callsign must be at least 3 characters')
  .max(20, 'Callsign must be 20 characters or fewer')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Callsign may only contain letters, numbers, dashes and underscores');

export const displayNameSchema = z
  .string()
  .trim()
  .min(3, 'Name must be at least 3 characters')
  .max(24, 'Name must be 24 characters or fewer')
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Name contains invalid characters');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(190)
  .email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'Password is too long')
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), 'Include at least one letter and one number');

export const guestSchema = z.object({
  device: z.string().trim().max(120).optional(),
  callsign: handleSchema.optional(),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
  handle: handleSchema.optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms to create an account' }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});

export const upgradeSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(400),
});

export const updateMeSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    handle: handleSchema.optional(),
    avatarSeed: z.number().int().min(0).max(9999).optional(),
    preferences: z
      .object({
        sound: z.boolean().optional(),
        music: z.boolean().optional(),
        reducedMotion: z.boolean().optional(),
        screenShake: z.boolean().optional(),
        assistMode: z.boolean().optional(),
        defaultDifficulty: z.enum(['cadet', 'pilot', 'ace', 'legend']).optional(),
        showDamageNumbers: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const runSubmissionSchema = z.object({
  replay: z.object({
    v: z.number().int(),
    engine: z.string().min(1).max(24),
    mode: z.enum(['campaign', 'daily', 'gauntlet']),
    difficulty: z.enum(['cadet', 'pilot', 'ace', 'legend']),
    assist: z.boolean(),
    seed: z.number().int().min(-2_147_483_648).max(2_147_483_647),
    ticks: z.number().int().min(1).max(200_000),
    frames: z.string().min(1).max(MAX_REPLAY_BYTES),
    claims: z.object({
      score: z.number().int().min(0).max(100_000_000),
      wave: z.number().int().min(0).max(10_000),
      ticks: z.number().int().min(0).max(200_000),
      kills: z.number().int().min(0).max(1_000_000),
      bossKills: z.number().int().min(0).max(10_000),
      ufosDestroyed: z.number().int().min(0).max(100_000),
      maxCombo: z.number().int().min(0).max(1_000_000),
      livesLost: z.number().int().min(0).max(1_000),
      accuracy: z.number().min(0).max(1),
    }),
    client: z.string().max(64),
    checksum: z.string().max(64),
  }),
  dailyKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sessionId: z.string().max(64).optional(),
});

export const telemetrySchema = z.object({
  events: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        props: z.record(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
        at: z.string().max(40).optional(),
      }),
    )
    .max(50),
  sessionId: z.string().max(64).optional(),
});

export const saveSchema = z.object({
  payload: z.string().max(120_000),
  version: z.number().int().min(0).optional(),
  device: z.string().max(120).optional(),
});

export const reportSchema = z.object({
  runId: z.string().min(4).max(64),
  reason: z.enum(['suspicious-score', 'offensive-name', 'bug', 'other']),
  detail: z.string().trim().max(500).optional(),
});

export const moderationSchema = z.object({
  action: z.enum(['dismiss', 'flag-run', 'delete-run', 'ban-player', 'unban-player']),
  reason: z.string().trim().max(200).optional(),
});

export const leaderboardQuerySchema = z.object({
  board: z.string().trim().max(60).optional(),
  mode: z.enum(['campaign', 'daily', 'gauntlet']).optional(),
  difficulty: z.enum(['all', 'cadet', 'pilot', 'ace', 'legend']).optional(),
  period: z.enum(['alltime', 'weekly', 'monthly', 'daily']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  handle: z.string().trim().max(20).optional(),
});

export type RunSubmissionInput = z.infer<typeof runSubmissionSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GuestInput = z.infer<typeof guestSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type TelemetryInput = z.infer<typeof telemetrySchema>;
export type SaveInput = z.infer<typeof saveSchema>;

/** Parse with zod and translate failures into a 422 ApiError. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown, message = 'Invalid request body'): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    throw Object.assign(new Error(`${path}${issue?.message ?? message}`), { zod: true });
  }
  return result.data;
}

export { REPLAY_FORMAT_VERSION };
