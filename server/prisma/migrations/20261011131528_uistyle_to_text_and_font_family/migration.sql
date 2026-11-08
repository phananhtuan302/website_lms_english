-- Hand-written (not `prisma migrate dev`, which is non-interactive-unsupported here AND
-- whose auto-generated diff for an enum->text column change defaults to DROP+RECREATE,
-- losing the existing value) — this instead casts the column in place, preserving
-- whatever `uiStyle` is currently set to (confirmed safe: every existing enum label is
-- valid as text).

-- AlterTable: "uiStyle" enum -> free text (see Settings.uiStyle's doc comment in schema.prisma)
ALTER TABLE "settings" ALTER COLUMN "uiStyle" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "uiStyle" TYPE TEXT USING "uiStyle"::TEXT;
ALTER TABLE "settings" ALTER COLUMN "uiStyle" SET DEFAULT 'glass';

-- AlterTable: new nullable font-picker column
ALTER TABLE "settings" ADD COLUMN "fontFamily" TEXT;
