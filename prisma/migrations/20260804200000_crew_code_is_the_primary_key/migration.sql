-- Makes the crew code the crew's primary key, and removes the separate uuid id
-- that was free to disagree with it.
--
-- ORDER IS LOAD-BEARING. The reconciliation below MUST run before the foreign
-- keys are dropped: both of them are ON UPDATE CASCADE, which is what carries
-- the new value down to CrewMembership.crewId and Session.crewId. Drop the
-- constraints first and the cascade is gone, the children keep a uuid that is
-- about to stop existing, and the ADD CONSTRAINT at the bottom fails validation
-- — leaving the table with no primary key at all.

-- Reconcile: one live crew (WXTNBD) has a uuid id and 6 memberships + 1 session
-- pointing at it. This rewrites the parent and lets the cascade move the children.
UPDATE "Crew" SET "id" = "code" WHERE "id" <> "code";

-- Refuse to continue if anything is still adrift. Better a failed migration
-- than a silently orphaned crew.
DO $$
DECLARE stranded INT;
BEGIN
  SELECT count(*) INTO stranded FROM (
    SELECT cm."crewId" FROM "CrewMembership" cm LEFT JOIN "Crew" c ON c."code" = cm."crewId" WHERE c."code" IS NULL
    UNION ALL
    SELECT s."crewId" FROM "Session" s LEFT JOIN "Crew" c ON c."code" = s."crewId" WHERE c."code" IS NULL
  ) AS orphans;
  IF stranded > 0 THEN
    RAISE EXCEPTION 'aborting: % row(s) reference a crew that would not survive', stranded;
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "CrewMembership" DROP CONSTRAINT "CrewMembership_crewId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_crewId_fkey";

-- DropIndex
DROP INDEX "Crew_code_key";

-- AlterTable
ALTER TABLE "Crew" DROP CONSTRAINT "Crew_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Crew_pkey" PRIMARY KEY ("code");

-- AddForeignKey
ALTER TABLE "CrewMembership" ADD CONSTRAINT "CrewMembership_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("code") ON DELETE CASCADE ON UPDATE CASCADE;
