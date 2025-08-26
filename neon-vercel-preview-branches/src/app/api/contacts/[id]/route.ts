import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { contactsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// PUT /api/contacts/[id] - Update a contact
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { name, email } = body;
    const { id } = await params;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }

    const [updatedContact] = await db
      .update(contactsTable)
      .set({ name, email })
      .where(eq(contactsTable.id, id))
      .returning();

    if (!updatedContact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ contact: updatedContact });
  } catch (error) {
    console.error("Error updating contact:", error);
    return NextResponse.json(
      { error: "Failed to update contact" },
      { status: 500 },
    );
  }
}

// DELETE /api/contacts/[id] - Delete a contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deletedContact] = await db
      .delete(contactsTable)
      .where(eq(contactsTable.id, id))
      .returning();

    if (!deletedContact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Contact deleted successfully" });
  } catch (error) {
    console.error("Error deleting contact:", error);
    return NextResponse.json(
      { error: "Failed to delete contact" },
      { status: 500 },
    );
  }
}
