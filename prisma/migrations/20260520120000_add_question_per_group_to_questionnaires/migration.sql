ALTER TABLE `questionnaires`
  ADD COLUMN `question_per_group` INTEGER NOT NULL DEFAULT 1 AFTER `offerings`;
