-- DropForeignKey (guarded for fresh databases)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name = 'UserPreference_userId_fkey'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'UserPreference'
  ) THEN
    EXECUTE 'ALTER TABLE "public"."UserPreference" DROP CONSTRAINT "UserPreference_userId_fkey"';
  END IF;
END;
$$;

-- AddForeignKey (will run successfully once the table exists in later migrations)
ALTER TABLE IF EXISTS "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
