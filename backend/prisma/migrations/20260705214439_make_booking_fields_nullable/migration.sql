-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "instructor_id" DROP NOT NULL,
ALTER COLUMN "idempotency_body_hash" DROP NOT NULL,
ALTER COLUMN "slot_start_at_snapshot" DROP NOT NULL,
ALTER COLUMN "zone_format_snapshot" DROP NOT NULL;
