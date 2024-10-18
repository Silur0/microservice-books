// src/database.ts

import { DataSource } from "typeorm";
import { User } from "./Entities/User";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  port: 5432,
  username: "user",
  password: "pass",
  database: "books",
  entities: [User],
  synchronize: true, // Auto-creates the tables; set to false in production
});
