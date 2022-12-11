CREATE TABLE mergeSchedules (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  installationId INT NOT NULL,

  -- 非正規化
  repositoryOwner VARCHAR(255) NOT NULL,
  repositoryName VARCHAR(255) NOT NULL,
  pullRequestNumber INTEGER NOT NULL,

  willMergeAt DATETIME NOT NULL
);

CREATE INDEX willMergeAtIndex on mergeSchedules(willMergeAt);
