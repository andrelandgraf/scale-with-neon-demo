import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const contactsTable = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role"), // Optional field
  company: text("company"), // Optional field
});
