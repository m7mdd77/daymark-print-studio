import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const visitors = sqliteTable("visitors", {
  id: text("id").primaryKey(),
  csrf: text("csrf").notNull(),
  view: text("view").notNull(),
  touched: integer("touched").notNull(),
});
export const work = sqliteTable(
  "work",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    kind: text("kind").notNull(),
    command: text("command").notNull(),
    status: text("status").notNull(),
    created: integer("created").notNull(),
    lease: integer("lease").notNull(),
    error: text("error"),
  },
  (table) => [
    index("work_owner").on(table.owner, table.created),
    index("work_status").on(table.status, table.created),
  ],
);
export const service = sqliteTable("service", {
  id: integer("id").primaryKey(),
  at: integer("at").notNull(),
});
