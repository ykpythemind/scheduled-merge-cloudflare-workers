CREATE TABLE schedules (
  id INT NOT NULL,
  installationId INT NOT NULL,
  repositoryId INT NOT NULL,
  willMergeAt DATETIME NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE INDEX willMergeAtIndex on schedules(willMergeAt);
