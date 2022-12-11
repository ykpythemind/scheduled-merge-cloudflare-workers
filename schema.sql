CREATE TABLE mergeSchedules (
  id INT NOT NULL,
  installationId INT NOT NULL,

  -- 非正規化
  repositoryOwner VARCHAR(255) NOT NULL,
  repositoryName VARCHAR(255) NOT NULL,
  pullRequestNumber INT NOT NULL,

  willMergeAt DATETIME NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE INDEX willMergeAtIndex on mergeSchedules(willMergeAt);
