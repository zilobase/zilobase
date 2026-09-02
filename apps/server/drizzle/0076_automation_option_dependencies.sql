ALTER TABLE "database_automation_dependency"
  DROP CONSTRAINT "database_automation_dependency_type_check";
--> statement-breakpoint
ALTER TABLE "database_automation_dependency"
  ADD CONSTRAINT "database_automation_dependency_type_check"
  CHECK ("dependency_type" in ('data_source', 'database', 'view', 'property', 'option', 'user', 'group', 'gmail_connection', 'slack_connection', 'secret'));
