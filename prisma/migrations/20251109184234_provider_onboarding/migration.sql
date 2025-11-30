-- DropForeignKey
ALTER TABLE "public"."UserPreference" DROP CONSTRAINT "UserPreference_userId_fkey";

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
