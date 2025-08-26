import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { contactsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/contacts - Fetch all contacts
export async function GET() {
  try {
    const contacts = await db.select().from(contactsTable);
    return NextResponse.json({ contacts });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 },
    );
  }
}

// POST /api/contacts - Create a new contact
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }

    const [newContact] = await db
      .insert(contactsTable)
      .values({ name, email })
      .returning();

    return NextResponse.json({ contact: newContact }, { status: 201 });
  } catch (error) {
    console.error("Error creating contact:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 },
    );
  }
}
