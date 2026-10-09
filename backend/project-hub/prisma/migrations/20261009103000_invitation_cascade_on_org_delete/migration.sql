-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_organizationId_fkey";

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;