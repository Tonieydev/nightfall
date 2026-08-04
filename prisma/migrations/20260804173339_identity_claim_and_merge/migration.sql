-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "emailClaimedAt" TIMESTAMP(3),
ADD COLUMN     "mergedIntoId" TEXT;

-- CreateIndex
CREATE INDEX "Player_mergedIntoId_idx" ON "Player"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
