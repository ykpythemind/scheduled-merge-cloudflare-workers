import { D1Orm, DataTypes, Infer, Model } from "d1-orm";

export function newScheduleModel(db: D1Database) {
  const orm = new D1Orm(db);
  const schedules = new Model(
    {
      D1Orm: orm,
      tableName: "mergeSchedules",
      primaryKeys: "id",
      autoIncrement: "id",
    },
    {
      id: {
        type: DataTypes.INTEGER,
        notNull: true,
      },
      installationId: {
        type: DataTypes.INTEGER,
        notNull: true,
      },
      repositoryOwner: {
        type: DataTypes.VARCHAR,
        notNull: true,
      },
      repositoryName: {
        type: DataTypes.VARCHAR,
        notNull: true,
      },
      pullRequestNumber: {
        type: DataTypes.INTEGER,
        notNull: true,
      },
      willMergeAt: {
        type: DataTypes.VARCHAR,
        notNull: true,
      },
    }
  );

  return schedules;
}

export type mergeSchedules = Infer<ReturnType<typeof newScheduleModel>>;
